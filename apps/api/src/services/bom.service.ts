import type { DbClient } from '@counter/db';
import { audit_log, bom_headers, bom_items, items, units } from '@counter/db';
import type { CreateBomInput, UpdateBomInput } from '@counter/schemas';
import { type BomId, newId } from '@counter/utils';
import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import type { RequestContext } from '../context.js';
import { NotFoundError } from '../errors.js';

// Transaction handle type, extracted from the Drizzle client.
type Trx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

/** Ensure the finished item exists in this org and is flagged as a finished good. */
async function loadFinishedItem(trx: Trx, orgId: string, itemId: string) {
  const [item] = await trx
    .select({ id: items.id, name: items.name, is_finished_good: items.is_finished_good })
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.org_id, orgId), isNull(items.deleted_at)));
  if (!item) throw new NotFoundError('Item', itemId);
  return item;
}

/** Deactivate every other active BOM for the same finished item (one active recipe). */
async function deactivateSiblings(
  trx: Trx,
  ctx: RequestContext,
  finishedItemId: string,
  keepBomId: string,
) {
  await trx
    .update(bom_headers)
    .set({ is_active: false, updated_at: new Date(), updated_by: ctx.user_id })
    .where(
      and(
        eq(bom_headers.org_id, ctx.org_id),
        eq(bom_headers.finished_item_id, finishedItemId),
        eq(bom_headers.is_active, true),
        sql`${bom_headers.id} != ${keepBomId}`,
        isNull(bom_headers.deleted_at),
      ),
    );
}

async function insertLines(
  trx: Trx,
  ctx: RequestContext,
  bomId: string,
  lines: CreateBomInput['lines'],
) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const [rawItem] = await trx
      .select({ id: items.id })
      .from(items)
      .where(
        and(eq(items.id, line.raw_item_id), eq(items.org_id, ctx.org_id), isNull(items.deleted_at)),
      );
    if (!rawItem) throw new NotFoundError('Item', line.raw_item_id);

    await trx.insert(bom_items).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      bom_header_id: bomId,
      line_no: i + 1,
      raw_item_id: line.raw_item_id,
      qty: line.qty,
      unit_id: line.unit_id,
      wastage_pct: line.wastage_pct ?? '0',
    });
  }
}

export async function createBom(db: DbClient, ctx: RequestContext, input: CreateBomInput) {
  return await db.transaction(async (trx) => {
    const finishedItem = await loadFinishedItem(trx, ctx.org_id, input.finished_item_id);

    // Next version for this finished item.
    const [maxRow] = await trx
      .select({ max: sql<number>`coalesce(max(${bom_headers.version}), 0)` })
      .from(bom_headers)
      .where(
        and(
          eq(bom_headers.org_id, ctx.org_id),
          eq(bom_headers.finished_item_id, input.finished_item_id),
        ),
      );
    const version = Number(maxRow?.max ?? 0) + 1;

    const bomId = newId<BomId>();

    await trx.insert(bom_headers).values({
      id: bomId,
      org_id: ctx.org_id,
      finished_item_id: input.finished_item_id,
      version,
      name: input.name ?? `${finishedItem.name} recipe v${version}`,
      output_qty: input.output_qty,
      output_unit_id: input.output_unit_id,
      labor_cost: input.labor_cost ?? '0',
      overhead_cost: input.overhead_cost ?? '0',
      notes: input.notes ?? null,
      is_active: input.is_active,
      status: 'active',
      created_by: ctx.user_id,
      updated_by: ctx.user_id,
    });

    await insertLines(trx, ctx, bomId, input.lines);

    if (input.is_active) {
      await deactivateSiblings(trx, ctx, input.finished_item_id, bomId);
    }

    await trx.insert(audit_log).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      ip: ctx.ip,
      entity_table: 'bom_headers',
      entity_id: bomId,
      action: 'create',
      before_json: null,
      after_json: { finished_item_id: input.finished_item_id, version },
    });

    return { id: bomId, version };
  });
}

