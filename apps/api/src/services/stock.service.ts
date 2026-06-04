import type { DbClient } from '@counter/db';
import {
  audit_log,
  items,
  stock_adjustment_lines,
  stock_adjustments,
  stock_ledger,
  stock_transfer_lines,
  stock_transfers,
} from '@counter/db';
import type { CreateStockAdjustmentInput, CreateStockTransferInput } from '@counter/schemas';
import { Decimal, newStockLedgerId } from '@counter/utils';
import { and, desc, eq, gte, isNull, lt, lte, sql } from 'drizzle-orm';
import type { RequestContext } from '../context.js';
import { BusinessError, NotFoundError } from '../errors.js';
import { getStockBalance } from './ledger.js';

async function nextNo(
  trx: DbClient,
  table: typeof stock_adjustments | typeof stock_transfers,
  orgId: string,
  prefix: string,
): Promise<string> {
  const [row] = await trx
    .select({ n: sql<number>`count(*)` })
    .from(table)
    .where(eq(table.org_id, orgId));
  return `${prefix}-${String(Number(row?.n ?? 0) + 1).padStart(5, '0')}`;
}

// ─── Stock Adjustment ──────────────────────────────────────────────────────────
export async function createStockAdjustment(
  db: DbClient,
  ctx: RequestContext,
  input: CreateStockAdjustmentInput,
) {
  return await db.transaction(async (trx) => {
    const adjustmentId = input.client_id as string;
    const adjNo = await nextNo(trx as unknown as DbClient, stock_adjustments, ctx.org_id, 'ADJ');
    const now = new Date();

    let totalValue = new Decimal('0');

    await trx.insert(stock_adjustments).values({
      id: adjustmentId,
      org_id: ctx.org_id,
      adjustment_no: adjNo,
      adjustment_date: input.adjustment_date,
      location_id: input.location_id,
      reason: input.reason,
      reason_note: input.reason_note ?? null,
      status: 'posted',
      total_value: '0',
      created_by: ctx.user_id,
      updated_by: ctx.user_id,
    });

    for (const line of input.lines) {
      const [item] = await trx
        .select({
          name: items.name,
          purchase_price: items.purchase_price,
          allow_negative_stock: items.allow_negative_stock,
          track_inventory: items.track_inventory,
        })
        .from(items)
        .where(and(eq(items.id, line.item_id), eq(items.org_id, ctx.org_id)));
      if (!item) throw new NotFoundError('Item', line.item_id);

      const change = new Decimal(line.qty_change);
      if (change.isZero()) throw new BusinessError('Adjustment qty_change cannot be zero');

      const rate = new Decimal(line.rate ?? item.purchase_price ?? '0');
      const value = change.times(rate);
      totalValue = totalValue.plus(value.abs());

      await trx.insert(stock_adjustment_lines).values({
        id: crypto.randomUUID(),
        org_id: ctx.org_id,
        adjustment_id: adjustmentId,
        item_id: line.item_id,
        batch_id: line.batch_id ?? null,
        qty_change: change.toFixed(3),
        rate: rate.toFixed(2),
        value: value.toFixed(2),
        note: line.note ?? null,
      });

      if (item.track_inventory) {
        const prev = await getStockBalance(trx, ctx.org_id, line.item_id, input.location_id);
        const newBalance = new Decimal(prev).plus(change);
        if (newBalance.isNegative() && !item.allow_negative_stock) {
          throw new BusinessError(
            `Adjustment would make ${item.name} negative: ${prev} ${change.isNegative() ? '' : '+'}${change.toFixed(3)}`,
          );
        }
        await trx.insert(stock_ledger).values({
          id: newStockLedgerId(),
          org_id: ctx.org_id,
          item_id: line.item_id,
          location_id: input.location_id,
          batch_id: line.batch_id ?? null,
          txn_type: 'adjustment',
          txn_date: now,
          qty_in: change.isPositive() ? change.toFixed(3) : '0',
          qty_out: change.isNegative() ? change.abs().toFixed(3) : '0',
          balance_qty: newBalance.toFixed(3),
          rate: rate.toFixed(2),
          value: value.abs().toFixed(2),
          ref_table: 'stock_adjustment_lines',
          ref_id: adjustmentId,
          note: `${input.reason}${line.note ? ': ' + line.note : ''}`,
          created_by: ctx.user_id,
          device_id: ctx.device_id,
        });
      }
    }

    await trx
      .update(stock_adjustments)
      .set({ total_value: totalValue.toFixed(2) })
      .where(eq(stock_adjustments.id, adjustmentId));

    await trx.insert(audit_log).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      ip: ctx.ip,
      entity_table: 'stock_adjustments',
      entity_id: adjustmentId,
      action: 'create',
      before_json: null,
      after_json: { adjustment_no: adjNo, reason: input.reason, lines: input.lines.length },
    });

    return { id: adjustmentId, adjustment_no: adjNo, total_value: totalValue.toFixed(2) };
  });
}

