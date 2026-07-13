import type { DbClient } from '@counter/db';
import {
  batches,
  categories,
  credit_notes,
  customers,
  invoice_lines,
  invoices,
  items,
  locations,
  payments,
  production_order_lines,
  production_orders,
  purchase_invoice_lines,
  purchase_invoices,
  stock_ledger,
  users,
  vendors,
} from '@counter/db';
import { Decimal } from '@counter/utils';
import { and, desc, eq, gte, isNull, lt, lte, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { RequestContext } from '../context.js';

export type PageParams = { limit: number; offset: number };
export type PageMeta = { total: number; limit: number; offset: number };

const POSTED = (orgId: string) =>
  and(eq(invoices.org_id, orgId), eq(invoices.status, 'posted'), isNull(invoices.deleted_at));

// ─── Sales: summary + daily breakdown ─────────────────────────────────────────
export async function salesSummary(db: DbClient, ctx: RequestContext, from: string, to: string) {
  const where = and(
    POSTED(ctx.org_id),
    gte(invoices.invoice_date, from),
    lte(invoices.invoice_date, to),
  );

  const [totals] = await db
    .select({
      count: sql<number>`count(*)`,
      taxable: sql<string>`coalesce(sum(${invoices.taxable_total}), 0)`,
      cgst: sql<string>`coalesce(sum(${invoices.cgst_total}), 0)`,
      sgst: sql<string>`coalesce(sum(${invoices.sgst_total}), 0)`,
      igst: sql<string>`coalesce(sum(${invoices.igst_total}), 0)`,
      grand: sql<string>`coalesce(sum(${invoices.grand_total}), 0)`,
      collected: sql<string>`coalesce(sum(${invoices.amount_paid}), 0)`,
    })
    .from(invoices)
    .where(where);

  const daily = await db
    .select({
      date: invoices.invoice_date,
      count: sql<number>`count(*)`,
      grand: sql<string>`coalesce(sum(${invoices.grand_total}), 0)`,
    })
    .from(invoices)
    .where(where)
    .groupBy(invoices.invoice_date)
    .orderBy(invoices.invoice_date);

  return { from, to, totals, daily };
}

// ─── Sales: by item ────────────────────────────────────────────────────────────
export async function salesByItem(
  db: DbClient,
  ctx: RequestContext,
  from: string,
  to: string,
  params: PageParams,
) {
  const where = and(POSTED(ctx.org_id), gte(invoices.invoice_date, from), lte(invoices.invoice_date, to));
  const result = await db
    .select({ total: sql<number>`count(distinct ${invoice_lines.item_id})` })
    .from(invoice_lines)
    .innerJoin(invoices, eq(invoices.id, invoice_lines.invoice_id))
    .where(where);
  const total = result[0]?.total ?? 0;
  const rows = await db
    .select({
      item_id: invoice_lines.item_id,
      name: sql<string>`max(${invoice_lines.item_name_snapshot})`,
      qty: sql<string>`coalesce(sum(${invoice_lines.qty}), 0)`,
      taxable: sql<string>`coalesce(sum(${invoice_lines.taxable_amt}), 0)`,
      total: sql<string>`coalesce(sum(${invoice_lines.total}), 0)`,
      is_finished_good: sql<boolean>`bool_or(${items.is_finished_good})`,
    })
    .from(invoice_lines)
    .innerJoin(invoices, eq(invoices.id, invoice_lines.invoice_id))
    .leftJoin(items, eq(items.id, invoice_lines.item_id))
    .where(where)
    .groupBy(invoice_lines.item_id)
    .orderBy(desc(sql`sum(${invoice_lines.total})`))
    .limit(params.limit)
    .offset(params.offset);
  return { from, to, items: rows, page: { total: Number(total), limit: params.limit, offset: params.offset } };
}

// ─── GST: GSTR-1 (B2B / B2C split + HSN summary + totals) ──────────────────────
export async function gstr1(db: DbClient, ctx: RequestContext, period: string) {
  // period = YYYY-MM → first..last day
  const from = `${period}-01`;
  const [y, m] = period.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const to = `${period}-${String(lastDay).padStart(2, '0')}`;
  const where = and(
    POSTED(ctx.org_id),
    gte(invoices.invoice_date, from),
    lte(invoices.invoice_date, to),
  );

  // B2B = customer has GSTIN snapshot; B2C = none.
  const [b2b] = await db
    .select({
      count: sql<number>`count(*)`,
      taxable: sql<string>`coalesce(sum(${invoices.taxable_total}), 0)`,
      tax: sql<string>`coalesce(sum(${invoices.cgst_total} + ${invoices.sgst_total} + ${invoices.igst_total}), 0)`,
    })
    .from(invoices)
    .where(and(where, sql`${invoices.customer_gstin_snapshot} is not null`));

  const [b2c] = await db
    .select({
      count: sql<number>`count(*)`,
      taxable: sql<string>`coalesce(sum(${invoices.taxable_total}), 0)`,
      tax: sql<string>`coalesce(sum(${invoices.cgst_total} + ${invoices.sgst_total} + ${invoices.igst_total}), 0)`,
    })
    .from(invoices)
    .where(and(where, sql`${invoices.customer_gstin_snapshot} is null`));

  const hsn = await db
    .select({
      hsn_code: sql<string>`coalesce(${invoice_lines.hsn_code}, 'NA')`,
      gst_rate: invoice_lines.gst_rate,
      taxable: sql<string>`coalesce(sum(${invoice_lines.taxable_amt}), 0)`,
      cgst: sql<string>`coalesce(sum(${invoice_lines.cgst_amt}), 0)`,
      sgst: sql<string>`coalesce(sum(${invoice_lines.sgst_amt}), 0)`,
      igst: sql<string>`coalesce(sum(${invoice_lines.igst_amt}), 0)`,
    })
    .from(invoice_lines)
    .innerJoin(invoices, eq(invoices.id, invoice_lines.invoice_id))
    .where(where)
    .groupBy(invoice_lines.hsn_code, invoice_lines.gst_rate)
    .orderBy(invoice_lines.hsn_code);

  const [totals] = await db
    .select({
      taxable: sql<string>`coalesce(sum(${invoices.taxable_total}), 0)`,
      cgst: sql<string>`coalesce(sum(${invoices.cgst_total}), 0)`,
      sgst: sql<string>`coalesce(sum(${invoices.sgst_total}), 0)`,
      igst: sql<string>`coalesce(sum(${invoices.igst_total}), 0)`,
      grand: sql<string>`coalesce(sum(${invoices.grand_total}), 0)`,
    })
    .from(invoices)
    .where(where);

  return { period, from, to, b2b, b2c, hsn_summary: hsn, totals };
}

// ─── Stock: valuation (qty × moving-avg cost, derived from ledger) ─────────────
export async function stockValuation(db: DbClient, ctx: RequestContext, params: PageParams) {
  const allRows = await db
    .select({
      item_id: stock_ledger.item_id,
      name: sql<string>`max(${items.name})`,
      sku: sql<string>`max(${items.sku})`,
      qty: sql<string>`coalesce(sum(${stock_ledger.qty_in}) - sum(${stock_ledger.qty_out}), 0)`,
      avg_cost: sql<string>`max(${items.purchase_price})`,
      sale_price: sql<string>`max(${items.sale_price})`,
      is_finished_good: sql<boolean>`bool_or(${items.is_finished_good})`,
    })
    .from(stock_ledger)
    .innerJoin(items, eq(items.id, stock_ledger.item_id))
    .where(eq(stock_ledger.org_id, ctx.org_id))
    .groupBy(stock_ledger.item_id)
    .orderBy(desc(sql`sum(${stock_ledger.qty_in}) - sum(${stock_ledger.qty_out})`));

  let totalValue = new Decimal(0);
  let totalSaleValue = new Decimal(0);
  const withValue = allRows.map((r) => {
    const qty = new Decimal(r.qty || '0');
    const value = qty.times(r.avg_cost ?? '0');
    const saleValue = qty.times(r.sale_price ?? '0');
    totalValue = totalValue.plus(value);
    totalSaleValue = totalSaleValue.plus(saleValue);
    return { ...r, value: value.toFixed(2), sale_value: saleValue.toFixed(2) };
  });

  const pageItems = withValue.slice(params.offset, params.offset + params.limit);
  return {
    total_value: totalValue.toFixed(2),
    total_sale_value: totalSaleValue.toFixed(2),
    items: pageItems,
    page: { total: allRows.length, limit: params.limit, offset: params.offset },
  };
}

// ─── Stock: low (at/below reorder level) ───────────────────────────────────────
export async function lowStock(db: DbClient, ctx: RequestContext) {
  // Current stock per item across all locations.
  const balances = await db
    .select({
      item_id: stock_ledger.item_id,
      qty: sql<string>`coalesce(sum(${stock_ledger.qty_in}) - sum(${stock_ledger.qty_out}), 0)`,
    })
    .from(stock_ledger)
    .where(eq(stock_ledger.org_id, ctx.org_id))
    .groupBy(stock_ledger.item_id);
  const balMap = new Map(balances.map((b) => [b.item_id, Number(b.qty)]));

  const trackedItems = await db
    .select({
      id: items.id,
      sku: items.sku,
      name: items.name,
      is_finished_good: items.is_finished_good,
      reorder_level: items.reorder_level,
      reorder_qty: items.reorder_qty,
    })
    .from(items)
    .where(
      and(
        eq(items.org_id, ctx.org_id),
        eq(items.track_inventory, true),
        isNull(items.deleted_at),
        sql`${items.reorder_level} is not null and ${items.reorder_level} > 0`,
      ),
    );

  const low = trackedItems
    .map((it) => ({ ...it, current_stock: balMap.get(it.id) ?? 0 }))
    .filter((it) => it.current_stock <= Number(it.reorder_level ?? 0))
    .map((it) => ({
      id: it.id,
      sku: it.sku,
      name: it.name,
      is_finished_good: it.is_finished_good,
      current_stock: String(it.current_stock),
      reorder_level: String(it.reorder_level ?? 0),
      reorder_qty: String(it.reorder_qty ?? 0),
    }));

  return { items: low };
}

// ─── Financial: receivables with aging ─────────────────────────────────────────
export async function receivables(db: DbClient, ctx: RequestContext, asOf: string) {
  const openInvoices = await db
    .select({
      customer_id: invoices.customer_id,
      customer_name: invoices.customer_name_snapshot,
      invoice_no: invoices.invoice_no,
      invoice_date: invoices.invoice_date,
      due_date: invoices.due_date,
      balance_due: invoices.balance_due,
    })
    .from(invoices)
    .where(and(POSTED(ctx.org_id), sql`${invoices.balance_due} > 0`));

  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
  const byCustomer = new Map<string, { name: string; total: number }>();
  let total = 0;

  for (const inv of openInvoices) {
    const bal = Number(inv.balance_due);
    total += bal;
    const ref = inv.due_date ?? inv.invoice_date;
    const overdueDays = Math.floor(
      (new Date(`${asOf}T00:00:00Z`).getTime() - new Date(`${ref}T00:00:00Z`).getTime()) /
        86_400_000,
    );
    if (overdueDays <= 0) buckets.current += bal;
    else if (overdueDays <= 30) buckets.d1_30 += bal;
    else if (overdueDays <= 60) buckets.d31_60 += bal;
    else if (overdueDays <= 90) buckets.d61_90 += bal;
    else buckets.d90_plus += bal;

    const key = inv.customer_id ?? 'walk-in';
    const existing = byCustomer.get(key);
    if (existing) existing.total += bal;
    else byCustomer.set(key, { name: inv.customer_name ?? 'Walk-in', total: bal });
  }

  return {
    as_of: asOf,
    total_receivable: total.toFixed(2),
    aging: {
      current: buckets.current.toFixed(2),
      '1_30': buckets.d1_30.toFixed(2),
      '31_60': buckets.d31_60.toFixed(2),
      '61_90': buckets.d61_90.toFixed(2),
      '90_plus': buckets.d90_plus.toFixed(2),
    },
    customers: Array.from(byCustomer.entries())
      .map(([id, v]) => ({ customer_id: id, name: v.name, balance: v.total.toFixed(2) }))
      .sort((a, b) => Number(b.balance) - Number(a.balance)),
  };
}

// ─── Financial: payables ───────────────────────────────────────────────────────
export async function payables(db: DbClient, ctx: RequestContext) {
  const rows = await db
    .select({
      vendor_id: purchase_invoices.vendor_id,
      vendor_name: sql<string>`max(${purchase_invoices.vendor_name_snapshot})`,
      total: sql<string>`coalesce(sum(${purchase_invoices.balance_due}), 0)`,
    })
    .from(purchase_invoices)
    .where(
      and(
        eq(purchase_invoices.org_id, ctx.org_id),
        isNull(purchase_invoices.deleted_at),
        sql`${purchase_invoices.balance_due} > 0`,
      ),
    )
    .groupBy(purchase_invoices.vendor_id);

  const total = rows.reduce((acc, r) => acc + Number(r.total), 0);
  return {
    total_payable: total.toFixed(2),
    vendors: rows
      .map((r) => ({ vendor_id: r.vendor_id, name: r.vendor_name, balance: r.total }))
      .sort((a, b) => Number(b.balance) - Number(a.balance)),
  };
}

// ─── Soaps by Customer ────────────────────────────────────────────────────────
export async function soapsByCustomer(
  db: DbClient,
  ctx: RequestContext,
  from: string,
  to: string,
  params: PageParams,
) {
  const rows = await db
    .select({
      customer_id: invoices.customer_id,
      name: sql<string>`coalesce(max(${invoices.customer_name_snapshot}), 'Walk-in Customer')`,
      qty: sql<string>`coalesce(sum(${invoice_lines.qty}), 0)`,
      total: sql<string>`coalesce(sum(${invoice_lines.total}), 0)`,
    })
    .from(invoice_lines)
    .innerJoin(invoices, eq(invoices.id, invoice_lines.invoice_id))
    .where(
      and(
        POSTED(ctx.org_id),
        gte(invoices.invoice_date, from),
        lte(invoices.invoice_date, to),
        sql`(${invoice_lines.item_name_snapshot} ILIKE '%bar%' OR ${invoice_lines.item_name_snapshot} ILIKE '%soap%' OR ${invoice_lines.item_name_snapshot} ILIKE '%bath%')`,
      ),
    )
    .groupBy(invoices.customer_id, invoices.customer_name_snapshot)
    .orderBy(desc(sql`sum(${invoice_lines.qty})`))
    .limit(params.limit)
    .offset(params.offset);

  const countResult = await db
    .select({ total: sql<number>`count(distinct ${invoices.customer_id})` })
    .from(invoice_lines)
    .innerJoin(invoices, eq(invoices.id, invoice_lines.invoice_id))
    .where(
      and(
        POSTED(ctx.org_id),
        gte(invoices.invoice_date, from),
        lte(invoices.invoice_date, to),
        sql`(${invoice_lines.item_name_snapshot} ILIKE '%bar%' OR ${invoice_lines.item_name_snapshot} ILIKE '%soap%' OR ${invoice_lines.item_name_snapshot} ILIKE '%bath%')`,
      ),
    );
  const total = countResult[0]?.total ?? 0;

  return { from, to, customers: rows, page: { total: Number(total), limit: params.limit, offset: params.offset } };
}

// ─── Sales by Referral ────────────────────────────────────────────────────────
export async function salesByReferral(
  db: DbClient,
  ctx: RequestContext,
  from: string,
  to: string,
  params: PageParams,
) {
  const buyer = alias(customers, 'buyer');
  const rows = await db
    .select({
      referred_by_id: buyer.referred_by_id,
      referrer_name: sql<string>`max(${customers.name})`,
      count: sql<number>`count(${invoices.id})`,
      total: sql<string>`coalesce(sum(${invoices.grand_total}), 0)`,
    })
    .from(invoices)
    .innerJoin(buyer, eq(buyer.id, invoices.customer_id))
    .innerJoin(customers, eq(customers.id, buyer.referred_by_id))
    .where(
      and(POSTED(ctx.org_id), gte(invoices.invoice_date, from), lte(invoices.invoice_date, to)),
    )
    .groupBy(buyer.referred_by_id)
    .orderBy(desc(sql`sum(${invoices.grand_total})`))
    .limit(params.limit)
    .offset(params.offset);

  const buyer2 = alias(customers, 'buyer2');
  const countResult2 = await db
    .select({ total: sql<number>`count(distinct ${buyer2.referred_by_id})` })
    .from(invoices)
    .innerJoin(buyer2, eq(buyer2.id, invoices.customer_id))
    .innerJoin(customers, eq(customers.id, buyer2.referred_by_id))
    .where(and(POSTED(ctx.org_id), gte(invoices.invoice_date, from), lte(invoices.invoice_date, to)));
  const total = countResult2[0]?.total ?? 0;

  return { from, to, referrals: rows, page: { total: Number(total), limit: params.limit, offset: params.offset } };
}

// ─── Purchases: posted-invoice filter ──────────────────────────────────────────
const POSTED_PUR = (orgId: string) =>
  and(
    eq(purchase_invoices.org_id, orgId),
    eq(purchase_invoices.status, 'posted'),
    isNull(purchase_invoices.deleted_at),
  );

// ─── Purchases: summary + daily breakdown ──────────────────────────────────────
export async function purchaseSummary(db: DbClient, ctx: RequestContext, from: string, to: string) {
  const where = and(
    POSTED_PUR(ctx.org_id),
    gte(purchase_invoices.voucher_date, from),
    lte(purchase_invoices.voucher_date, to),
  );

  const [totals] = await db
    .select({
      count: sql<number>`count(*)`,
      taxable: sql<string>`coalesce(sum(${purchase_invoices.taxable_total}), 0)`,
      cgst: sql<string>`coalesce(sum(${purchase_invoices.cgst_total}), 0)`,
      sgst: sql<string>`coalesce(sum(${purchase_invoices.sgst_total}), 0)`,
      igst: sql<string>`coalesce(sum(${purchase_invoices.igst_total}), 0)`,
      grand: sql<string>`coalesce(sum(${purchase_invoices.grand_total}), 0)`,
      paid: sql<string>`coalesce(sum(${purchase_invoices.amount_paid}), 0)`,
    })
    .from(purchase_invoices)
    .where(where);

  const daily = await db
    .select({
      date: purchase_invoices.voucher_date,
      count: sql<number>`count(*)`,
      grand: sql<string>`coalesce(sum(${purchase_invoices.grand_total}), 0)`,
    })
    .from(purchase_invoices)
    .where(where)
    .groupBy(purchase_invoices.voucher_date)
    .orderBy(purchase_invoices.voucher_date);

  return { from, to, totals, daily };
}

// ─── Purchases: by vendor ──────────────────────────────────────────────────────
export async function purchasesByVendor(
  db: DbClient,
  ctx: RequestContext,
  from: string,
  to: string,
  params: PageParams,
) {
  const where = and(
    POSTED_PUR(ctx.org_id),
    gte(purchase_invoices.voucher_date, from),
    lte(purchase_invoices.voucher_date, to),
  );
  const countResult = await db
    .select({ total: sql<number>`count(distinct ${purchase_invoices.vendor_id})` })
    .from(purchase_invoices)
    .where(where);
  const total = countResult[0]?.total ?? 0;
  const rows = await db
    .select({
      vendor_id: purchase_invoices.vendor_id,
      name: sql<string>`coalesce(max(${purchase_invoices.vendor_name_snapshot}), 'Unknown')`,
      count: sql<number>`count(*)`,
      taxable: sql<string>`coalesce(sum(${purchase_invoices.taxable_total}), 0)`,
      total: sql<string>`coalesce(sum(${purchase_invoices.grand_total}), 0)`,
    })
    .from(purchase_invoices)
    .where(where)
    .groupBy(purchase_invoices.vendor_id)
    .orderBy(desc(sql`sum(${purchase_invoices.grand_total})`))
    .limit(params.limit)
    .offset(params.offset);
  return { from, to, vendors: rows, page: { total: Number(total), limit: params.limit, offset: params.offset } };
}

// ─── Purchases: by item ────────────────────────────────────────────────────────
export async function purchasesByItem(
  db: DbClient,
  ctx: RequestContext,
  from: string,
  to: string,
  params: PageParams,
) {
  const where = and(
    POSTED_PUR(ctx.org_id),
    gte(purchase_invoices.voucher_date, from),
    lte(purchase_invoices.voucher_date, to),
  );
  const countResult = await db
    .select({ total: sql<number>`count(distinct ${purchase_invoice_lines.item_id})` })
    .from(purchase_invoice_lines)
    .innerJoin(purchase_invoices, eq(purchase_invoices.id, purchase_invoice_lines.purchase_invoice_id))
    .where(where);
  const total = countResult[0]?.total ?? 0;
  const rows = await db
    .select({
      item_id: purchase_invoice_lines.item_id,
      name: sql<string>`max(${purchase_invoice_lines.item_name_snapshot})`,
      qty: sql<string>`coalesce(sum(${purchase_invoice_lines.qty}), 0)`,
      taxable: sql<string>`coalesce(sum(${purchase_invoice_lines.taxable_amt}), 0)`,
      total: sql<string>`coalesce(sum(${purchase_invoice_lines.total}), 0)`,
      is_finished_good: sql<boolean>`bool_or(${items.is_finished_good})`,
    })
    .from(purchase_invoice_lines)
    .innerJoin(
      purchase_invoices,
      eq(purchase_invoices.id, purchase_invoice_lines.purchase_invoice_id),
    )
    .leftJoin(items, eq(items.id, purchase_invoice_lines.item_id))
    .where(where)
    .groupBy(purchase_invoice_lines.item_id)
    .orderBy(desc(sql`sum(${purchase_invoice_lines.total})`))
    .limit(params.limit)
    .offset(params.offset);
  return { from, to, items: rows, page: { total: Number(total), limit: params.limit, offset: params.offset } };
}

// ─── Manufacturing: completed-run filter ───────────────────────────────────────
const POSTED_PROD = (orgId: string) =>
  and(
    eq(production_orders.org_id, orgId),
    eq(production_orders.status, 'completed'),
    isNull(production_orders.deleted_at),
  );

// ─── Manufacturing: summary + daily breakdown ──────────────────────────────────
export async function productionSummary(
  db: DbClient,
  ctx: RequestContext,
  from: string,
  to: string,
) {
  const where = and(
    POSTED_PROD(ctx.org_id),
    gte(production_orders.production_date, from),
    lte(production_orders.production_date, to),
  );

  const [totals] = await db
    .select({
      count: sql<number>`count(*)`,
      produced: sql<string>`coalesce(sum(${production_orders.produced_qty}), 0)`,
      material: sql<string>`coalesce(sum(${production_orders.total_material_cost}), 0)`,
      labor: sql<string>`coalesce(sum(${production_orders.labor_cost}), 0)`,
      overhead: sql<string>`coalesce(sum(${production_orders.overhead_cost}), 0)`,
      total: sql<string>`coalesce(sum(${production_orders.total_cost}), 0)`,
    })
    .from(production_orders)
    .where(where);

  const daily = await db
    .select({
      date: production_orders.production_date,
      count: sql<number>`count(*)`,
      grand: sql<string>`coalesce(sum(${production_orders.total_cost}), 0)`,
    })
    .from(production_orders)
    .where(where)
    .groupBy(production_orders.production_date)
    .orderBy(production_orders.production_date);

  return { from, to, totals, daily };
}

// ─── Manufacturing: output by finished good ────────────────────────────────────
export async function productionByItem(
  db: DbClient,
  ctx: RequestContext,
  from: string,
  to: string,
  params: PageParams,
) {
  const where = and(
    POSTED_PROD(ctx.org_id),
    gte(production_orders.production_date, from),
    lte(production_orders.production_date, to),
  );
  const countResult = await db
    .select({ total: sql<number>`count(distinct ${production_orders.finished_item_id})` })
    .from(production_orders)
    .where(where);
  const total = countResult[0]?.total ?? 0;
  const rows = await db
    .select({
      item_id: production_orders.finished_item_id,
      name: sql<string>`max(${items.name})`,
      runs: sql<number>`count(*)`,
      produced: sql<string>`coalesce(sum(${production_orders.produced_qty}), 0)`,
      total_cost: sql<string>`coalesce(sum(${production_orders.total_cost}), 0)`,
      avg_cost_per_unit: sql<string>`case when sum(${production_orders.produced_qty}) > 0 then sum(${production_orders.total_cost}) / sum(${production_orders.produced_qty}) else 0 end`,
    })
    .from(production_orders)
    .innerJoin(items, eq(items.id, production_orders.finished_item_id))
    .where(where)
    .groupBy(production_orders.finished_item_id)
    .orderBy(desc(sql`sum(${production_orders.total_cost})`))
    .limit(params.limit)
    .offset(params.offset);
  return { from, to, items: rows, page: { total: Number(total), limit: params.limit, offset: params.offset } };
}

// ─── GST: purchase input credit (GSTR-3B input) ──────────────────────────────
export async function gstrPurchase(db: DbClient, ctx: RequestContext, period: string) {
  const from = `${period}-01`;
  const [y, m] = period.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const to = `${period}-${String(lastDay).padStart(2, '0')}`;
  const where = and(
    POSTED_PUR(ctx.org_id),
    gte(purchase_invoices.voucher_date, from),
    lte(purchase_invoices.voucher_date, to),
  );

  const [totals] = await db
    .select({
      count: sql<number>`count(*)`,
      taxable: sql<string>`coalesce(sum(${purchase_invoices.taxable_total}), 0)`,
      cgst: sql<string>`coalesce(sum(${purchase_invoices.cgst_total}), 0)`,
      sgst: sql<string>`coalesce(sum(${purchase_invoices.sgst_total}), 0)`,
      igst: sql<string>`coalesce(sum(${purchase_invoices.igst_total}), 0)`,
      grand: sql<string>`coalesce(sum(${purchase_invoices.grand_total}), 0)`,
    })
    .from(purchase_invoices)
    .where(where);

  const hsn = await db
    .select({
      hsn_code: sql<string>`coalesce(${purchase_invoice_lines.hsn_code}, 'NA')`,
      gst_rate: purchase_invoice_lines.gst_rate,
      taxable: sql<string>`coalesce(sum(${purchase_invoice_lines.taxable_amt}), 0)`,
      cgst: sql<string>`coalesce(sum(${purchase_invoice_lines.cgst_amt}), 0)`,
      sgst: sql<string>`coalesce(sum(${purchase_invoice_lines.sgst_amt}), 0)`,
      igst: sql<string>`coalesce(sum(${purchase_invoice_lines.igst_amt}), 0)`,
    })
    .from(purchase_invoice_lines)
    .innerJoin(
      purchase_invoices,
      eq(purchase_invoices.id, purchase_invoice_lines.purchase_invoice_id),
    )
    .where(where)
    .groupBy(purchase_invoice_lines.hsn_code, purchase_invoice_lines.gst_rate)
    .orderBy(purchase_invoice_lines.hsn_code);

  return { period, from, to, totals, hsn_summary: hsn };
}

// ─── Sales: voided / cancelled bills ─────────────────────────────────────────
export async function voidedBills(
  db: DbClient,
  ctx: RequestContext,
  from: string,
  to: string,
  params: PageParams,
) {
  const where = and(
    eq(invoices.org_id, ctx.org_id),
    eq(invoices.status, 'voided'),
    isNull(invoices.deleted_at),
    gte(invoices.invoice_date, from),
    lte(invoices.invoice_date, to),
  );
  const [agg] = await db
    .select({
      total_count: sql<number>`count(*)`,
      total_amount: sql<string>`coalesce(sum(${invoices.grand_total}), 0)`,
    })
    .from(invoices)
    .where(where);
  const rows = await db
    .select({
      id: invoices.id,
      invoice_no: invoices.invoice_no,
      invoice_date: invoices.invoice_date,
      customer_name: invoices.customer_name_snapshot,
      grand_total: invoices.grand_total,
      void_reason: invoices.void_reason,
      voided_at: invoices.voided_at,
    })
    .from(invoices)
    .where(where)
    .orderBy(desc(invoices.invoice_date))
    .limit(params.limit)
    .offset(params.offset);
  return {
    from,
    to,
    count: Number(agg!.total_count),
    total: agg!.total_amount,
    bills: rows,
    page: { total: Number(agg!.total_count), limit: params.limit, offset: params.offset },
  };
}

// ─── Sales: returns (credit notes) ───────────────────────────────────────────
export async function salesReturns(
  db: DbClient,
  ctx: RequestContext,
  from: string,
  to: string,
  params: PageParams,
) {
  const where = and(
    eq(credit_notes.org_id, ctx.org_id),
    eq(credit_notes.status, 'posted'),
    isNull(credit_notes.deleted_at),
    gte(credit_notes.credit_note_date, from),
    lte(credit_notes.credit_note_date, to),
  );
  const [agg] = await db
    .select({
      total_count: sql<number>`count(*)`,
      total_amount: sql<string>`coalesce(sum(${credit_notes.grand_total}), 0)`,
    })
    .from(credit_notes)
    .where(where);
  const rows = await db
    .select({
      id: credit_notes.id,
      credit_note_no: credit_notes.credit_note_no,
      credit_note_date: credit_notes.credit_note_date,
      customer_name: credit_notes.customer_name_snapshot,
      original_invoice_no: credit_notes.original_invoice_no,
      reason: credit_notes.reason,
      grand_total: credit_notes.grand_total,
    })
    .from(credit_notes)
    .where(where)
    .orderBy(desc(credit_notes.credit_note_date))
    .limit(params.limit)
    .offset(params.offset);
  return {
    from,
    to,
    count: Number(agg!.total_count),
    total: agg!.total_amount,
    returns: rows,
    page: { total: Number(agg!.total_count), limit: params.limit, offset: params.offset },
  };
}

// ─── Sales: discount analysis ─────────────────────────────────────────────────
export async function salesDiscounts(
  db: DbClient,
  ctx: RequestContext,
  from: string,
  to: string,
  params: PageParams,
) {
  const where = and(
    POSTED(ctx.org_id),
    gte(invoices.invoice_date, from),
    lte(invoices.invoice_date, to),
  );

  const [totals] = await db
    .select({
      invoice_count: sql<number>`count(distinct ${invoices.id})`,
      total_discount: sql<string>`coalesce(sum(${invoices.discount_total}), 0)`,
      total_sales: sql<string>`coalesce(sum(${invoices.grand_total}), 0)`,
    })
    .from(invoices)
    .where(and(where, sql`${invoices.discount_total} > 0`));

  const itemWhere = and(where, sql`${invoice_lines.discount_amt} > 0`);
  const countResult = await db
    .select({ total: sql<number>`count(distinct ${invoice_lines.item_id})` })
    .from(invoice_lines)
    .innerJoin(invoices, eq(invoices.id, invoice_lines.invoice_id))
    .where(itemWhere);
  const total = countResult[0]?.total ?? 0;

  const byItem = await db
    .select({
      item_id: invoice_lines.item_id,
      name: sql<string>`max(${invoice_lines.item_name_snapshot})`,
      qty: sql<string>`coalesce(sum(${invoice_lines.qty}), 0)`,
      discount_amt: sql<string>`coalesce(sum(${invoice_lines.discount_amt}), 0)`,
      total_before: sql<string>`coalesce(sum(${invoice_lines.qty} * ${invoice_lines.rate}), 0)`,
    })
    .from(invoice_lines)
    .innerJoin(invoices, eq(invoices.id, invoice_lines.invoice_id))
    .where(itemWhere)
    .groupBy(invoice_lines.item_id)
    .orderBy(desc(sql`sum(${invoice_lines.discount_amt})`))
    .limit(params.limit)
    .offset(params.offset);

  return {
    from,
    to,
    totals,
    items: byItem,
    page: { total: Number(total), limit: params.limit, offset: params.offset },
  };
}

// ─── Sales: top customers by revenue ─────────────────────────────────────────
export async function topCustomers(
  db: DbClient,
  ctx: RequestContext,
  from: string,
  to: string,
  params: PageParams,
) {
  const where = and(POSTED(ctx.org_id), gte(invoices.invoice_date, from), lte(invoices.invoice_date, to));
  const countResult = await db
    .select({ total: sql<number>`count(distinct ${invoices.customer_id})` })
    .from(invoices)
    .where(where);
  const total = countResult[0]?.total ?? 0;
  const rows = await db
    .select({
      customer_id: invoices.customer_id,
      name: sql<string>`coalesce(max(${invoices.customer_name_snapshot}), 'Walk-in Customer')`,
      invoice_count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(${invoices.grand_total}), 0)`,
      last_purchase: sql<string>`max(${invoices.invoice_date})`,
    })
    .from(invoices)
    .where(where)
    .groupBy(invoices.customer_id)
    .orderBy(desc(sql`sum(${invoices.grand_total})`))
    .limit(params.limit)
    .offset(params.offset);
  return { from, to, customers: rows, page: { total: Number(total), limit: params.limit, offset: params.offset } };
}

// ─── Financial: payment collection — daily by mode ────────────────────────────
export async function paymentCollection(
  db: DbClient,
  ctx: RequestContext,
  from: string,
  to: string,
) {
  const baseWhere = and(
    eq(payments.org_id, ctx.org_id),
    eq(payments.direction, 'inbound'),
    eq(payments.is_voided, false),
    isNull(payments.deleted_at),
    gte(payments.payment_date, from),
    lte(payments.payment_date, to),
  );

  const byMode = await db
    .select({
      mode: payments.mode,
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(${payments.amount}), 0)`,
    })
    .from(payments)
    .where(baseWhere)
    .groupBy(payments.mode)
    .orderBy(desc(sql`sum(${payments.amount})`));

  const daily = await db
    .select({
      date: payments.payment_date,
      mode: payments.mode,
      total: sql<string>`coalesce(sum(${payments.amount}), 0)`,
    })
    .from(payments)
    .where(baseWhere)
    .groupBy(payments.payment_date, payments.mode)
    .orderBy(desc(payments.payment_date), payments.mode);

  const grandTotal = byMode.reduce((acc, r) => acc + Number(r.total), 0);
  return { from, to, grand_total: grandTotal.toFixed(2), by_mode: byMode, daily };
}

