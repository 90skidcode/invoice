import type { DbClient } from '@counter/db';
import {
  audit_log,
  bank_accounts,
  credit_note_lines,
  credit_notes,
  invoice_lines,
  invoices,
  items,
  payment_allocations,
  payments,
  stock_ledger,
  tax_rates,
} from '@counter/db';
import type { CreateCreditNoteInput } from '@counter/schemas';
import { computeLineTax } from '@counter/tax';
import {
  type CreditNoteId,
  Decimal,
  addMoney,
  newId,
  newStockLedgerId,
  roundOff,
  sumMoney,
  toMoney,
} from '@counter/utils';
import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import type { RequestContext } from '../context.js';
import { BusinessError, NotFoundError } from '../errors.js';
import { getStockBalance } from './ledger.js';

export async function createCreditNote(
  db: DbClient,
  ctx: RequestContext,
  input: CreateCreditNoteInput,
) {
  return await db.transaction(async (trx) => {
    // 1. Load + validate original invoice.
    const [orig] = await trx
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.id, input.original_invoice_id),
          eq(invoices.org_id, ctx.org_id),
          isNull(invoices.deleted_at),
        ),
      )
      .for('update');
    if (!orig) throw new NotFoundError('Invoice', input.original_invoice_id);
    if (orig.status === 'voided')
      throw new BusinessError('Cannot create a credit note for a voided invoice');

    // Tax treatment is LOCKED to the original invoice (§2.5).
    const intraState = orig.is_intra_state;

    // 2. Validate return qty ≤ (original qty − already returned).
    const origLines = await trx
      .select()
      .from(invoice_lines)
      .where(eq(invoice_lines.invoice_id, orig.id));
    const origByLine = new Map(origLines.map((l) => [l.id, l]));

    const priorReturns = await trx
      .select({
        original_line_id: credit_note_lines.original_line_id,
        qty: sql<string>`coalesce(sum(${credit_note_lines.qty}), 0)`,
      })
      .from(credit_note_lines)
      .innerJoin(credit_notes, eq(credit_notes.id, credit_note_lines.credit_note_id))
      .where(
        and(
          eq(credit_notes.org_id, ctx.org_id),
          eq(credit_notes.original_invoice_id, orig.id),
          eq(credit_notes.status, 'posted'),
        ),
      )
      .groupBy(credit_note_lines.original_line_id);
    const returnedMap = new Map(priorReturns.map((r) => [r.original_line_id, Number(r.qty)]));

    // 3. Tax rates.
    const taxRateRows = await trx.select().from(tax_rates).where(eq(tax_rates.org_id, ctx.org_id));
    const taxRateMap = new Map(taxRateRows.map((r) => [r.id, r]));

    const cnId = newId<CreditNoteId>();
    const [cnt] = await trx
      .select({ n: sql<number>`count(*)` })
      .from(credit_notes)
      .where(eq(credit_notes.org_id, ctx.org_id));
    const cnNo = `CN-${String(Number(cnt?.n ?? 0) + 1).padStart(5, '0')}`;
    const now = new Date();

    type Computed = {
      input: (typeof input.lines)[number];
      tax: ReturnType<typeof computeLineTax>;
      itemName: string;
      hsn: string | null;
    };
    const computed: Computed[] = [];

    for (const line of input.lines) {
      const tr = taxRateMap.get(line.tax_rate_id);
      if (!tr) throw new NotFoundError('TaxRate', line.tax_rate_id);

      // Cap return qty if tied to an original line.
      if (line.original_line_id) {
        const ol = origByLine.get(line.original_line_id);
        if (ol) {
          const already = returnedMap.get(line.original_line_id) ?? 0;
          const remaining = Number(ol.qty) - already;
          if (Number(line.qty) > remaining + 1e-9) {
            throw new BusinessError(
              `Return qty ${line.qty} exceeds returnable ${remaining} for ${ol.item_name_snapshot}`,
            );
          }
        }
      }

      const [item] = await trx
        .select({
          name: items.name,
          hsn_code: items.hsn_code,
          track_inventory: items.track_inventory,
        })
        .from(items)
        .where(and(eq(items.id, line.item_id), eq(items.org_id, ctx.org_id)));
      if (!item) throw new NotFoundError('Item', line.item_id);

      const tax = computeLineTax({
        qty: line.qty,
        rate: line.rate,
        tax_rate: {
          id: tr.id,
          total_rate: String(tr.total_rate),
          cgst_rate: String(tr.cgst_rate),
          sgst_rate: String(tr.sgst_rate),
          igst_rate: String(tr.igst_rate),
          cess_rate: String(tr.cess_rate),
          effective_from: tr.effective_from,
          effective_to: tr.effective_to ?? null,
        },
        invoice_date: input.credit_note_date,
        is_intra_state: intraState,
        price_includes_tax: false,
      });
      computed.push({ input: line, tax, itemName: item.name, hsn: item.hsn_code ?? null });
    }

    // Calculate base totals (before invoice-level discount allocation)
    let taxableTotal = sumMoney(computed.map((c) => c.tax.taxable_amt));
    let cgstTotal = sumMoney(computed.map((c) => c.tax.cgst_amt));
    let sgstTotal = sumMoney(computed.map((c) => c.tax.sgst_amt));
    let igstTotal = sumMoney(computed.map((c) => c.tax.igst_amt));

    // Detect if this is a full return: compare returned amount to original subtotal
    const returnedAmount = sumMoney(computed.map((c) => c.tax.taxable_amt));
    const originalSubtotal = orig.subtotal ?? '0';
    const isFullReturn = new Decimal(returnedAmount).gte(new Decimal(originalSubtotal).times('0.99')); // 99% threshold for rounding

    // Allocate invoice-level discount from original invoice
    let cnInvoiceDiscount = '0';
    if (new Decimal(orig.invoice_discount_amt ?? '0').greaterThan(0)) {
      if (isFullReturn) {
        // Full return: reverse the entire invoice-level discount
        cnInvoiceDiscount = orig.invoice_discount_amt ?? '0';
      } else {
        // Partial return: allocate proportionally by taxable amount ratio
        const returnRatio = new Decimal(returnedAmount).dividedBy(new Decimal(originalSubtotal));
        cnInvoiceDiscount = returnRatio.times(new Decimal(orig.invoice_discount_amt ?? '0')).toFixed(2);
      }

      // Apply the allocated discount to taxable total and proportionally to taxes
      const discountD = new Decimal(cnInvoiceDiscount);
      if (discountD.greaterThan(0)) {
        const ratio = new Decimal(taxableTotal).minus(discountD).dividedBy(new Decimal(taxableTotal));
        taxableTotal = toMoney(new Decimal(taxableTotal).minus(discountD));
        cgstTotal = toMoney(new Decimal(cgstTotal).times(ratio).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
        sgstTotal = toMoney(new Decimal(sgstTotal).times(ratio).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
        igstTotal = toMoney(new Decimal(igstTotal).times(ratio).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
      }
    }

    const grandRaw = sumMoney([taxableTotal, cgstTotal, sgstTotal, igstTotal]);
    const roundOffAmt = roundOff(grandRaw);
    const grandTotal = addMoney(grandRaw, roundOffAmt);

    // 4. Header.
    await trx.insert(credit_notes).values({
      id: cnId,
      org_id: ctx.org_id,
      branch_id: input.branch_id,
      credit_note_no: cnNo,
      credit_note_date: input.credit_note_date,
      original_invoice_id: orig.id,
      original_invoice_no: orig.invoice_no,
      customer_id: orig.customer_id,
      customer_name_snapshot: orig.customer_name_snapshot,
      customer_gstin_snapshot: orig.customer_gstin_snapshot,
      place_of_supply: orig.place_of_supply,
      is_intra_state: intraState,
      reason: input.reason,
      reason_note: input.reason_note ?? null,
      refund_mode: input.refund_mode,
      subtotal: taxableTotal,
      taxable_total: taxableTotal,
      cgst_total: cgstTotal,
      sgst_total: sgstTotal,
      igst_total: igstTotal,
      round_off: roundOffAmt,
      grand_total: grandTotal,
      status: 'posted',
      created_by: ctx.user_id,
      updated_by: ctx.user_id,
    });

    // 5. Lines + stock restore.
    for (let i = 0; i < computed.length; i++) {
      const { input: line, tax, itemName, hsn } = computed[i]!;
      const lineId = crypto.randomUUID();

      await trx.insert(credit_note_lines).values({
        id: lineId,
        org_id: ctx.org_id,
        credit_note_id: cnId,
        line_no: i + 1,
        item_id: line.item_id,
        item_name_snapshot: itemName,
        hsn_code: hsn,
        qty: line.qty,
        unit_id: line.unit_id,
        rate: line.rate,
        taxable_amt: tax.taxable_amt,
        tax_rate_id: line.tax_rate_id,
        gst_rate: tax.gst_rate,
        cgst_amt: tax.cgst_amt,
        sgst_amt: tax.sgst_amt,
        igst_amt: tax.igst_amt,
        total: tax.total,
        batch_id: line.batch_id ?? null,
        location_id: line.location_id,
        restore_stock: line.restore_stock ?? true,
        original_line_id: line.original_line_id ?? null,
      });

      // Restore stock with a positive ledger entry (sales_return).
      if (line.restore_stock ?? true) {
        const prev = await getStockBalance(trx, ctx.org_id, line.item_id, line.location_id);
        const newBalance = new Decimal(prev).plus(line.qty).toFixed(3);
        await trx.insert(stock_ledger).values({
          id: newStockLedgerId(),
          org_id: ctx.org_id,
          item_id: line.item_id,
          location_id: line.location_id,
          batch_id: line.batch_id ?? null,
          txn_type: 'sales_return',
          txn_date: now,
          qty_in: line.qty,
          qty_out: '0',
          balance_qty: newBalance,
          rate: line.rate,
          value: tax.taxable_amt,
          ref_table: 'credit_note_lines',
          ref_id: lineId,
          note: `Return: ${input.reason}`,
          created_by: ctx.user_id,
          device_id: ctx.device_id,
        });
      }
    }

    // 6. Refund handling.
    if (input.refund_mode === 'adjust_ledger') {
      // Reduce the original invoice's outstanding (credit applied to ledger).
      const reduce = Decimal.min(new Decimal(orig.balance_due), new Decimal(grandTotal));
      if (reduce.greaterThan(0)) {
        const newPaid = new Decimal(orig.amount_paid).plus(reduce);
        const newDue = new Decimal(orig.balance_due).minus(reduce);
        await trx
          .update(invoices)
          .set({
            amount_paid: newPaid.toFixed(2),
            balance_due: newDue.toFixed(2),
            payment_status: newDue.lessThanOrEqualTo(0) ? 'paid' : 'partial',
            updated_at: now,
            updated_by: ctx.user_id,
            row_version: sql`${invoices.row_version} + 1`,
          })
          .where(eq(invoices.id, orig.id));
      }
    } else if (
      input.refund_mode === 'cash' ||
      input.refund_mode === 'upi' ||
      input.refund_mode === 'bank'
    ) {
      // Money returned to customer — outbound payment.
      const payId = crypto.randomUUID();
      await trx.insert(payments).values({
        id: payId,
        org_id: ctx.org_id,
        payment_no: `RFD-${cnNo}`,
        payment_date: input.credit_note_date,
        direction: 'outbound',
        party_type: 'customer',
        party_id: orig.customer_id,
        amount: grandTotal,
        mode: input.refund_mode,
        account_id: input.account_id ?? null,
        reference: cnNo,
        narration: `Refund for ${cnNo}`,
        created_by: ctx.user_id,
        updated_by: ctx.user_id,
      });
      await trx.insert(payment_allocations).values({
        id: crypto.randomUUID(),
        org_id: ctx.org_id,
        payment_id: payId,
        ref_table: 'credit_notes',
        ref_id: cnId,
        amount: grandTotal,
      });
      if (input.account_id) {
        await trx
          .update(bank_accounts)
          .set({
            current_balance: sql`${bank_accounts.current_balance} - ${grandTotal}`,
            updated_at: now,
          })
          .where(and(eq(bank_accounts.id, input.account_id), eq(bank_accounts.org_id, ctx.org_id)));
      }
    }
    // 'replacement' → no financial movement (a fresh invoice is raised separately).

    // 7. Update parent invoice return status.
    const allReturns = await trx
      .select({
        original_line_id: credit_note_lines.original_line_id,
        qty: sql<string>`coalesce(sum(${credit_note_lines.qty}),0)`,
      })
      .from(credit_note_lines)
      .innerJoin(credit_notes, eq(credit_notes.id, credit_note_lines.credit_note_id))
      .where(
        and(
          eq(credit_notes.org_id, ctx.org_id),
          eq(credit_notes.original_invoice_id, orig.id),
          eq(credit_notes.status, 'posted'),
        ),
      )
      .groupBy(credit_note_lines.original_line_id);
    const retNow = new Map(allReturns.map((r) => [r.original_line_id, Number(r.qty)]));
    const fullyReturned = origLines.every(
      (ol) => (retNow.get(ol.id) ?? 0) >= Number(ol.qty) - 1e-9,
    );
    const anyReturned = allReturns.some((r) => Number(r.qty) > 0);
    if (orig.status !== 'voided') {
      await trx
        .update(invoices)
        .set({
          status: fullyReturned
            ? 'fully_returned'
            : anyReturned
              ? 'partially_returned'
              : orig.status,
          updated_at: now,
          updated_by: ctx.user_id,
        })
        .where(eq(invoices.id, orig.id));
    }

    // 8. Audit.
    await trx.insert(audit_log).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      ip: ctx.ip,
      entity_table: 'credit_notes',
      entity_id: cnId,
      action: 'create',
      before_json: null,
      after_json: { credit_note_no: cnNo, original: orig.invoice_no, grand_total: grandTotal },
    });

    return {
      id: cnId,
      credit_note_no: cnNo,
      grand_total: grandTotal,
      refund_mode: input.refund_mode,
    };
  });
}