export async function updateBom(
  db: DbClient,
  ctx: RequestContext,
  bomId: string,
  input: UpdateBomInput,
) {
  return await db.transaction(async (trx) => {
    const [bom] = await trx
      .select()
      .from(bom_headers)
      .where(
        and(
          eq(bom_headers.id, bomId),
          eq(bom_headers.org_id, ctx.org_id),
          isNull(bom_headers.deleted_at),
        ),
      )
      .for('update');
    if (!bom) throw new NotFoundError('Bom', bomId);

    const now = new Date();

    await trx
      .update(bom_headers)
      .set({
        name: input.name ?? bom.name,
        output_qty: input.output_qty,
        output_unit_id: input.output_unit_id,
        labor_cost: input.labor_cost ?? '0',
        overhead_cost: input.overhead_cost ?? '0',
        notes: input.notes ?? null,
        is_active: input.is_active,
        updated_at: now,
        updated_by: ctx.user_id,
        row_version: sql`${bom_headers.row_version} + 1`,
      })
      .where(and(eq(bom_headers.id, bomId), eq(bom_headers.org_id, ctx.org_id)));

    // Replace recipe lines wholesale (child rows, not append-only).
    await trx.delete(bom_items).where(eq(bom_items.bom_header_id, bomId));
    await insertLines(trx, ctx, bomId, input.lines);

    if (input.is_active) {
      await deactivateSiblings(trx, ctx, bom.finished_item_id, bomId);
    }

    await trx.insert(audit_log).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      ip: ctx.ip,
      entity_table: 'bom_headers',
      entity_id: bomId,
      action: 'update',
      before_json: { is_active: bom.is_active },
      after_json: { is_active: input.is_active },
    });

    return { id: bomId, version: bom.version };
  });
}

export async function getBomById(db: DbClient, ctx: RequestContext, bomId: string) {
  const [bom] = await db
    .select()
    .from(bom_headers)
    .where(
      and(
        eq(bom_headers.id, bomId),
        eq(bom_headers.org_id, ctx.org_id),
        isNull(bom_headers.deleted_at),
      ),
    );
  if (!bom) throw new NotFoundError('Bom', bomId);

  const lines = await db
    .select({
      id: bom_items.id,
      raw_item_id: bom_items.raw_item_id,
      raw_item_name: items.name,
      qty: bom_items.qty,
      unit_id: bom_items.unit_id,
      unit_symbol: units.abbreviation,
      wastage_pct: bom_items.wastage_pct,
    })
    .from(bom_items)
    .innerJoin(items, eq(items.id, bom_items.raw_item_id))
    .leftJoin(units, eq(units.id, bom_items.unit_id))
    .where(eq(bom_items.bom_header_id, bomId))
    .orderBy(bom_items.line_no);

  return { ...bom, lines };
}

export async function listBoms(
  db: DbClient,
  ctx: RequestContext,
  params: { limit: number; cursor?: string | undefined },
) {
  const conditions = [eq(bom_headers.org_id, ctx.org_id), isNull(bom_headers.deleted_at)];
  if (params.cursor) conditions.push(lt(bom_headers.id, params.cursor));

  const rows = await db
    .select({
      id: bom_headers.id,
      finished_item_id: bom_headers.finished_item_id,
      finished_item_name: items.name,
      finished_item_sku: items.sku,
      name: bom_headers.name,
      version: bom_headers.version,
      output_qty: bom_headers.output_qty,
      is_active: bom_headers.is_active,
      status: bom_headers.status,
      line_count: sql<number>`(select count(*) from ${bom_items} where ${bom_items.bom_header_id} = ${bom_headers.id})`,
      updated_at: bom_headers.updated_at,
    })
    .from(bom_headers)
    .innerJoin(items, eq(items.id, bom_headers.finished_item_id))
    .where(and(...conditions))
    .orderBy(desc(bom_headers.id))
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

export async function deleteBom(db: DbClient, ctx: RequestContext, bomId: string) {
  return await db.transaction(async (trx) => {
    const [bom] = await trx
      .select({ id: bom_headers.id })
      .from(bom_headers)
      .where(
        and(
          eq(bom_headers.id, bomId),
          eq(bom_headers.org_id, ctx.org_id),
          isNull(bom_headers.deleted_at),
        ),
      )
      .for('update');
    if (!bom) throw new NotFoundError('Bom', bomId);

    await trx
      .update(bom_headers)
      .set({
        deleted_at: new Date(),
        deleted_by: ctx.user_id,
        is_active: false,
        updated_at: new Date(),
        updated_by: ctx.user_id,
      })
      .where(and(eq(bom_headers.id, bomId), eq(bom_headers.org_id, ctx.org_id)));

    await trx.insert(audit_log).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      ip: ctx.ip,
      entity_table: 'bom_headers',
      entity_id: bomId,
      action: 'delete',
      before_json: null,
      after_json: null,
    });

    return { id: bomId };
  });
}