// ─── Financial: customer purchase ledger summary ──────────────────────────────
export async function customerLedger(
  db: DbClient,
  ctx: RequestContext,
  from: string,
  to: string,
  params: PageParams,
) {
  const where = and(POSTED(ctx.org_id), gte(invoices.invoice_date, from), lte(invoices.invoice_date, to));
  const countResult = await db
    .select({ total: sql<number>`count(distinct ${invoices.customer_id})` })
    .from(invoices)
    .where(where);
  const total = countResult[0]?.total ?? 0;
  const rows = await db
    .select({
      customer_id: invoices.customer_id,
      name: sql<string>`coalesce(max(${invoices.customer_name_snapshot}), 'Walk-in')`,
      invoice_count: sql<number>`count(*)`,
      total_billed: sql<string>`coalesce(sum(${invoices.grand_total}), 0)`,
      total_paid: sql<string>`coalesce(sum(${invoices.amount_paid}), 0)`,
      balance: sql<string>`coalesce(sum(${invoices.balance_due}), 0)`,
      last_purchase: sql<string>`max(${invoices.invoice_date})`,
    })
    .from(invoices)
    .where(where)
    .groupBy(invoices.customer_id)
    .orderBy(desc(sql`sum(${invoices.grand_total})`))
    .limit(params.limit)
    .offset(params.offset);
  return { from, to, customers: rows, page: { total: Number(total), limit: params.limit, offset: params.offset } };
}

