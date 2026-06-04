import type { DbClient } from '@counter/db';
import { audit_log, item_barcodes, items, stock_ledger } from '@counter/db';
import type { CreateItemInput, UpdateItemInput } from '@counter/schemas';
import { newItemId } from '@counter/utils';
import { and, desc, eq, ilike, isNull, lt, or, sql } from 'drizzle-orm';
import type { RequestContext } from '../context.js';
import { BusinessError, ConflictError, NotFoundError } from '../errors.js';

export async function createItem(db: DbClient, ctx: RequestContext, input: CreateItemInput) {
  return await db.transaction(async (trx) => {
    // Check SKU uniqueness within org
    const existing = await trx
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.org_id, ctx.org_id), eq(items.sku, input.sku), isNull(items.deleted_at)))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictError(`SKU "${input.sku}" is already in use`);
    }

    const itemId = input.client_id as string;
    const now = new Date();

    await trx.insert(items).values({
      id: itemId,
      org_id: ctx.org_id,
      sku: input.sku,
      name: input.name,
      short_name: input.short_name ?? null,
      description: input.description ?? null,
      category_id: input.category_id ?? null,
      brand_id: input.brand_id ?? null,
      hsn_code: input.hsn_code ?? null,
      primary_unit_id: input.primary_unit_id,
      tax_rate_id: input.tax_rate_id,
      mrp: input.pricing.mrp ?? null,
      sale_price: input.pricing.sale_price,
      purchase_price: input.pricing.purchase_price ?? null,
      price_includes_tax: input.pricing.tax_inclusive,
      min_sale_price: input.pricing.min_sale_price ?? null,
      max_discount_pct: input.pricing.max_discount_pct ?? null,
      track_inventory: input.flags.track_inventory,
      is_service: input.flags.is_service,
      is_batched: input.flags.is_batched,
      allow_negative_stock: input.flags.allow_negative_stock,
      has_variants: input.flags.has_variants,
      reorder_level: input.stock_levels?.reorder_level ?? null,
      reorder_qty: input.stock_levels?.reorder_qty ?? null,
      max_stock: input.stock_levels?.max_stock ?? null,
      lead_time_days: input.stock_levels?.lead_time_days ?? null,
      shelf_life_days: input.stock_levels?.shelf_life_days ?? null,
      status: input.status ?? 'active',
      custom_fields: input.custom_fields ?? {},
      tags: input.tags ?? [],
      created_by: ctx.user_id,
      updated_by: ctx.user_id,
    });

    // Insert barcodes
    if (input.barcodes && input.barcodes.length > 0) {
      await trx.insert(item_barcodes).values(
        input.barcodes.map((b) => ({
          id: crypto.randomUUID(),
          org_id: ctx.org_id,
          item_id: itemId,
          barcode: b.barcode,
          symbology: b.symbology,
          unit_id: b.unit_id,
          is_primary: b.is_primary,
        })),
      );
    }

    // Opening stock entries
    if (input.opening_stock && input.opening_stock.length > 0 && input.flags.track_inventory) {
      await trx.insert(stock_ledger).values(
        input.opening_stock.map((os) => ({
          id: crypto.randomUUID(),
          org_id: ctx.org_id,
          item_id: itemId,
          location_id: os.location_id,
          batch_id: null,
          txn_type: 'opening',
          txn_date: new Date(os.as_of_date),
          qty_in: os.qty,
          qty_out: '0',
          balance_qty: os.qty,
          rate: os.rate,
          value: String(Number(os.qty) * Number(os.rate)),
          ref_table: 'items',
          ref_id: itemId,
          created_by: ctx.user_id,
        })),
      );
    }

    // Audit log
    await trx.insert(audit_log).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      ip: ctx.ip,
      entity_table: 'items',
      entity_id: itemId,
      action: 'create',
      before_json: null,
      after_json: { sku: input.sku, name: input.name },
    });

    return { id: itemId, sku: input.sku, name: input.name };
  });
}