// ─── Stock Transfer (direct mode) ───────────────────────────────────────────────
export async function createStockTransfer(
  db: DbClient,
  ctx: RequestContext,
  input: CreateStockTransferInput,
) {
  return await db.transaction(async (trx) => {
    const transferId = input.client_id as string;
    const trfNo = await nextNo(trx as unknown as DbClient, stock_transfers, ctx.org_id, 'TRF');
    const now = new Date();
    const direct = input.mode === 'direct';
    // In-transit lands at destination on receive; direct lands immediately.
    const status = direct ? 'received' : 'in_transit';

    await trx.insert(stock_transfers).values({
      id: transferId,
      org_id: ctx.org_id,
      transfer_no: trfNo,
      transfer_date: input.transfer_date,
      from_location_id: input.from_location_id,
      to_location_id: input.to_location_id,
      mode: input.mode,
      status,
      transporter: input.transporter ?? null,
      vehicle_no: input.vehicle_no ?? null,
      reason: input.reason ?? null,
      created_by: ctx.user_id,
      updated_by: ctx.user_id,
    });

    for (const line of input.lines) {
      const [item] = await trx
        .select({
          name: items.name,
          purchase_price: items.purchase_price,
          allow_negative_stock: items.allow_negative_stock,
        })
        .from(items)
        .where(and(eq(items.id, line.item_id), eq(items.org_id, ctx.org_id)));
      if (!item) throw new NotFoundError('Item', line.item_id);

      const qty = new Decimal(line.qty);
      const rate = new Decimal(item.purchase_price ?? '0');

      // Availability at source.
      const srcBalance = await getStockBalance(
        trx,
        ctx.org_id,
        line.item_id,
        input.from_location_id,
      );
      const newSrc = new Decimal(srcBalance).minus(qty);
      if (newSrc.isNegative() && !item.allow_negative_stock) {
        throw new BusinessError(
          `Insufficient stock for ${item.name} at source: available ${srcBalance}, transfer ${qty.toFixed(3)}`,
        );
      }

      await trx.insert(stock_transfer_lines).values({
        id: crypto.randomUUID(),
        org_id: ctx.org_id,
        transfer_id: transferId,
        item_id: line.item_id,
        batch_id: line.batch_id ?? null,
        qty: qty.toFixed(3),
        qty_received: direct ? qty.toFixed(3) : '0',
        rate: rate.toFixed(2),
      });

      // OUT at source.
      await trx.insert(stock_ledger).values({
        id: newStockLedgerId(),
        org_id: ctx.org_id,
        item_id: line.item_id,
        location_id: input.from_location_id,
        batch_id: line.batch_id ?? null,
        txn_type: 'transfer_out',
        txn_date: now,
        qty_in: '0',
        qty_out: qty.toFixed(3),
        balance_qty: newSrc.toFixed(3),
        rate: rate.toFixed(2),
        value: qty.times(rate).toFixed(2),
        ref_table: 'stock_transfer_lines',
        ref_id: transferId,
        created_by: ctx.user_id,
        device_id: ctx.device_id,
      });

      // IN at destination (direct mode only; in-transit waits for receive).
      if (direct) {
        const dstBalance = await getStockBalance(
          trx,
          ctx.org_id,
          line.item_id,
          input.to_location_id,
        );
        const newDst = new Decimal(dstBalance).plus(qty);
        await trx.insert(stock_ledger).values({
          id: newStockLedgerId(),
          org_id: ctx.org_id,
          item_id: line.item_id,
          location_id: input.to_location_id,
          batch_id: line.batch_id ?? null,
          txn_type: 'transfer_in',
          txn_date: now,
          qty_in: qty.toFixed(3),
          qty_out: '0',
          balance_qty: newDst.toFixed(3),
          rate: rate.toFixed(2),
          value: qty.times(rate).toFixed(2),
          ref_table: 'stock_transfer_lines',
          ref_id: transferId,
          created_by: ctx.user_id,
          device_id: ctx.device_id,
        });
      }
    }

    await trx.insert(audit_log).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      ip: ctx.ip,
      entity_table: 'stock_transfers',
      entity_id: transferId,
      action: 'create',
      before_json: null,
      after_json: { transfer_no: trfNo, mode: input.mode, lines: input.lines.length },
    });

    return { id: transferId, transfer_no: trfNo, status };
  });
}