// ─── Stock: expiry report ──────────────────────────────────────────────────────
export async function expiryReport(
  db: DbClient,
  ctx: RequestContext,
  daysAhead: number,
  params: PageParams,
) {
  const today = new Date().toISOString().slice(0, 10);
  const futureDate = new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);

  const selectFields = {
    batch_id: batches.id,
    batch_no: batches.batch_no,
    item_id: batches.item_id,
    item_name: items.name,
    item_sku: items.sku,
    expiry_date: batches.expiry_date,
    mfg_date: batches.mfg_date,
    current_qty: sql<string>`coalesce(sum(${stock_ledger.qty_in}) - sum(${stock_ledger.qty_out}), 0)`,
  };

  const expiring = await db
    .select(selectFields)
    .from(batches)
    .innerJoin(items, and(eq(items.id, batches.item_id), isNull(items.deleted_at)))
    .leftJoin(
      stock_ledger,
      and(eq(stock_ledger.batch_id, batches.id), eq(stock_ledger.org_id, ctx.org_id)),
    )
    .where(
      and(
        eq(batches.org_id, ctx.org_id),
        sql`${batches.expiry_date} is not null`,
        gte(batches.expiry_date, today),
        lte(batches.expiry_date, futureDate),
      ),
    )
    .groupBy(
      batches.id,
      batches.batch_no,
      batches.item_id,
      items.name,
      items.sku,
      batches.expiry_date,
      batches.mfg_date,
    )
    .having(sql`coalesce(sum(${stock_ledger.qty_in}) - sum(${stock_ledger.qty_out}), 0) > 0`)
    .orderBy(batches.expiry_date)
    .limit(params.limit)
    .offset(params.offset);

  const expiringResult = await db
    .select({ expiring_total: sql<number>`count(distinct ${batches.id})` })
    .from(batches)
    .where(and(eq(batches.org_id, ctx.org_id), sql`${batches.expiry_date} is not null`, gte(batches.expiry_date, today), lte(batches.expiry_date, futureDate)));
  const expiring_total = expiringResult[0]?.expiring_total ?? 0;

  const expired = await db
    .select(selectFields)
    .from(batches)
    .innerJoin(items, and(eq(items.id, batches.item_id), isNull(items.deleted_at)))
    .leftJoin(
      stock_ledger,
      and(eq(stock_ledger.batch_id, batches.id), eq(stock_ledger.org_id, ctx.org_id)),
    )
    .where(
      and(
        eq(batches.org_id, ctx.org_id),
        sql`${batches.expiry_date} is not null`,
        lt(batches.expiry_date, today),
      ),
    )
    .groupBy(
      batches.id,
      batches.batch_no,
      batches.item_id,
      items.name,
      items.sku,
      batches.expiry_date,
      batches.mfg_date,
    )
    .having(sql`coalesce(sum(${stock_ledger.qty_in}) - sum(${stock_ledger.qty_out}), 0) > 0`)
    .orderBy(batches.expiry_date)
    .limit(params.limit)
    .offset(params.offset);

  const expiredResult = await db
    .select({ expired_total: sql<number>`count(distinct ${batches.id})` })
    .from(batches)
    .where(and(eq(batches.org_id, ctx.org_id), sql`${batches.expiry_date} is not null`, lt(batches.expiry_date, today)));
  const expired_total = expiredResult[0]?.expired_total ?? 0;

  const addDays = (r: { expiry_date: string | null; current_qty: string }) => ({
    ...r,
    days_to_expiry: r.expiry_date
      ? Math.floor(
          (new Date(`${r.expiry_date}T00:00:00Z`).getTime() -
            new Date(`${today}T00:00:00Z`).getTime()) /
            86_400_000,
        )
      : null,
  });

  return {
    as_of: today,
    days_ahead: daysAhead,
    expiring: expiring.map(addDays),
    expired: expired.map(addDays),
    page: {
      expiring_total: Number(expiring_total),
      expired_total: Number(expired_total),
      limit: params.limit,
      offset: params.offset,
    },
  };
}