export async function updateItem(
  db: DbClient,
  ctx: RequestContext,
  itemId: string,
  input: UpdateItemInput,
  expectedVersion: number,
) {
  // Map the (partial) nested input shape to flat columns.
  const patch: Record<string, unknown> = {
    updated_at: new Date(),
    updated_by: ctx.user_id,
    row_version: sql`${items.row_version} + 1`,
  };
  if (input.sku !== undefined) patch['sku'] = input.sku;
  if (input.name !== undefined) patch['name'] = input.name;
  if (input.short_name !== undefined) patch['short_name'] = input.short_name;
  if (input.description !== undefined) patch['description'] = input.description;
  if (input.hsn_code !== undefined) patch['hsn_code'] = input.hsn_code;
  if (input.primary_unit_id !== undefined) patch['primary_unit_id'] = input.primary_unit_id;
  if (input.tax_rate_id !== undefined) patch['tax_rate_id'] = input.tax_rate_id;
  if (input.status !== undefined) patch['status'] = input.status;
  if (input.pricing) {
    const p = input.pricing;
    if (p.mrp !== undefined) patch['mrp'] = p.mrp;
    if (p.sale_price !== undefined) patch['sale_price'] = p.sale_price;
    if (p.purchase_price !== undefined) patch['purchase_price'] = p.purchase_price;
    if (p.tax_inclusive !== undefined) patch['price_includes_tax'] = p.tax_inclusive;
    if (p.min_sale_price !== undefined) patch['min_sale_price'] = p.min_sale_price;
    if (p.max_discount_pct !== undefined) patch['max_discount_pct'] = p.max_discount_pct;
  }
  if (input.flags) {
    const f = input.flags;
    if (f.track_inventory !== undefined) patch['track_inventory'] = f.track_inventory;
    if (f.is_service !== undefined) patch['is_service'] = f.is_service;
    if (f.is_batched !== undefined) patch['is_batched'] = f.is_batched;
    if (f.allow_negative_stock !== undefined)
      patch['allow_negative_stock'] = f.allow_negative_stock;
    if (f.has_variants !== undefined) patch['has_variants'] = f.has_variants;
  }

  return await db.transaction(async (trx) => {
    const result = await trx
      .update(items)
      .set(patch)
      .where(
        and(
          eq(items.id, itemId),
          eq(items.org_id, ctx.org_id),
          eq(items.row_version, expectedVersion),
          isNull(items.deleted_at),
        ),
      )
      .returning({ id: items.id, row_version: items.row_version });

    if (result.length === 0) {
      const [exists] = await trx
        .select({ id: items.id })
        .from(items)
        .where(and(eq(items.id, itemId), eq(items.org_id, ctx.org_id)));
      if (!exists) throw new NotFoundError('Item', itemId);
      throw new ConflictError('Item was modified by another user — refresh and retry');
    }

    await trx.insert(audit_log).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      ip: ctx.ip,
      entity_table: 'items',
      entity_id: itemId,
      action: 'update',
      before_json: null,
      after_json: { sku: input.sku, name: input.name, status: input.status },
    });

    return result[0];
  });
}

export async function getItemLookup(db: DbClient, ctx: RequestContext, query: string, limit = 20) {
  const results = await db
    .select({
      id: items.id,
      sku: items.sku,
      name: items.name,
      sale_price: items.sale_price,
      primary_unit_id: items.primary_unit_id,
      is_batched: items.is_batched,
      tax_rate_id: items.tax_rate_id,
      hsn_code: items.hsn_code,
    })
    .from(items)
    .where(
      and(
        eq(items.org_id, ctx.org_id),
        eq(items.status, 'active'),
        isNull(items.deleted_at),
        or(ilike(items.name, `%${query}%`), ilike(items.sku, `%${query}%`)),
      ),
    )
    .limit(limit);

  return results.map((item) => ({
    id: item.id,
    sku: item.sku,
    name: item.name,
    sale_price: String(item.sale_price ?? '0.00'),
    current_stock: null, // derived from stock_ledger, not stored
    unit: item.primary_unit_id,
    is_batched: item.is_batched,
    tax_rate_id: item.tax_rate_id,
    hsn_code: item.hsn_code,
  }));
}

