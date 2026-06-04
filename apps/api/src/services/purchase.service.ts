import { eq, and, isNull, desc, lt, sql } from 'drizzle-orm';
import type { DbClient } from '@counter/db';
import {
  purchase_invoices,
  purchase_invoice_lines,
  stock_ledger,
  batches,
  items,
  vendors,
  tax_rates,
  organizations,
  invoice_series,
} from '@counter/db';
import type { CreatePurchaseInvoiceInput } from '@counter/schemas';
import { computeLineTax, isIntraState } from '@counter/tax';
import {
  Decimal,
  addMoney,
  sumMoney,
  roundOff,
  newId,
  type PurchaseInvoiceId,
} from '@counter/utils';
import { getStockBalance } from './ledger.js';
import type { RequestContext } from '../context.js';
import { NotFoundError, BusinessError, DuplicateError } from '../errors.js';

export async function createPurchaseInvoice(
  db: DbClient,
  ctx: RequestContext,
  input: CreatePurchaseInvoiceInput,
) {
  return await db.transaction(async (trx) => {
    // 1. Duplicate guard — same vendor invoice no. for this vendor (§duplicate).
    const dup = await trx
      .select({ id: purchase_invoices.id, voucher_no: purchase_invoices.voucher_no })
      .from(purchase_invoices)
      .where(
        and(
          eq(purchase_invoices.org_id, ctx.org_id),
          eq(purchase_invoices.vendor_id, input.vendor_id),
          eq(purchase_invoices.vendor_invoice_no, input.vendor_invoice_no),
          isNull(purchase_invoices.deleted_at),
        ),
      )
      .limit(1);
    if (dup[0]) {
      throw new DuplicateError(
        `Vendor invoice "${input.vendor_invoice_no}" already entered as voucher ${dup[0].voucher_no}`,
      );
    }

    // 2. Vendor + org state.
    const [vendor] = await trx
      .select({ id: vendors.id, name: vendors.name, credit_days: vendors.credit_days })
      .from(vendors)
      .where(
        and(
          eq(vendors.id, input.vendor_id),
          eq(vendors.org_id, ctx.org_id),
          isNull(vendors.deleted_at),
        ),
      );
    if (!vendor) throw new NotFoundError('Vendor', input.vendor_id);

    const [org] = await trx
      .select({ state_code: organizations.state_code })
      .from(organizations)
      .where(eq(organizations.id, ctx.org_id));
    const intraState = isIntraState(org?.state_code ?? '', input.place_of_supply);

    // 3. Voucher number — use a purchase series if present, else PUR-{seq}.
    const [series] = await trx
      .select()
      .from(invoice_series)
      .where(
        and(
          eq(invoice_series.org_id, ctx.org_id),
          eq(invoice_series.document_type, 'purchase'),
          eq(invoice_series.is_active, true),
        ),
      )
      .for('update');

    let voucherNo: string;
    let seriesId: string | null = null;
    if (series) {
      voucherNo = `${series.prefix ?? ''}${String(series.next_number).padStart(series.number_padding, '0')}${series.suffix ?? ''}`;
      seriesId = series.id;
      await trx
        .update(invoice_series)
        .set({ next_number: series.next_number + 1, updated_at: new Date() })
        .where(eq(invoice_series.id, series.id));
    } else {
      const [cnt] = await trx
        .select({ n: sql<number>`count(*)` })
        .from(purchase_invoices)
        .where(eq(purchase_invoices.org_id, ctx.org_id));
      voucherNo = `PUR-${String(Number(cnt?.n ?? 0) + 1).padStart(4, '0')}`;
    }

    // 4. Tax rates.
    const taxRateRows = await trx
      .select()
      .from(tax_rates)
      .where(eq(tax_rates.org_id, ctx.org_id));
    const taxRateMap = new Map(taxRateRows.map((r) => [r.id, r]));

    // 5. Compute line taxes.
    type Computed = {
      input: (typeof input.lines)[number];
      tax: ReturnType<typeof computeLineTax>;
    };
    const computed: Computed[] = [];
    for (const line of input.lines) {
      const tr = taxRateMap.get(line.tax_rate_id);
      if (!tr) throw new NotFoundError('TaxRate', line.tax_rate_id);
      const tax = computeLineTax({
        qty: line.qty,
        rate: line.rate,
        discount_pct: line.discount_pct,
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
        invoice_date: input.voucher_date,
        is_intra_state: intraState,
        price_includes_tax: false,
      });
      computed.push({ input: line, tax });
    }

    // 6. Totals.
    const taxableTotal = sumMoney(computed.map((c) => c.tax.taxable_amt));
    const cgstTotal = sumMoney(computed.map((c) => c.tax.cgst_amt));
    const sgstTotal = sumMoney(computed.map((c) => c.tax.sgst_amt));
    const igstTotal = sumMoney(computed.map((c) => c.tax.igst_amt));
    const discountTotal = sumMoney(computed.map((c) => c.tax.discount_amt));
    const grandRaw = sumMoney([taxableTotal, cgstTotal, sgstTotal, igstTotal]);
    const roundOffAmt = roundOff(grandRaw);
    const grandTotal = addMoney(grandRaw, roundOffAmt);

    // 7. Header.
    const purchaseId = newId<PurchaseInvoiceId>();
    const now = new Date();
    // due_date = vendor invoice date + vendor credit days.
    const dueDateStr =
      vendor.credit_days > 0
        ? new Date(
            new Date(`${input.vendor_invoice_date}T00:00:00Z`).getTime() +
              vendor.credit_days * 86_400_000,
          )
            .toISOString()
            .slice(0, 10)
        : null;

    await trx.insert(purchase_invoices).values({
      id: purchaseId,
      org_id: ctx.org_id,
      branch_id: input.branch_id,
      series_id: seriesId,
      voucher_no: voucherNo,
      voucher_date: input.voucher_date,
      vendor_id: input.vendor_id,
      vendor_name_snapshot: vendor.name,
      vendor_invoice_no: input.vendor_invoice_no,
      vendor_invoice_date: input.vendor_invoice_date,
      place_of_supply: input.place_of_supply,
      is_intra_state: intraState,
      reverse_charge: input.reverse_charge,
      receive_location_id: input.receive_location_id,
      subtotal: taxableTotal,
      discount_total: discountTotal,
      taxable_total: taxableTotal,
      cgst_total: cgstTotal,
      sgst_total: sgstTotal,
      igst_total: igstTotal,
      other_charges: '0.00',
      round_off: roundOffAmt,
      grand_total: grandTotal,
      amount_paid: '0.00',
      balance_due: grandTotal,
      payment_status: 'unpaid',
      due_date: dueDateStr,
      notes: input.notes ?? null,
      status: 'posted',
      created_by: ctx.user_id,
      updated_by: ctx.user_id,
    });

    // 8. Lines + batches + stock IN + moving-average cost.
    for (let i = 0; i < computed.length; i++) {
      const { input: line, tax } = computed[i]!;
      const lineId = crypto.randomUUID();
      const locationId = line.location_id ?? input.receive_location_id;

      const [item] = await trx
        .select({
          name: items.name,
          hsn_code: items.hsn_code,
          is_batched: items.is_batched,
          track_inventory: items.track_inventory,
          purchase_price: items.purchase_price,
        })
        .from(items)
        .where(and(eq(items.id, line.item_id), eq(items.org_id, ctx.org_id)));
      if (!item) throw new NotFoundError('Item', line.item_id);

      // Batch (if batched + batch no given).
      let batchId: string | null = null;
      if (item.is_batched && line.batch_no) {
        batchId = crypto.randomUUID();
        await trx.insert(batches).values({
          id: batchId,
          org_id: ctx.org_id,
          item_id: line.item_id,
          batch_no: line.batch_no,
          mfg_date: line.mfg_date ?? null,
          expiry_date: line.expiry_date ?? null,
          mrp: line.mrp ?? null,
          cost: line.rate,
          status: 'active',
          origin_type: 'purchase',
          origin_ref_id: lineId,
          created_by: ctx.user_id,
        });
      }

      await trx.insert(purchase_invoice_lines).values({
        id: lineId,
        org_id: ctx.org_id,
        purchase_invoice_id: purchaseId,
        line_no: i + 1,
        item_id: line.item_id,
        item_name_snapshot: item.name,
        hsn_code: item.hsn_code ?? null,
        qty: line.qty,
        free_qty: line.free_qty ?? '0',
        unit_id: line.unit_id,
        rate: line.rate,
        mrp: line.mrp ?? null,
        discount_pct: line.discount_pct ?? '0',
        discount_amt: tax.discount_amt,
        taxable_amt: tax.taxable_amt,
        tax_rate_id: line.tax_rate_id,
        gst_rate: tax.gst_rate,
        cgst_amt: tax.cgst_amt,
        sgst_amt: tax.sgst_amt,
        igst_amt: tax.igst_amt,
        total: tax.total,
        batch_no: line.batch_no ?? null,
        batch_id: batchId,
        mfg_date: line.mfg_date ?? null,
        expiry_date: line.expiry_date ?? null,
        location_id: locationId,
        update_item_cost: line.update_item_cost ?? true,
      });

      if (item.track_inventory) {
        const totalInQty = new Decimal(line.qty).plus(line.free_qty ?? '0');
        const prevBalance = await getStockBalance(trx, ctx.org_id, line.item_id, locationId);
        const newBalance = new Decimal(prevBalance).plus(totalInQty).toFixed(3);

        await trx.insert(stock_ledger).values({
          id: crypto.randomUUID(),
          org_id: ctx.org_id,
          item_id: line.item_id,
          location_id: locationId,
          batch_id: batchId,
          txn_type: 'purchase',
          txn_date: now,
          qty_in: totalInQty.toFixed(3),
          qty_out: '0',
          balance_qty: newBalance,
          rate: line.rate,
          value: tax.taxable_amt,
          ref_table: 'purchase_invoice_lines',
          ref_id: lineId,
          created_by: ctx.user_id,
          device_id: ctx.device_id,
        });

        // Moving-average cost (§5.6): only on paid qty (not free).
        if ((line.update_item_cost ?? true) && new Decimal(line.qty).greaterThan(0)) {
          const curQty = new Decimal(prevBalance);
          const curAvg = new Decimal(item.purchase_price ?? '0');
          const inQty = new Decimal(line.qty);
          const inRate = new Decimal(line.rate);
          const denom = curQty.plus(inQty);
          const newAvg = denom.greaterThan(0)
            ? curQty.times(curAvg).plus(inQty.times(inRate)).dividedBy(denom)
            : inRate;
          await trx
            .update(items)
            .set({
              purchase_price: newAvg.toFixed(2),
              updated_at: new Date(),
              updated_by: ctx.user_id,
              row_version: sql`${items.row_version} + 1`,
            })
            .where(eq(items.id, line.item_id));
        }
      }
    }

    return {
      id: purchaseId,
      voucher_no: voucherNo,
      grand_total: grandTotal,
      vendor_invoice_no: input.vendor_invoice_no,
    };
  });
}

export async function listPurchases(
  db: DbClient,
  ctx: RequestContext,
  params: { vendor_id?: string | undefined; limit: number; cursor?: string | undefined },
) {
  const conditions = [eq(purchase_invoices.org_id, ctx.org_id), isNull(purchase_invoices.deleted_at)];
  if (params.vendor_id) conditions.push(eq(purchase_invoices.vendor_id, params.vendor_id));
  if (params.cursor) conditions.push(lt(purchase_invoices.id, params.cursor));

  const rows = await db
    .select({
      id: purchase_invoices.id,
      voucher_no: purchase_invoices.voucher_no,
      voucher_date: purchase_invoices.voucher_date,
      vendor_name: purchase_invoices.vendor_name_snapshot,
      vendor_invoice_no: purchase_invoices.vendor_invoice_no,
      grand_total: purchase_invoices.grand_total,
      balance_due: purchase_invoices.balance_due,
      payment_status: purchase_invoices.payment_status,
      status: purchase_invoices.status,
    })
    .from(purchase_invoices)
    .where(and(...conditions))
    .orderBy(desc(purchase_invoices.id))
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