// ─── Stock: ledger movements ──────────────────────────────────────────────────
export async function stockLedgerReport(
  db: DbClient,
  ctx: RequestContext,
  from: string,
  to: string,
  itemId: string | undefined,
  params: PageParams,
) {
  const conditions = [
    eq(stock_ledger.org_id, ctx.org_id),
    sql`${stock_ledger.txn_date}::date >= ${from}::date`,
    sql`${stock_ledger.txn_date}::date <= ${to}::date`,
  ] as const;

  const where = itemId ? and(...conditions, eq(stock_ledger.item_id, itemId)) : and(...conditions);
  const countResult = await db
    .select({ total: sql<number>`count(*)` })
    .from(stock_ledger)
    .where(where);
  const total = countResult[0]?.total ?? 0;
  const rows = await db
    .select({
      id: stock_ledger.id,
      txn_type: stock_ledger.txn_type,
      txn_date: stock_ledger.txn_date,
      item_id: stock_ledger.item_id,
      item_name: items.name,
      item_sku: items.sku,
      qty_in: stock_ledger.qty_in,
      qty_out: stock_ledger.qty_out,
      balance_qty: stock_ledger.balance_qty,
      rate: stock_ledger.rate,
      note: stock_ledger.note,
    })
    .from(stock_ledger)
    .leftJoin(items, eq(items.id, stock_ledger.item_id))
    .where(where)
    .orderBy(desc(stock_ledger.txn_date))
    .limit(params.limit)
    .offset(params.offset);
  return {
    from,
    to,
    item_id: itemId ?? null,
    entries: rows,
    page: { total: Number(total), limit: params.limit, offset: params.offset },
  };
}