export interface ListItemsParams {
  q?: string | undefined;
  status?: string | undefined;
  limit: number;
  cursor?: string | undefined; // item id to page after (UUID v7 is time-ordered)
}

export async function listItems(db: DbClient, ctx: RequestContext, params: ListItemsParams) {
  const conditions = [eq(items.org_id, ctx.org_id), isNull(items.deleted_at)];
  if (params.status) conditions.push(eq(items.status, params.status));
  if (params.q) {
    const match = or(ilike(items.name, `%${params.q}%`), ilike(items.sku, `%${params.q}%`));
    if (match) conditions.push(match);
  }
  // Cursor pagination: descending id (newest first); fetch rows with id < cursor.
  if (params.cursor) conditions.push(lt(items.id, params.cursor));

  const rows = await db
    .select({
      id: items.id,
      sku: items.sku,
      name: items.name,
      sale_price: items.sale_price,
      mrp: items.mrp,
      status: items.status,
      is_service: items.is_service,
      is_batched: items.is_batched,
      hsn_code: items.hsn_code,
      tax_rate_id: items.tax_rate_id,
      primary_unit_id: items.primary_unit_id,
    })
    .from(items)
    .where(and(...conditions))
    .orderBy(desc(items.id))
    .limit(params.limit + 1);

  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;

  return {
    data: page.map((r) => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      sale_price: String(r.sale_price ?? '0.00'),
      mrp: r.mrp ? String(r.mrp) : null,
      status: r.status,
      is_service: r.is_service,
      is_batched: r.is_batched,
      hsn_code: r.hsn_code,
      tax_rate_id: r.tax_rate_id,
      unit: r.primary_unit_id,
      current_stock: null as string | null, // derived from stock_ledger (§1.2)
    })),
    page: {
      limit: params.limit,
      next_cursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      has_more: hasMore,
    },
  };
}

export async function getItemById(db: DbClient, ctx: RequestContext, itemId: string) {
  const [item] = await db
    .select()
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.org_id, ctx.org_id), isNull(items.deleted_at)));
  if (!item) throw new NotFoundError('Item', itemId);

  // Current stock per location, derived from the ledger (never a column).
  const stockRows = await db
    .select({
      location_id: stock_ledger.location_id,
      qty_in: sql<string>`coalesce(sum(${stock_ledger.qty_in}), 0)`,
      qty_out: sql<string>`coalesce(sum(${stock_ledger.qty_out}), 0)`,
    })
    .from(stock_ledger)
    .where(and(eq(stock_ledger.org_id, ctx.org_id), eq(stock_ledger.item_id, itemId)))
    .groupBy(stock_ledger.location_id);

  const current_stock = stockRows.map((s) => ({
    location_id: s.location_id,
    qty: String(Number(s.qty_in) - Number(s.qty_out)),
  }));

  const barcodes = await db
    .select()
    .from(item_barcodes)
    .where(and(eq(item_barcodes.item_id, itemId), isNull(item_barcodes.deleted_at)));

  return { ...item, current_stock, barcodes };
}

export async function softDeleteItem(
  db: DbClient,
  ctx: RequestContext,
  itemId: string,
): Promise<void> {
  const [item] = await db
    .select({ id: items.id, row_version: items.row_version })
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.org_id, ctx.org_id), isNull(items.deleted_at)));

  if (!item) throw new NotFoundError('Item', itemId);

  await db.transaction(async (trx) => {
    await trx
      .update(items)
      .set({
        deleted_at: new Date(),
        deleted_by: ctx.user_id,
        updated_at: new Date(),
        updated_by: ctx.user_id,
      })
      .where(and(eq(items.id, itemId), eq(items.org_id, ctx.org_id)));

    await trx.insert(audit_log).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      ip: ctx.ip,
      entity_table: 'items',
      entity_id: itemId,
      action: 'delete',
      before_json: { id: itemId },
      after_json: { deleted: true },
    });
  });
}
