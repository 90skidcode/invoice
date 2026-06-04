import type { DbClient } from '@counter/db';
import {
  audit_log,
  customers,
  invoice_lines,
  invoice_series,
  invoices,
  items,
  organizations,
  payment_allocations,
  payments,
  period_locks,
  stock_ledger,
  tax_rates,
} from '@counter/db';
import type { CreateInvoiceInput } from '@counter/schemas';
import { computeLineTax, isIntraState } from '@counter/tax';
import {
  Decimal,
  addMoney,
  newInvoiceId,
  newInvoiceLineId,
  newPaymentId,
  newStockLedgerId,
  roundOff,
  sumMoney,
  toMoney,
} from '@counter/utils';
import { amountInWords } from '@counter/utils';
import { and, desc, eq, gte, isNull, lt, lte, sql } from 'drizzle-orm';
import type { RequestContext } from '../context.js';
import {
  BusinessError,
  ConflictError,
  DuplicateError,
  NotFoundError,
  PeriodLockedError,
} from '../errors.js';

export async function createInvoice(db: DbClient, ctx: RequestContext, input: CreateInvoiceInput) {
  return await db.transaction(async (trx) => {
    // 1. Period lock check
    const locks = await trx
      .select()
      .from(period_locks)
      .where(and(eq(period_locks.org_id, ctx.org_id), isNull(period_locks.unlocked_at)))
      .orderBy(period_locks.lock_through_date);

    const activeLock = locks.find((l) => input.invoice_date <= l.lock_through_date);
    if (activeLock) {
      throw new PeriodLockedError(`Period locked through ${activeLock.lock_through_date}`);
    }

    // 2. Get & lock invoice series (gap-free number assignment §1.11)
    const [series] = await trx
      .select()
      .from(invoice_series)
      .where(
        and(
          eq(invoice_series.id, input.series_id),
          eq(invoice_series.org_id, ctx.org_id),
          eq(invoice_series.is_active, true),
        ),
      )
      .for('update');

    if (!series) throw new NotFoundError('InvoiceSeries', input.series_id);

    const invoiceNumber = buildInvoiceNumber(series);

    await trx
      .update(invoice_series)
      .set({ next_number: series.next_number + 1, updated_at: new Date() })
      .where(eq(invoice_series.id, series.id));

    // 3. Fetch tax rates for all line items
    const taxRateRows = await trx.select().from(tax_rates).where(eq(tax_rates.org_id, ctx.org_id));

    const taxRateMap = new Map(taxRateRows.map((r) => [r.id, r]));

    // 4. Determine intra/inter state from the org's registered state vs place of supply
    const [org] = await trx
      .select({ state_code: organizations.state_code })
      .from(organizations)
      .where(eq(organizations.id, ctx.org_id));
    if (!org) throw new NotFoundError('Organization', ctx.org_id);

    const intraState = isIntraState(org.state_code, input.place_of_supply);

    // 5. Compute line taxes
    type ComputedLine = {
      input: (typeof input.lines)[0];
      taxResult: ReturnType<typeof computeLineTax>;
      taxRate: (typeof taxRateRows)[0];
    };

    const computedLines: ComputedLine[] = [];
    for (const line of input.lines) {
      const taxRate = taxRateMap.get(line.tax_rate_id);
      if (!taxRate) throw new NotFoundError('TaxRate', line.tax_rate_id);

      const taxResult = computeLineTax({
        qty: line.qty,
        rate: line.rate,
        discount_amt: line.discount_amt,
        discount_pct: line.discount_pct,
        tax_rate: {
          id: taxRate.id,
          total_rate: String(taxRate.total_rate),
          cgst_rate: String(taxRate.cgst_rate),
          sgst_rate: String(taxRate.sgst_rate),
          igst_rate: String(taxRate.igst_rate),
          cess_rate: String(taxRate.cess_rate),
          effective_from: taxRate.effective_from,
          effective_to: taxRate.effective_to ?? null,
        },
        invoice_date: input.invoice_date,
        is_intra_state: intraState,
        price_includes_tax: false,
        is_free: line.is_free ?? false,
      });

      computedLines.push({ input: line, taxResult, taxRate });
    }

    // 6. Compute invoice totals
    const subtotal = sumMoney(computedLines.map((l) => l.taxResult.taxable_amt));
    const discountTotal = sumMoney(computedLines.map((l) => l.taxResult.discount_amt));
    const taxableTotal = subtotal;
    const cgstTotal = sumMoney(computedLines.map((l) => l.taxResult.cgst_amt));
    const sgstTotal = sumMoney(computedLines.map((l) => l.taxResult.sgst_amt));
    const igstTotal = sumMoney(computedLines.map((l) => l.taxResult.igst_amt));
    const cessTotal = sumMoney(computedLines.map((l) => l.taxResult.cess_amt));
    const grandTotalRaw = sumMoney([taxableTotal, cgstTotal, sgstTotal, igstTotal, cessTotal]);
    const roundOffAmt = roundOff(grandTotalRaw);
    const grandTotal = addMoney(grandTotalRaw, roundOffAmt);

    // 7. Payments
    const amountPaid = sumMoney((input.payments ?? []).map((p) => p.amount));
    const balanceDue = addMoney(grandTotal, `-${amountPaid}`);

    const paymentStatus = new Decimal(balanceDue).isZero()
      ? 'paid'
      : new Decimal(amountPaid).isZero()
        ? 'unpaid'
        : 'partial';

    // 8. Fetch customer snapshot + enforce credit limit (§ credit limit rule)
    let customerNameSnapshot: string | null = null;
    let customerGstinSnapshot: string | null = null;
    let billingAddressSnapshot: any = null;
    if (input.customer_id) {
      const [cust] = await trx
        .select({
          name: customers.name,
          gstin: customers.gstin,
          billing_address: customers.billing_address,
          credit_limit: customers.credit_limit,
          block_on_limit_breach: customers.block_on_limit_breach,
          opening_balance: customers.opening_balance,
          status: customers.status,
        })
        .from(customers)
        .where(
          and(
            eq(customers.id, input.customer_id),
            eq(customers.org_id, ctx.org_id),
            isNull(customers.deleted_at),
          ),
        );
      if (!cust) throw new NotFoundError('Customer', input.customer_id);
      if (cust.status === 'Blocked') {
        throw new BusinessError('Customer is blocked. Contact admin.');
      }
      customerNameSnapshot = cust.name;
      customerGstinSnapshot = cust.gstin ?? null;
      billingAddressSnapshot = cust.billing_address ?? null;

      // Credit limit: existing outstanding + this invoice's unpaid balance must
      // not exceed the limit (only when the customer is flagged to block).
      const creditLimit = new Decimal(cust.credit_limit ?? '0');
      const newBalanceDue = new Decimal(balanceDue);
      if (
        cust.block_on_limit_breach &&
        creditLimit.greaterThan(0) &&
        newBalanceDue.greaterThan(0)
      ) {
        const [outstandingRow] = await trx
          .select({
            total: sql<string>`coalesce(sum(${invoices.balance_due}), 0)`,
          })
          .from(invoices)
          .where(
            and(
              eq(invoices.org_id, ctx.org_id),
              eq(invoices.customer_id, input.customer_id),
              isNull(invoices.deleted_at),
            ),
          );
        const existingOutstanding = new Decimal(cust.opening_balance ?? '0').plus(
          outstandingRow?.total ?? '0',
        );
        const projected = existingOutstanding.plus(newBalanceDue);
        if (projected.greaterThan(creditLimit)) {
          throw new BusinessError(
            `Credit limit ₹${creditLimit.toFixed(2)} would be exceeded (outstanding ₹${existingOutstanding.toFixed(2)} + this bill ₹${newBalanceDue.toFixed(2)}).`,
          );
        }
      }
    }

    // 9. Build invoice hash (simplified)
    const invoiceId = newInvoiceId();
    const invoiceHash = await buildHash(
      `${ctx.org_id}:${invoiceNumber}:${grandTotal}:${input.invoice_date}`,
    );

    // 10. Insert invoice header
    const now = new Date();
    await trx.insert(invoices).values({
      id: invoiceId,
      org_id: ctx.org_id,
      branch_id: input.branch_id,
      series_id: input.series_id,
      invoice_no: invoiceNumber,
      invoice_date: input.invoice_date,
      customer_id: input.customer_id ?? null,
      customer_name_snapshot: customerNameSnapshot,
      customer_gstin_snapshot: customerGstinSnapshot,
      billing_address_snapshot: billingAddressSnapshot,
      place_of_supply: input.place_of_supply,
      is_intra_state: intraState,
      salesperson_id: input.salesperson_id ?? null,
      reference_no: input.reference_no ?? null,
      subtotal,
      discount_total: discountTotal,
      taxable_total: taxableTotal,
      cgst_total: cgstTotal,
      sgst_total: sgstTotal,
      igst_total: igstTotal,
      cess_total: cessTotal,
      other_charges: '0.00',
      round_off: roundOffAmt,
      grand_total: grandTotal,
      amount_paid: amountPaid,
      balance_due: balanceDue,
      status: 'posted',
      payment_status: paymentStatus,
      invoice_hash: invoiceHash,
      notes: input.notes ?? null,
      created_by: ctx.user_id,
      updated_by: ctx.user_id,
    });

    // 11. Insert invoice lines + stock ledger entries
    for (let i = 0; i < computedLines.length; i++) {
      const { input: lineInput, taxResult, taxRate } = computedLines[i]!;
      const lineId = newInvoiceLineId();

      // Fetch item snapshot
      const [item] = await trx
        .select({
          sku: items.sku,
          name: items.name,
          hsn_code: items.hsn_code,
          track_inventory: items.track_inventory,
          allow_negative_stock: items.allow_negative_stock,
        })
        .from(items)
        .where(and(eq(items.id, lineInput.item_id), eq(items.org_id, ctx.org_id)));

      if (!item) throw new NotFoundError('Item', lineInput.item_id);

      await trx.insert(invoice_lines).values({
        id: lineId,
        org_id: ctx.org_id,
        invoice_id: invoiceId,
        line_no: i + 1,
        item_id: lineInput.item_id,
        item_sku_snapshot: item.sku,
        item_name_snapshot: item.name,
        description: lineInput.description ?? null,
        hsn_code: item.hsn_code ?? null,
        qty: lineInput.qty,
        unit_id: lineInput.unit_id,
        rate: lineInput.rate,
        mrp: lineInput.mrp ?? null,
        discount_pct: lineInput.discount_pct ?? '0',
        discount_amt: taxResult.discount_amt,
        taxable_amt: taxResult.taxable_amt,
        tax_rate_id: lineInput.tax_rate_id,
        gst_rate: taxResult.gst_rate,
        cgst_amt: taxResult.cgst_amt,
        sgst_amt: taxResult.sgst_amt,
        igst_amt: taxResult.igst_amt,
        cess_amt: taxResult.cess_amt,
        total: taxResult.total,
        batch_id: lineInput.batch_id ?? null,
        location_id: lineInput.location_id,
        is_free: lineInput.is_free ?? false,
      });

      // Stock ledger (append-only) — only for inventory-tracked items
      if (item.track_inventory && !(lineInput.is_free ?? false)) {
        const prevBalance = await getRunningBalance(
          trx,
          ctx.org_id,
          lineInput.item_id,
          lineInput.location_id,
        );
        const newBalanceD = new Decimal(prevBalance).minus(new Decimal(lineInput.qty));

        // §BUSINESS_RULE_VIOLATION — block overselling unless the item permits it.
        if (newBalanceD.isNegative() && !item.allow_negative_stock) {
          throw new BusinessError(
            `Insufficient stock for ${item.name}: available ${prevBalance}, requested ${lineInput.qty}`,
          );
        }
        const newBalance = newBalanceD.toFixed(3);

        await trx.insert(stock_ledger).values({
          id: newStockLedgerId(),
          org_id: ctx.org_id,
          item_id: lineInput.item_id,
          location_id: lineInput.location_id,
          batch_id: lineInput.batch_id ?? null,
          txn_type: 'sale',
          txn_date: now,
          qty_in: '0',
          qty_out: lineInput.qty,
          balance_qty: newBalance,
          rate: lineInput.rate,
          value: taxResult.taxable_amt,
          ref_table: 'invoice_lines',
          ref_id: lineId,
          created_by: ctx.user_id,
          device_id: ctx.device_id,
        });
      }
    }

    // 12. Payments
    if (input.payments && input.payments.length > 0) {
      const paymentId = newPaymentId();
      const totalPayment = sumMoney(input.payments.map((p) => p.amount));

      await trx.insert(payments).values({
        id: paymentId,
        org_id: ctx.org_id,
        payment_no: `PAY-${invoiceNumber}`,
        payment_date: input.invoice_date,
        direction: 'inbound',
        party_type: 'customer',
        party_id: input.customer_id ?? null,
        amount: totalPayment,
        mode: input.payments[0]!.mode,
        account_id: input.payments[0]?.account_id ?? null,
        reference: input.payments[0]?.reference ?? null,
        created_by: ctx.user_id,
        updated_by: ctx.user_id,
      });

      await trx.insert(payment_allocations).values({
        id: crypto.randomUUID(),
        org_id: ctx.org_id,
        payment_id: paymentId,
        invoice_id: invoiceId,
        amount: totalPayment,
      });
    }

    // 13. Audit log (§1.8)
    await trx.insert(audit_log).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      ip: ctx.ip,
      entity_table: 'invoices',
      entity_id: invoiceId,
      action: 'create',
      before_json: null,
      after_json: { invoice_no: invoiceNumber, grand_total: grandTotal },
    });

    return {
      id: invoiceId,
      invoice_no: invoiceNumber,
      grand_total: grandTotal,
      invoice_hash: invoiceHash,
      amount_in_words: amountInWords(grandTotal),
    };
  });
}