// ─── Manufacturing: raw-material consumption ───────────────────────────────────
export async function materialConsumption(
  db: DbClient,
  ctx: RequestContext,
  from: string,
  to: string,
  params: PageParams,
) {
  const where = and(
    POSTED_PROD(ctx.org_id),
    eq(production_order_lines.line_type, 'consume'),
    gte(production_orders.production_date, from),
    lte(production_orders.production_date, to),
  );
  const countResult = await db
    .select({ total: sql<number>`count(distinct ${production_order_lines.item_id})` })
    .from(production_order_lines)
    .innerJoin(production_orders, eq(production_orders.id, production_order_lines.production_order_id))
    .where(where);
  const total = countResult[0]?.total ?? 0;
  const rows = await db
    .select({
      item_id: production_order_lines.item_id,
      name: sql<string>`max(${production_order_lines.item_name_snapshot})`,
      qty: sql<string>`coalesce(sum(${production_order_lines.qty}), 0)`,
      value: sql<string>`coalesce(sum(${production_order_lines.value}), 0)`,
    })
    .from(production_order_lines)
    .innerJoin(
      production_orders,
      eq(production_orders.id, production_order_lines.production_order_id),
    )
    .where(where)
    .groupBy(production_order_lines.item_id)
    .orderBy(desc(sql`sum(${production_order_lines.value})`))
    .limit(params.limit)
    .offset(params.offset);
  return { from, to, materials: rows, page: { total: Number(total), limit: params.limit, offset: params.offset } };
}

// ─── Phase 2 ───────────────────────────────────────────────────────────────────