export async function listCreditNotes(
  db: DbClient,
  ctx: RequestContext,
  params: { limit: number; cursor?: string | undefined },
) {
  const conditions = [eq(credit_notes.org_id, ctx.org_id), isNull(credit_notes.deleted_at)];
  if (params.cursor) conditions.push(lt(credit_notes.id, params.cursor));
  const rows = await db
    .select({
      id: credit_notes.id,
      credit_note_no: credit_notes.credit_note_no,
      credit_note_date: credit_notes.credit_note_date,
      original_invoice_no: credit_notes.original_invoice_no,
      customer_name: credit_notes.customer_name_snapshot,
      grand_total: credit_notes.grand_total,
      refund_mode: credit_notes.refund_mode,
      status: credit_notes.status,
    })
    .from(credit_notes)
    .where(and(...conditions))
    .orderBy(desc(credit_notes.id))
    .limit(params.limit + 1);
  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;
  return {
    data: page,
    page: {
      limit: params.limit,
      next_cursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      has_more: hasMore,
    },
  };
}

export async function getCreditNoteById(db: DbClient, ctx: RequestContext, id: string) {
  const [cn] = await db
    .select()
    .from(credit_notes)
    .where(
      and(
        eq(credit_notes.id, id),
        eq(credit_notes.org_id, ctx.org_id),
        isNull(credit_notes.deleted_at),
      ),
    );
  if (!cn) throw new NotFoundError('CreditNote', id);
  const lines = await db
    .select()
    .from(credit_note_lines)
    .where(eq(credit_note_lines.credit_note_id, id))
    .orderBy(credit_note_lines.line_no);
  return { ...cn, lines };
}