export async function voidInvoice(
  db: DbClient,
  ctx: RequestContext,
  invoiceId: string,
  reason: string,
) {
  return await db.transaction(async (trx) => {
    const [invoice] = await trx
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.id, invoiceId),
          eq(invoices.org_id, ctx.org_id),
          isNull(invoices.deleted_at),
        ),
      )
      .for('update');

    if (!invoice) throw new NotFoundError('Invoice', invoiceId);
    if (invoice.status === 'voided') throw new BusinessError('Invoice is already voided');

    const now = new Date();

    await trx
      .update(invoices)
      .set({
        status: 'voided',
        void_reason: reason,
        voided_by: ctx.user_id,
        voided_at: now,
        updated_at: now,
        updated_by: ctx.user_id,
        row_version: invoice.row_version + 1,
      })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.row_version, invoice.row_version)));

    // Reverse stock ledger entries
    const lines = await trx
      .select()
      .from(invoice_lines)
      .where(eq(invoice_lines.invoice_id, invoiceId));

    for (const line of lines) {
      // Compensating entry: add the sold qty back, advancing the running balance.
      const prevBalance = await getRunningBalance(trx, ctx.org_id, line.item_id, line.location_id);
      const newBalance = new Decimal(prevBalance).plus(new Decimal(line.qty)).toFixed(3);

      await trx.insert(stock_ledger).values({
        id: newStockLedgerId(),
        org_id: ctx.org_id,
        item_id: line.item_id,
        location_id: line.location_id,
        batch_id: line.batch_id ?? null,
        txn_type: 'sale_void',
        txn_date: now,
        qty_in: line.qty,
        qty_out: '0',
        balance_qty: newBalance,
        rate: line.rate,
        value: line.taxable_amt,
        ref_table: 'invoices',
        ref_id: invoiceId,
        note: `Void: ${reason}`,
        created_by: ctx.user_id,
      });
    }

    // Audit log
    await trx.insert(audit_log).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      ip: ctx.ip,
      entity_table: 'invoices',
      entity_id: invoiceId,
      action: 'void',
      before_json: { status: invoice.status },
      after_json: { status: 'voided', reason },
      note: reason,
    });

    return { ok: true };
  });
}