// ─── Day Book — all transactions by date ──────────────────────────────────────
export async function dayBook(
  db: DbClient,
  ctx: RequestContext,
  from: string,
  to: string,
  params: PageParams,
) {
  const orgId = ctx.org_id;

  const [salesRows, returnRows, payInRows, payOutRows] = await Promise.all([
    db
      .select({
        date: invoices.invoice_date,
        type: sql<string>`'sale'`,
        ref_no: invoices.invoice_no,
        party: sql<string>`coalesce(${invoices.customer_name_snapshot}, 'Walk-in')`,
        amount: invoices.grand_total,
        mode: sql<string>`''`,
        note: sql<string>`''`,
      })
      .from(invoices)
      .where(
        and(eq(invoices.org_id, orgId), eq(invoices.status, 'posted'), isNull(invoices.deleted_at),
          gte(invoices.invoice_date, from), lte(invoices.invoice_date, to)),
      ),
    db
      .select({
        date: credit_notes.credit_note_date,
        type: sql<string>`'sales_return'`,
        ref_no: credit_notes.credit_note_no,
        party: sql<string>`coalesce(${credit_notes.customer_name_snapshot}, 'Walk-in')`,
        amount: sql<string>`'-' || ${credit_notes.grand_total}::text`,
        mode: sql<string>`coalesce(${credit_notes.refund_mode}, '')`,
        note: sql<string>`coalesce(${credit_notes.reason}, '')`,
      })
      .from(credit_notes)
      .where(
        and(eq(credit_notes.org_id, orgId), eq(credit_notes.status, 'posted'), isNull(credit_notes.deleted_at),
          gte(credit_notes.credit_note_date, from), lte(credit_notes.credit_note_date, to)),
      ),
    db
      .select({
        date: payments.payment_date,
        type: sql<string>`'payment_in'`,
        ref_no: payments.payment_no,
        party: sql<string>`coalesce(${payments.narration}, '')`,
        amount: payments.amount,
        mode: payments.mode,
        note: sql<string>`coalesce(${payments.reference}, '')`,
      })
      .from(payments)
      .where(
        and(eq(payments.org_id, orgId), eq(payments.direction, 'inbound'), eq(payments.is_voided, false),
          isNull(payments.deleted_at), gte(payments.payment_date, from), lte(payments.payment_date, to)),
      ),
    db
      .select({
        date: payments.payment_date,
        type: sql<string>`'payment_out'`,
        ref_no: payments.payment_no,
        party: sql<string>`coalesce(${payments.narration}, '')`,
        amount: sql<string>`'-' || ${payments.amount}::text`,
        mode: payments.mode,
        note: sql<string>`coalesce(${payments.reference}, '')`,
      })
      .from(payments)
      .where(
        and(eq(payments.org_id, orgId), eq(payments.direction, 'outbound'), eq(payments.is_voided, false),
          isNull(payments.deleted_at), gte(payments.payment_date, from), lte(payments.payment_date, to)),
      ),
  ]);

  type Entry = { date: string; type: string; ref_no: string; party: string; amount: string; mode: string; note: string };
  const entries: Entry[] = [...salesRows, ...returnRows, ...payInRows, ...payOutRows].sort(
    (a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type),
  ) as Entry[];

  const totalIn = entries
    .filter((e) => e.type === 'sale' || e.type === 'payment_in')
    .reduce((s, e) => s.plus(e.amount), new Decimal('0'));
  const totalOut = entries
    .filter((e) => e.type === 'sales_return' || e.type === 'payment_out')
    .reduce((s, e) => s.plus(new Decimal(e.amount).abs()), new Decimal('0'));

  const pageEntries = entries.slice(params.offset, params.offset + params.limit);
  return {
    from,
    to,
    entries: pageEntries,
    totals: {
      total_in: totalIn.toFixed(2),
      total_out: totalOut.toFixed(2),
      net: totalIn.minus(totalOut).toFixed(2),
      sales_count: salesRows.length,
      return_count: returnRows.length,
      payment_in_count: payInRows.length,
      payment_out_count: payOutRows.length,
    },
    page: { total: entries.length, limit: params.limit, offset: params.offset },
  };
}

// ─── Sales: item margin (gross profit vs purchase price) ─────────────────────
export async function itemMargin(
  db: DbClient,
  ctx: RequestContext,
  from: string,
  to: string,
  params: PageParams,
) {
  const allRows = await db
    .select({
      item_id: invoice_lines.item_id,
      name: sql<string>`max(${invoice_lines.item_name_snapshot})`,
      qty_sold: sql<string>`coalesce(sum(${invoice_lines.qty}), 0)`,
      revenue: sql<string>`coalesce(sum(${invoice_lines.taxable_amt}), 0)`,
      purchase_price: sql<string>`max(coalesce(${items.purchase_price}, 0))`,
      cost: sql<string>`coalesce(sum(${invoice_lines.qty} * coalesce(${items.purchase_price}, 0)), 0)`,
      gross_profit: sql<string>`coalesce(sum(${invoice_lines.taxable_amt}) - sum(${invoice_lines.qty} * coalesce(${items.purchase_price}, 0)), 0)`,
    })
    .from(invoice_lines)
    .innerJoin(invoices, eq(invoices.id, invoice_lines.invoice_id))
    .innerJoin(items, eq(items.id, invoice_lines.item_id))
    .where(
      and(
        eq(invoices.org_id, ctx.org_id),
        eq(invoices.status, 'posted'),
        isNull(invoices.deleted_at),
        gte(invoices.invoice_date, from),
        lte(invoices.invoice_date, to),
        eq(invoice_lines.is_free, false),
      ),
    )
    .groupBy(invoice_lines.item_id)
    .orderBy(desc(sql`sum(${invoice_lines.taxable_amt}) - sum(${invoice_lines.qty} * coalesce(${items.purchase_price}, 0))`));

  const totals = allRows.reduce(
    (acc, r) => ({
      revenue: acc.revenue.plus(r.revenue),
      cost: acc.cost.plus(r.cost),
      gross_profit: acc.gross_profit.plus(r.gross_profit),
    }),
    { revenue: new Decimal('0'), cost: new Decimal('0'), gross_profit: new Decimal('0') },
  );

  const all_with_margin = allRows.map((r) => ({
    ...r,
    margin_pct: new Decimal(r.revenue).isZero()
      ? '0.00'
      : new Decimal(r.gross_profit).div(r.revenue).times(100).toFixed(2),
  }));

  const pageItems = all_with_margin.slice(params.offset, params.offset + params.limit);

  return {
    from,
    to,
    items: pageItems,
    totals: {
      revenue: totals.revenue.toFixed(2),
      cost: totals.cost.toFixed(2),
      gross_profit: totals.gross_profit.toFixed(2),
      overall_margin_pct: totals.revenue.isZero()
        ? '0.00'
        : totals.gross_profit.div(totals.revenue).times(100).toFixed(2),
    },
    page: { total: allRows.length, limit: params.limit, offset: params.offset },
  };
}

// ─── Purchases: vendor ledger summary ─────────────────────────────────────────
export async function vendorLedger(
  db: DbClient,
  ctx: RequestContext,
  from: string,
  to: string,
  params: PageParams,
) {
  const where = and(
    eq(purchase_invoices.org_id, ctx.org_id),
    eq(purchase_invoices.status, 'posted'),
    isNull(purchase_invoices.deleted_at),
    gte(purchase_invoices.voucher_date, from),
    lte(purchase_invoices.voucher_date, to),
  );
  const countResult = await db
    .select({ total: sql<number>`count(distinct ${purchase_invoices.vendor_id})` })
    .from(purchase_invoices)
    .where(where);
  const total = countResult[0]?.total ?? 0;
  const rows = await db
    .select({
      vendor_id: purchase_invoices.vendor_id,
      name: sql<string>`coalesce(max(${vendors.name}), max(${purchase_invoices.vendor_name_snapshot}), 'Unknown Vendor')`,
      invoice_count: sql<number>`count(*)`,
      total_billed: sql<string>`coalesce(sum(${purchase_invoices.grand_total}), 0)`,
      total_paid: sql<string>`coalesce(sum(${purchase_invoices.amount_paid}), 0)`,
      balance: sql<string>`coalesce(sum(${purchase_invoices.balance_due}), 0)`,
      last_purchase: sql<string>`max(${purchase_invoices.voucher_date})`,
    })
    .from(purchase_invoices)
    .leftJoin(vendors, eq(vendors.id, purchase_invoices.vendor_id))
    .where(where)
    .groupBy(purchase_invoices.vendor_id)
    .orderBy(desc(sql`sum(${purchase_invoices.balance_due})`))
    .limit(params.limit)
    .offset(params.offset);
  return { from, to, vendors: rows, page: { total: Number(total), limit: params.limit, offset: params.offset } };
}

