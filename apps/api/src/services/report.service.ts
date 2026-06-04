import type { DbClient } from '@counter/db';
import {
  customers,
  invoice_lines,
  invoices,
  items,
  purchase_invoices,
  stock_ledger,
  vendors,
} from '@counter/db';
import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import type { RequestContext } from '../context.js';

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
export async function salesByItem(db: DbClient, ctx: RequestContext, from: string, to: string) {
  const rows = await db
    .select({
      item_id: invoice_lines.item_id,
      name: sql<string>`max(${invoice_lines.item_name_snapshot})`,
      qty: sql<string>`coalesce(sum(${invoice_lines.qty}), 0)`,
      taxable: sql<string>`coalesce(sum(${invoice_lines.taxable_amt}), 0)`,
      total: sql<string>`coalesce(sum(${invoice_lines.total}), 0)`,
    })
    .from(invoice_lines)
    .innerJoin(invoices, eq(invoices.id, invoice_lines.invoice_id))
    .where(
      and(POSTED(ctx.org_id), gte(invoices.invoice_date, from), lte(invoices.invoice_date, to)),
    )
    .groupBy(invoice_lines.item_id)
    .orderBy(desc(sql`sum(${invoice_lines.total})`))
    .limit(200);

  return { from, to, items: rows };
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
export async function stockValuation(db: DbClient, ctx: RequestContext) {
  const rows = await db
    .select({
      item_id: stock_ledger.item_id,
      name: sql<string>`max(${items.name})`,
      sku: sql<string>`max(${items.sku})`,
      qty: sql<string>`coalesce(sum(${stock_ledger.qty_in}) - sum(${stock_ledger.qty_out}), 0)`,
      avg_cost: sql<string>`max(${items.purchase_price})`,
    })
    .from(stock_ledger)
    .innerJoin(items, eq(items.id, stock_ledger.item_id))
    .where(eq(stock_ledger.org_id, ctx.org_id))
    .groupBy(stock_ledger.item_id)
    .orderBy(desc(sql`sum(${stock_ledger.qty_in}) - sum(${stock_ledger.qty_out})`));

  let totalValue = 0;
  const withValue = rows.map((r) => {
    const value = Number(r.qty) * Number(r.avg_cost ?? 0);
    totalValue += value;
    return { ...r, value: value.toFixed(2) };
  });

  return { total_value: totalValue.toFixed(2), items: withValue };
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