// Transaction handle type, extracted from the Drizzle client.
type Trx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

/**
 * Current stock for (org, item, location), derived authoritatively from the
 * append-only ledger as SUM(qty_in) - SUM(qty_out) (§1.2). Computing from the
 * sum (rather than trusting the last row's denormalized balance_qty) is
 * self-healing — any stale balance_qty value never propagates forward.
 * Returns "0" if the item has never moved at that location.
 */
async function getRunningBalance(
  trx: Trx,
  orgId: string,
  itemId: string,
  locationId: string,
): Promise<string> {
  const [agg] = await trx
    .select({
      balance: sql<string>`coalesce(sum(${stock_ledger.qty_in}) - sum(${stock_ledger.qty_out}), 0)`,
    })
    .from(stock_ledger)
    .where(
      and(
        eq(stock_ledger.org_id, orgId),
        eq(stock_ledger.item_id, itemId),
        eq(stock_ledger.location_id, locationId),
      ),
    );

  return agg?.balance ?? '0';
}

function buildInvoiceNumber(series: {
  prefix: string | null;
  suffix: string | null;
  next_number: number;
  number_padding: number;
}): string {
  const num = String(series.next_number).padStart(series.number_padding, '0');
  return `${series.prefix ?? ''}${num}${series.suffix ?? ''}`;
}