// ─── Financial: AP aging (vendor payables by overdue bucket) ─────────────────
export async function apAging(db: DbClient, ctx: RequestContext, asOf: string) {
  const rows = await db
    .select({
      vendor_id: purchase_invoices.vendor_id,
      vendor_name: sql<string>`coalesce(max(${vendors.name}), max(${purchase_invoices.vendor_name_snapshot}), 'Unknown')`,
      total_due: sql<string>`coalesce(sum(${purchase_invoices.balance_due}), 0)`,
      current_amt: sql<string>`coalesce(sum(case when ${purchase_invoices.due_date} is null or ${purchase_invoices.due_date} >= ${asOf}::date then ${purchase_invoices.balance_due} else 0 end), 0)`,
      d1_30: sql<string>`coalesce(sum(case when ${purchase_invoices.due_date} < ${asOf}::date and ${purchase_invoices.due_date} >= (${asOf}::date - interval '30 days') then ${purchase_invoices.balance_due} else 0 end), 0)`,
      d31_60: sql<string>`coalesce(sum(case when ${purchase_invoices.due_date} < (${asOf}::date - interval '30 days') and ${purchase_invoices.due_date} >= (${asOf}::date - interval '60 days') then ${purchase_invoices.balance_due} else 0 end), 0)`,
      d61_90: sql<string>`coalesce(sum(case when ${purchase_invoices.due_date} < (${asOf}::date - interval '60 days') and ${purchase_invoices.due_date} >= (${asOf}::date - interval '90 days') then ${purchase_invoices.balance_due} else 0 end), 0)`,
      d90_plus: sql<string>`coalesce(sum(case when ${purchase_invoices.due_date} < (${asOf}::date - interval '90 days') then ${purchase_invoices.balance_due} else 0 end), 0)`,
    })
    .from(purchase_invoices)
    .leftJoin(vendors, eq(vendors.id, purchase_invoices.vendor_id))
    .where(
      and(
        eq(purchase_invoices.org_id, ctx.org_id),
        isNull(purchase_invoices.deleted_at),
        sql`${purchase_invoices.balance_due} > 0`,
        lte(purchase_invoices.voucher_date, asOf),
      ),
    )
    .groupBy(purchase_invoices.vendor_id)
    .orderBy(desc(sql`sum(${purchase_invoices.balance_due})`));

  const totals = rows.reduce(
    (acc, r) => ({
      total_due: acc.total_due.plus(r.total_due),
      current_amt: acc.current_amt.plus(r.current_amt),
      d1_30: acc.d1_30.plus(r.d1_30),
      d31_60: acc.d31_60.plus(r.d31_60),
      d61_90: acc.d61_90.plus(r.d61_90),
      d90_plus: acc.d90_plus.plus(r.d90_plus),
    }),
    {
      total_due: new Decimal('0'),
      current_amt: new Decimal('0'),
      d1_30: new Decimal('0'),
      d31_60: new Decimal('0'),
      d61_90: new Decimal('0'),
      d90_plus: new Decimal('0'),
    },
  );

  return {
    as_of: asOf,
    vendors: rows,
    totals: {
      total_due: totals.total_due.toFixed(2),
      current_amt: totals.current_amt.toFixed(2),
      d1_30: totals.d1_30.toFixed(2),
      d31_60: totals.d31_60.toFixed(2),
      d61_90: totals.d61_90.toFixed(2),
      d90_plus: totals.d90_plus.toFixed(2),
    },
  };
}

// ─── GST: GSTR-3B summary ─────────────────────────────────────────────────────
export async function gstr3bSummary(db: DbClient, ctx: RequestContext, period: string) {
  const from = `${period}-01`;
  const [y, m] = period.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const to = `${period}-${String(lastDay).padStart(2, '0')}`;

  const [outward] = await db
    .select({
      taxable: sql<string>`coalesce(sum(${invoices.taxable_total}), 0)`,
      cgst: sql<string>`coalesce(sum(${invoices.cgst_total}), 0)`,
      sgst: sql<string>`coalesce(sum(${invoices.sgst_total}), 0)`,
      igst: sql<string>`coalesce(sum(${invoices.igst_total}), 0)`,
      cess: sql<string>`coalesce(sum(${invoices.cess_total}), 0)`,
    })
    .from(invoices)
    .where(and(POSTED(ctx.org_id), gte(invoices.invoice_date, from), lte(invoices.invoice_date, to)));

  const [returns] = await db
    .select({
      taxable: sql<string>`coalesce(sum(${credit_notes.taxable_total}), 0)`,
      cgst: sql<string>`coalesce(sum(${credit_notes.cgst_total}), 0)`,
      sgst: sql<string>`coalesce(sum(${credit_notes.sgst_total}), 0)`,
      igst: sql<string>`coalesce(sum(${credit_notes.igst_total}), 0)`,
    })
    .from(credit_notes)
    .where(
      and(
        eq(credit_notes.org_id, ctx.org_id),
        eq(credit_notes.status, 'posted'),
        isNull(credit_notes.deleted_at),
        gte(credit_notes.credit_note_date, from),
        lte(credit_notes.credit_note_date, to),
      ),
    );

  const [inward] = await db
    .select({
      taxable: sql<string>`coalesce(sum(${purchase_invoices.taxable_total}), 0)`,
      cgst: sql<string>`coalesce(sum(${purchase_invoices.cgst_total}), 0)`,
      sgst: sql<string>`coalesce(sum(${purchase_invoices.sgst_total}), 0)`,
      igst: sql<string>`coalesce(sum(${purchase_invoices.igst_total}), 0)`,
    })
    .from(purchase_invoices)
    .where(
      and(
        eq(purchase_invoices.org_id, ctx.org_id),
        eq(purchase_invoices.status, 'posted'),
        isNull(purchase_invoices.deleted_at),
        gte(purchase_invoices.voucher_date, from),
        lte(purchase_invoices.voucher_date, to),
        eq(purchase_invoices.reverse_charge, false),
      ),
    );

  const D = Decimal;
  const netCgst = new D(outward!.cgst).minus(returns!.cgst).toFixed(2);
  const netSgst = new D(outward!.sgst).minus(returns!.sgst).toFixed(2);
  const netIgst = new D(outward!.igst).minus(returns!.igst).toFixed(2);
  const netOutput = new D(netCgst).plus(netSgst).plus(netIgst).toFixed(2);
  const inputCredit = new D(inward!.cgst).plus(inward!.sgst).plus(inward!.igst).toFixed(2);
  const netPayable = new D(netOutput).minus(inputCredit).toFixed(2);

  return {
    period,
    from,
    to,
    output: {
      taxable: new D(outward!.taxable).minus(returns!.taxable).toFixed(2),
      cgst: netCgst,
      sgst: netSgst,
      igst: netIgst,
      cess: outward!.cess,
    },
    input_credit: {
      taxable: inward!.taxable,
      cgst: inward!.cgst,
      sgst: inward!.sgst,
      igst: inward!.igst,
    },
    net_output_tax: netOutput,
    total_itc: inputCredit,
    net_tax_payable: netPayable,
  };
}

// ─── Phase 3 ───────────────────────────────────────────────────────────────────