// ─── Stock Ledger view (§11.1) ───────────────────────────────────────────────
export async function getStockLedger(
  db: DbClient,
  ctx: RequestContext,
  params: {
    item_id: string;
    location_id?: string | undefined;
    date_from?: string | undefined;
    date_to?: string | undefined;
  },
) {
  const conditions = [
    eq(stock_ledger.org_id, ctx.org_id),
    eq(stock_ledger.item_id, params.item_id),
  ];
  if (params.location_id) conditions.push(eq(stock_ledger.location_id, params.location_id));
  if (params.date_from)
    conditions.push(gte(stock_ledger.txn_date, new Date(`${params.date_from}T00:00:00Z`)));
  if (params.date_to)
    conditions.push(lte(stock_ledger.txn_date, new Date(`${params.date_to}T23:59:59Z`)));

  const entries = await db
    .select({
      id: stock_ledger.id,
      txn_type: stock_ledger.txn_type,
      txn_date: stock_ledger.txn_date,
      qty_in: stock_ledger.qty_in,
      qty_out: stock_ledger.qty_out,
      balance_qty: stock_ledger.balance_qty,
      rate: stock_ledger.rate,
      value: stock_ledger.value,
      note: stock_ledger.note,
    })
    .from(stock_ledger)
    .where(and(...conditions))
    .orderBy(stock_ledger.txn_date, stock_ledger.id)
    .limit(500);

  const totalIn = entries.reduce((a, e) => a.plus(e.qty_in ?? '0'), new Decimal('0'));
  const totalOut = entries.reduce((a, e) => a.plus(e.qty_out ?? '0'), new Decimal('0'));

  return {
    item_id: params.item_id,
    entries,
    summary: {
      total_in: totalIn.toFixed(3),
      total_out: totalOut.toFixed(3),
      closing: totalIn.minus(totalOut).toFixed(3),
    },
  };
}

export async function listAdjustments(
  db: DbClient,
  ctx: RequestContext,
  params: { limit: number; cursor?: string | undefined },
) {
  const conditions = [
    eq(stock_adjustments.org_id, ctx.org_id),
    isNull(stock_adjustments.deleted_at),
  ];
  if (params.cursor) conditions.push(lt(stock_adjustments.id, params.cursor));
  const rows = await db
    .select({
      id: stock_adjustments.id,
      adjustment_no: stock_adjustments.adjustment_no,
      adjustment_date: stock_adjustments.adjustment_date,
      reason: stock_adjustments.reason,
      total_value: stock_adjustments.total_value,
    })
    .from(stock_adjustments)
    .where(and(...conditions))
    .orderBy(desc(stock_adjustments.id))
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

export async function listTransfers(
  db: DbClient,
  ctx: RequestContext,
  params: { limit: number; cursor?: string | undefined },
) {
  const conditions = [eq(stock_transfers.org_id, ctx.org_id), isNull(stock_transfers.deleted_at)];
  if (params.cursor) conditions.push(lt(stock_transfers.id, params.cursor));
  const rows = await db
    .select({
      id: stock_transfers.id,
      transfer_no: stock_transfers.transfer_no,
      transfer_date: stock_transfers.transfer_date,
      mode: stock_transfers.mode,
      status: stock_transfers.status,
    })
    .from(stock_transfers)
    .where(and(...conditions))
    .orderBy(desc(stock_transfers.id))
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