async function buildHash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function getInvoiceById(db: DbClient, ctx: RequestContext, invoiceId: string) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(
      and(eq(invoices.id, invoiceId), eq(invoices.org_id, ctx.org_id), isNull(invoices.deleted_at)),
    );
  if (!invoice) throw new NotFoundError('Invoice', invoiceId);

  const lines = await db
    .select()
    .from(invoice_lines)
    .where(eq(invoice_lines.invoice_id, invoiceId))
    .orderBy(invoice_lines.line_no);

  return { ...invoice, lines, amount_in_words: amountInWords(String(invoice.grand_total)) };
}

export async function listInvoices(
  db: DbClient,
  ctx: RequestContext,
  params: {
    date_from?: string | undefined;
    date_to?: string | undefined;
    customer_id?: string | undefined;
    status?: string | undefined;
    limit: number;
    cursor?: string | undefined;
  },
) {
  const conditions = [eq(invoices.org_id, ctx.org_id), isNull(invoices.deleted_at)];
  if (params.date_from) conditions.push(gte(invoices.invoice_date, params.date_from));
  if (params.date_to) conditions.push(lte(invoices.invoice_date, params.date_to));
  if (params.customer_id) conditions.push(eq(invoices.customer_id, params.customer_id));
  if (params.status) conditions.push(eq(invoices.status, params.status));
  if (params.cursor) conditions.push(lt(invoices.id, params.cursor));

  const rows = await db
    .select({
      id: invoices.id,
      invoice_no: invoices.invoice_no,
      invoice_date: invoices.invoice_date,
      customer_name: invoices.customer_name_snapshot,
      grand_total: invoices.grand_total,
      balance_due: invoices.balance_due,
      status: invoices.status,
      payment_status: invoices.payment_status,
      invoice_hash: invoices.invoice_hash,
      customer_id: invoices.customer_id,
    })
    .from(invoices)
    .where(and(...conditions))
    .orderBy(desc(invoices.id))
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

/** Minimal public verification data by invoice hash (no auth, no PII beyond name). */
export async function verifyInvoiceByHash(db: DbClient, hash: string) {
  const [invoice] = await db
    .select({
      invoice_no: invoices.invoice_no,
      invoice_date: invoices.invoice_date,
      grand_total: invoices.grand_total,
      customer_name: invoices.customer_name_snapshot,
      status: invoices.status,
    })
    .from(invoices)
    .where(eq(invoices.invoice_hash, hash));

  if (!invoice) return { verified: false as const };
  return {
    verified: true as const,
    invoice_no: invoice.invoice_no,
    date: invoice.invoice_date,
    total: String(invoice.grand_total),
    customer: invoice.customer_name,
    status: invoice.status,
  };
}