// ─── Sales: salesperson performance ───────────────────────────────────────────
export async function salespersonPerformance(
  db: DbClient,
  ctx: RequestContext,
  from: string,
  to: string,
  params: PageParams,
) {
  const where = and(POSTED(ctx.org_id), gte(invoices.invoice_date, from), lte(invoices.invoice_date, to));
  const countResult = await db
    .select({ total: sql<number>`count(distinct ${invoices.salesperson_id})` })
    .from(invoices)
    .where(where);
  const total = countResult[0]?.total ?? 0;
  const rows = await db
    .select({
      salesperson_id: invoices.salesperson_id,
      name: sql<string>`coalesce(max(${users.name}), 'Unassigned')`,
      invoice_count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(${invoices.grand_total}), 0)`,
      taxable: sql<string>`coalesce(sum(${invoices.taxable_total}), 0)`,
      avg_value: sql<string>`coalesce(avg(${invoices.grand_total}), 0)`,
      total_collected: sql<string>`coalesce(sum(${invoices.amount_paid}), 0)`,
    })
    .from(invoices)
    .leftJoin(users, eq(users.id, invoices.salesperson_id))
    .where(where)
    .groupBy(invoices.salesperson_id)
    .orderBy(desc(sql`sum(${invoices.grand_total})`))
    .limit(params.limit)
    .offset(params.offset);
  return { from, to, salespersons: rows, page: { total: Number(total), limit: params.limit, offset: params.offset } };
}

// ─── Sales: category-wise sales ───────────────────────────────────────────────
export async function categoryWiseSales(
  db: DbClient,
  ctx: RequestContext,
  from: string,
  to: string,
  params: PageParams,
) {
  const where = and(
    POSTED(ctx.org_id),
    gte(invoices.invoice_date, from),
    lte(invoices.invoice_date, to),
    eq(invoice_lines.is_free, false),
  );
  const countResult = await db
    .select({ total: sql<number>`count(distinct ${items.category_id})` })
    .from(invoice_lines)
    .innerJoin(invoices, eq(invoices.id, invoice_lines.invoice_id))
    .innerJoin(items, eq(items.id, invoice_lines.item_id))
    .where(where);
  const total = countResult[0]?.total ?? 0;
  const rows = await db
    .select({
      category_id: items.category_id,
      category_name: sql<string>`coalesce(max(${categories.name}), 'Uncategorized')`,
      item_count: sql<number>`count(distinct ${invoice_lines.item_id})`,
      invoice_count: sql<number>`count(distinct ${invoices.id})`,
      qty: sql<string>`coalesce(sum(${invoice_lines.qty}), 0)`,
      taxable: sql<string>`coalesce(sum(${invoice_lines.taxable_amt}), 0)`,
      total: sql<string>`coalesce(sum(${invoice_lines.total}), 0)`,
      discount: sql<string>`coalesce(sum(${invoice_lines.discount_amt}), 0)`,
    })
    .from(invoice_lines)
    .innerJoin(invoices, eq(invoices.id, invoice_lines.invoice_id))
    .innerJoin(items, eq(items.id, invoice_lines.item_id))
    .leftJoin(categories, eq(categories.id, items.category_id))
    .where(where)
    .groupBy(items.category_id)
    .orderBy(desc(sql`sum(${invoice_lines.total})`))
    .limit(params.limit)
    .offset(params.offset);
  return { from, to, categories: rows, page: { total: Number(total), limit: params.limit, offset: params.offset } };
}

// ─── Stock: location-wise current stock ────────────────────────────────────────
export async function locationWiseStock(db: DbClient, ctx: RequestContext, params: PageParams) {
  const where = and(eq(stock_ledger.org_id, ctx.org_id), eq(items.track_inventory, true));
  const countResult = await db
    .select({ total: sql<number>`count(distinct (${stock_ledger.item_id}, ${stock_ledger.location_id}))` })
    .from(stock_ledger)
    .innerJoin(items, and(eq(items.id, stock_ledger.item_id), isNull(items.deleted_at)))
    .where(where);
  const total = countResult[0]?.total ?? 0;
  const rows = await db
    .select({
      item_id: stock_ledger.item_id,
      item_name: sql<string>`max(${items.name})`,
      item_sku: sql<string>`max(${items.sku})`,
      location_id: stock_ledger.location_id,
      location_name: sql<string>`max(${locations.name})`,
      qty: sql<string>`coalesce(sum(${stock_ledger.qty_in}) - sum(${stock_ledger.qty_out}), 0)`,
    })
    .from(stock_ledger)
    .innerJoin(items, and(eq(items.id, stock_ledger.item_id), isNull(items.deleted_at)))
    .innerJoin(locations, eq(locations.id, stock_ledger.location_id))
    .where(where)
    .groupBy(stock_ledger.item_id, stock_ledger.location_id)
    .having(sql`sum(${stock_ledger.qty_in}) - sum(${stock_ledger.qty_out}) != 0`)
    .orderBy(sql`max(${locations.name})`, sql`max(${items.name})`)
    .limit(params.limit)
    .offset(params.offset);
  return { items: rows, page: { total: Number(total), limit: params.limit, offset: params.offset } };
}

// ─── Financial: outstanding invoice register ───────────────────────────────────
export async function outstandingInvoices(
  db: DbClient,
  ctx: RequestContext,
  asOf: string,
  params: PageParams,
) {
  // Fetch all for correct totals, then slice for page
  const allRows = await db
    .select({
      id: invoices.id,
      invoice_no: invoices.invoice_no,
      invoice_date: invoices.invoice_date,
      customer_name: sql<string>`coalesce(${invoices.customer_name_snapshot}, 'Walk-in')`,
      grand_total: invoices.grand_total,
      amount_paid: invoices.amount_paid,
      balance_due: invoices.balance_due,
      due_date: invoices.due_date,
      payment_status: invoices.payment_status,
      days_overdue: sql<number>`case when ${invoices.due_date} is not null and ${invoices.due_date} < ${asOf}::date then (${asOf}::date - ${invoices.due_date})::int else 0 end`,
    })
    .from(invoices)
    .where(
      and(
        POSTED(ctx.org_id),
        sql`${invoices.balance_due} > 0`,
        lte(invoices.invoice_date, asOf),
      ),
    )
    .orderBy(desc(invoices.due_date), desc(invoices.invoice_date));

  const total_outstanding = allRows
    .reduce((s, r) => s.plus(r.balance_due), new Decimal('0'))
    .toFixed(2);
  const overdue_count = allRows.filter((r) => r.days_overdue > 0).length;
  const overdue_amount = allRows
    .filter((r) => r.days_overdue > 0)
    .reduce((s, r) => s.plus(r.balance_due), new Decimal('0'))
    .toFixed(2);

  const pageInvoices = allRows.slice(params.offset, params.offset + params.limit);
  return {
    as_of: asOf,
    invoices: pageInvoices,
    total_outstanding,
    overdue_count,
    overdue_amount,
    page: { total: allRows.length, limit: params.limit, offset: params.offset },
  };
}

// ─── Financial: P&L summary (monthly) ─────────────────────────────────────────
export async function profitAndLoss(db: DbClient, ctx: RequestContext, from: string, to: string) {
  const [salesRows, returnsRows, purchaseRows] = await Promise.all([
    db
      .select({
        month: sql<string>`to_char(${invoices.invoice_date}::date, 'YYYY-MM')`,
        revenue: sql<string>`coalesce(sum(${invoices.grand_total}), 0)`,
        taxable: sql<string>`coalesce(sum(${invoices.taxable_total}), 0)`,
        gst: sql<string>`coalesce(sum(${invoices.cgst_total} + ${invoices.sgst_total} + ${invoices.igst_total}), 0)`,
      })
      .from(invoices)
      .where(and(POSTED(ctx.org_id), gte(invoices.invoice_date, from), lte(invoices.invoice_date, to)))
      .groupBy(sql`to_char(${invoices.invoice_date}::date, 'YYYY-MM')`)
      .orderBy(sql`to_char(${invoices.invoice_date}::date, 'YYYY-MM')`),
    db
      .select({
        month: sql<string>`to_char(${credit_notes.credit_note_date}::date, 'YYYY-MM')`,
        returns: sql<string>`coalesce(sum(${credit_notes.grand_total}), 0)`,
      })
      .from(credit_notes)
      .where(
        and(
          eq(credit_notes.org_id, ctx.org_id),
          eq(credit_notes.status, 'posted'),
          isNull(credit_notes.deleted_at),
          gte(credit_notes.credit_note_date, from),
          lte(credit_notes.credit_note_date, to),
        ),
      )
      .groupBy(sql`to_char(${credit_notes.credit_note_date}::date, 'YYYY-MM')`)
      .orderBy(sql`to_char(${credit_notes.credit_note_date}::date, 'YYYY-MM')`),
    db
      .select({
        month: sql<string>`to_char(${purchase_invoices.voucher_date}::date, 'YYYY-MM')`,
        purchases: sql<string>`coalesce(sum(${purchase_invoices.grand_total}), 0)`,
      })
      .from(purchase_invoices)
      .where(
        and(
          eq(purchase_invoices.org_id, ctx.org_id),
          eq(purchase_invoices.status, 'posted'),
          isNull(purchase_invoices.deleted_at),
          gte(purchase_invoices.voucher_date, from),
          lte(purchase_invoices.voucher_date, to),
        ),
      )
      .groupBy(sql`to_char(${purchase_invoices.voucher_date}::date, 'YYYY-MM')`)
      .orderBy(sql`to_char(${purchase_invoices.voucher_date}::date, 'YYYY-MM')`),
  ]);

  // Build unified month list
  const months = Array.from(
    new Set([
      ...salesRows.map((r) => r.month),
      ...returnsRows.map((r) => r.month),
      ...purchaseRows.map((r) => r.month),
    ]),
  ).sort();

  const returnsMap = new Map(returnsRows.map((r) => [r.month, r.returns]));
  const purchasesMap = new Map(purchaseRows.map((r) => [r.month, r.purchases]));
  const salesMap = new Map(salesRows.map((r) => [r, r.month]));

  const monthly = months.map((month) => {
    const s = salesRows.find((r) => r.month === month);
    const revenue = s?.revenue ?? '0';
    const returns_ = returnsMap.get(month) ?? '0';
    const purchases = purchasesMap.get(month) ?? '0';
    const net_revenue = new Decimal(revenue).minus(returns_).toFixed(2);
    const gross_profit = new Decimal(net_revenue).minus(purchases).toFixed(2);
    return { month, revenue, returns: returns_, purchases, net_revenue, gross_profit };
  });

  const totals = monthly.reduce(
    (acc, r) => ({
      revenue: acc.revenue.plus(r.revenue),
      returns: acc.returns.plus(r.returns),
      purchases: acc.purchases.plus(r.purchases),
      net_revenue: acc.net_revenue.plus(r.net_revenue),
      gross_profit: acc.gross_profit.plus(r.gross_profit),
    }),
    {
      revenue: new Decimal('0'),
      returns: new Decimal('0'),
      purchases: new Decimal('0'),
      net_revenue: new Decimal('0'),
      gross_profit: new Decimal('0'),
    },
  );

  return {
    from,
    to,
    monthly,
    totals: {
      revenue: totals.revenue.toFixed(2),
      returns: totals.returns.toFixed(2),
      purchases: totals.purchases.toFixed(2),
      net_revenue: totals.net_revenue.toFixed(2),
      gross_profit: totals.gross_profit.toFixed(2),
      gross_margin_pct: totals.net_revenue.isZero()
        ? '0.00'
        : totals.gross_profit.div(totals.net_revenue).times(100).toFixed(2),
    },
  };
}

