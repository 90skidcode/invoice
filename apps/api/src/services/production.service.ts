import type { DbClient } from '@counter/db';
import {
  audit_log,
  bom_headers,
  bom_items,
  item_alt_units,
  items,
  locations,
  production_order_lines,
  production_orders,
  stock_ledger,
} from '@counter/db';
import type { CreateProductionOrderInput } from '@counter/schemas';
import { Decimal, type ProductionOrderId, newId } from '@counter/utils';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { RequestContext } from '../context.js';
import { BusinessError, NotFoundError } from '../errors.js';
import { getStockBalance } from './ledger.js';

type Trx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

interface ResolvedBomLine {
  raw_item_id: string;
  raw_item_name: string;
  bom_qty: string; // qty per batch, in unit_id
  unit_id: string;
  // Multiplier to convert bom_qty (in unit_id) into the raw item's base/stock
  // unit: base_qty = bom_qty × conv_factor (Counter_FSD_Extended §base-unit qty).
  conv_factor: string;
  wastage_pct: string;
  purchase_price: string;
  track_inventory: boolean;
  allow_negative_stock: boolean;
}

interface ResolvedBom {
  bom_id: string;
  finished_item_id: string;
  finished_item_name: string;
  finished_purchase_price: string;
  output_qty: string;
  labor_cost: string;
  overhead_cost: string;
  lines: ResolvedBomLine[];
}

/** Load the single active BOM for a finished good, plus costed raw-material lines. */
async function loadActiveBom(
  db: DbClient | Trx,
  ctx: RequestContext,
  finishedItemId: string,
): Promise<ResolvedBom> {
  const [bom] = await db
    .select({
      id: bom_headers.id,
      finished_item_id: bom_headers.finished_item_id,
      finished_item_name: items.name,
      finished_purchase_price: items.purchase_price,
      output_qty: bom_headers.output_qty,
      labor_cost: bom_headers.labor_cost,
      overhead_cost: bom_headers.overhead_cost,
    })
    .from(bom_headers)
    .innerJoin(items, eq(items.id, bom_headers.finished_item_id))
    .where(
      and(
        eq(bom_headers.org_id, ctx.org_id),
        eq(bom_headers.finished_item_id, finishedItemId),
        eq(bom_headers.is_active, true),
        isNull(bom_headers.deleted_at),
      ),
    )
    .orderBy(desc(bom_headers.version))
    .limit(1);

  if (!bom) {
    throw new BusinessError('No active BOM (recipe) exists for this finished good');
  }

  const lines = await db
    .select({
      raw_item_id: bom_items.raw_item_id,
      raw_item_name: items.name,
      bom_qty: bom_items.qty,
      unit_id: bom_items.unit_id,
      primary_unit_id: items.primary_unit_id,
      wastage_pct: bom_items.wastage_pct,
      purchase_price: items.purchase_price,
      track_inventory: items.track_inventory,
      allow_negative_stock: items.allow_negative_stock,
    })
    .from(bom_items)
    .innerJoin(items, eq(items.id, bom_items.raw_item_id))
    .where(eq(bom_items.bom_header_id, bom.id))
    .orderBy(bom_items.line_no);

  // Resolve unit conversion → base stock unit for any line whose unit isn't the
  // item's base unit. base_qty = entered_qty × conversion_factor.
  const altItemIds = [
    ...new Set(lines.filter((l) => l.unit_id !== l.primary_unit_id).map((l) => l.raw_item_id)),
  ];
  const altRows = altItemIds.length
    ? await db
        .select({
          item_id: item_alt_units.item_id,
          unit_id: item_alt_units.unit_id,
          conversion_factor: item_alt_units.conversion_factor,
        })
        .from(item_alt_units)
        .where(
          and(eq(item_alt_units.org_id, ctx.org_id), inArray(item_alt_units.item_id, altItemIds)),
        )
    : [];
  const altMap = new Map(altRows.map((a) => [`${a.item_id}:${a.unit_id}`, a.conversion_factor]));

  return {
    bom_id: bom.id,
    finished_item_id: bom.finished_item_id,
    finished_item_name: bom.finished_item_name,
    finished_purchase_price: bom.finished_purchase_price ?? '0',
    output_qty: bom.output_qty,
    labor_cost: bom.labor_cost,
    overhead_cost: bom.overhead_cost,
    lines: lines.map((l) => {
      let convFactor = '1';
      if (l.unit_id !== l.primary_unit_id) {
        const f = altMap.get(`${l.raw_item_id}:${l.unit_id}`);
        if (!f) {
          throw new BusinessError(
            `${l.raw_item_name}: the recipe unit differs from the item's base unit and no unit conversion is configured. Add an alternate unit on the item, or change the BOM line to the base unit.`,
          );
        }
        convFactor = f;
      }
      return {
        raw_item_id: l.raw_item_id,
        raw_item_name: l.raw_item_name,
        bom_qty: l.bom_qty,
        unit_id: l.unit_id,
        conv_factor: convFactor,
        wastage_pct: l.wastage_pct,
        purchase_price: l.purchase_price ?? '0',
        track_inventory: l.track_inventory,
        allow_negative_stock: l.allow_negative_stock,
      };
    }),
  };
}

/**
 * Required consumption in the raw item's base/stock unit for a given output
 * quantity: bom_qty × conversion → base, × production factor, × (1 + wastage).
 */
function requiredQty(line: ResolvedBomLine, factor: Decimal): string {
  return new Decimal(line.bom_qty)
    .times(line.conv_factor)
    .times(factor)
    .times(new Decimal(1).plus(new Decimal(line.wastage_pct || '0').dividedBy(100)))
    .toFixed(3);
}

async function resolveLocation(
  db: DbClient | Trx,
  ctx: RequestContext,
  locationId?: string | null,
): Promise<string> {
  if (locationId) return locationId;
  const [loc] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.org_id, ctx.org_id), isNull(locations.deleted_at)))
    .orderBy(desc(locations.is_default))
    .limit(1);
  if (!loc) throw new BusinessError('No stock location configured');
  return loc.id;
}

/**
 * Read-only material requirement + cost estimate for producing `producedQty`
 * units. Drives the production screen's availability check before posting.
 */
export async function previewProduction(
  db: DbClient,
  ctx: RequestContext,
  finishedItemId: string,
  producedQty: string,
  locationId?: string | null,
) {
  const bom = await loadActiveBom(db, ctx, finishedItemId);
  const location = await resolveLocation(db, ctx, locationId);
  const factor = new Decimal(producedQty).dividedBy(bom.output_qty);

  let materialCost = new Decimal(0);
  const requirements = [];
  for (const line of bom.lines) {
    const required = requiredQty(line, factor);
    const [agg] = await db
      .select({
        balance: sql<string>`coalesce(sum(${stock_ledger.qty_in}) - sum(${stock_ledger.qty_out}), 0)`,
      })
      .from(stock_ledger)
      .where(
        and(
          eq(stock_ledger.org_id, ctx.org_id),
          eq(stock_ledger.item_id, line.raw_item_id),
          eq(stock_ledger.location_id, location),
        ),
      );
    const available = agg?.balance ?? '0';
    const cost = new Decimal(required).times(line.purchase_price);
    materialCost = materialCost.plus(cost);
    requirements.push({
      raw_item_id: line.raw_item_id,
      name: line.raw_item_name,
      required,
      available,
      sufficient:
        line.allow_negative_stock || new Decimal(available).greaterThanOrEqualTo(required),
      cost: cost.toFixed(2),
    });
  }

  const labor = new Decimal(bom.labor_cost).times(factor);
  const overhead = new Decimal(bom.overhead_cost).times(factor);
  const totalCost = materialCost.plus(labor).plus(overhead);
  const costPerUnit = new Decimal(producedQty).greaterThan(0)
    ? totalCost.dividedBy(producedQty)
    : new Decimal(0);

  return {
    finished_item_id: bom.finished_item_id,
    finished_item_name: bom.finished_item_name,
    output_qty: bom.output_qty,
    requirements,
    material_cost: materialCost.toFixed(2),
    labor_cost: labor.toFixed(2),
    overhead_cost: overhead.toFixed(2),
    total_cost: totalCost.toFixed(2),
    cost_per_unit: costPerUnit.toFixed(4),
    all_sufficient: requirements.every((r) => r.sufficient),
  };
}

/**
 * Post a production run: consume raw materials and output the finished good
 * through the append-only ledger, in one transaction (§1.3, §1.4).
 */
export async function createProductionOrder(
  db: DbClient,
  ctx: RequestContext,
  input: CreateProductionOrderInput,
) {
  const producedQty = new Decimal(input.produced_qty);
  if (producedQty.lessThanOrEqualTo(0)) {
    throw new BusinessError('Produced quantity must be greater than zero');
  }

  return await db.transaction(async (trx) => {
    const bom = await loadActiveBom(trx, ctx, input.finished_item_id);
    const location = await resolveLocation(trx, ctx, input.location_id);
    const factor = producedQty.dividedBy(bom.output_qty);
    const now = new Date();
    const productionDate = input.production_date ?? now.toISOString().slice(0, 10);

    // Voucher number — PROD-{seq} per org.
    const [cnt] = await trx
      .select({ n: sql<number>`count(*)` })
      .from(production_orders)
      .where(eq(production_orders.org_id, ctx.org_id));
    const voucherNo = `PROD-${String(Number(cnt?.n ?? 0) + 1).padStart(4, '0')}`;

    const productionId = newId<ProductionOrderId>();

    // 1. Consume raw materials (validate stock, append qty_out rows).
    let materialCost = new Decimal(0);
    const consumeLines: {
      item_id: string;
      name: string;
      qty: string;
      unit_id: string;
      rate: string;
      value: string;
    }[] = [];

    for (const line of bom.lines) {
      const required = requiredQty(line, factor);
      if (!line.track_inventory) {
        // Non-stocked input still contributes cost but no ledger move.
        const cost = new Decimal(required).times(line.purchase_price);
        materialCost = materialCost.plus(cost);
        consumeLines.push({
          item_id: line.raw_item_id,
          name: line.raw_item_name,
          qty: required,
          unit_id: line.unit_id,
          rate: line.purchase_price,
          value: cost.toFixed(2),
        });
        continue;
      }

      const prevBalance = await getStockBalance(trx, ctx.org_id, line.raw_item_id, location);
      const newBalance = new Decimal(prevBalance).minus(required);
      if (newBalance.isNegative() && !line.allow_negative_stock) {
        throw new BusinessError(
          `Insufficient stock for ${line.raw_item_name}: available ${prevBalance}, needs ${required}`,
        );
      }

      const cost = new Decimal(required).times(line.purchase_price);
      materialCost = materialCost.plus(cost);

      await trx.insert(stock_ledger).values({
        id: crypto.randomUUID(),
        org_id: ctx.org_id,
        item_id: line.raw_item_id,
        location_id: location,
        batch_id: null,
        txn_type: 'production_consume',
        txn_date: now,
        qty_in: '0',
        qty_out: required,
        balance_qty: newBalance.toFixed(3),
        rate: line.purchase_price,
        value: cost.toFixed(2),
        ref_table: 'production_orders',
        ref_id: productionId,
        note: `Consumed for ${voucherNo}`,
        created_by: ctx.user_id,
        device_id: ctx.device_id,
      });

      consumeLines.push({
        item_id: line.raw_item_id,
        name: line.raw_item_name,
        qty: required,
        unit_id: line.unit_id,
        rate: line.purchase_price,
        value: cost.toFixed(2),
      });
    }

    // 2. Roll up cost and output the finished good.
    const labor = new Decimal(bom.labor_cost).times(factor);
    const overhead = new Decimal(bom.overhead_cost).times(factor);
    const totalCost = materialCost.plus(labor).plus(overhead);
    const costPerUnit = totalCost.dividedBy(producedQty);

    const fgPrev = await getStockBalance(trx, ctx.org_id, bom.finished_item_id, location);
    const fgNewBalance = new Decimal(fgPrev).plus(producedQty);

    await trx.insert(stock_ledger).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      item_id: bom.finished_item_id,
      location_id: location,
      batch_id: null,
      txn_type: 'production_output',
      txn_date: now,
      qty_in: producedQty.toFixed(3),
      qty_out: '0',
      balance_qty: fgNewBalance.toFixed(3),
      rate: costPerUnit.toFixed(4),
      value: totalCost.toFixed(2),
      ref_table: 'production_orders',
      ref_id: productionId,
      note: `Produced via ${voucherNo}`,
      created_by: ctx.user_id,
      device_id: ctx.device_id,
    });

    // 3. Update finished good's moving-average cost basis.
    const curQty = new Decimal(fgPrev);
    const curAvg = new Decimal(bom.finished_purchase_price);
    const denom = curQty.plus(producedQty);
    const newAvg = denom.greaterThan(0)
      ? curQty.times(curAvg).plus(producedQty.times(costPerUnit)).dividedBy(denom)
      : costPerUnit;
    await trx
      .update(items)
      .set({
        purchase_price: newAvg.toFixed(2),
        updated_at: now,
        updated_by: ctx.user_id,
        row_version: sql`${items.row_version} + 1`,
      })
      .where(eq(items.id, bom.finished_item_id));

    // 4. Header.
    await trx.insert(production_orders).values({
      id: productionId,
      org_id: ctx.org_id,
      voucher_no: voucherNo,
      production_date: productionDate,
      bom_header_id: bom.bom_id,
      finished_item_id: bom.finished_item_id,
      planned_qty: producedQty.toFixed(3),
      produced_qty: producedQty.toFixed(3),
      location_id: location,
      total_material_cost: materialCost.toFixed(2),
      labor_cost: labor.toFixed(2),
      overhead_cost: overhead.toFixed(2),
      total_cost: totalCost.toFixed(2),
      cost_per_unit: costPerUnit.toFixed(4),
      status: 'completed',
      notes: input.notes ?? null,
      created_by: ctx.user_id,
      updated_by: ctx.user_id,
    });

    // 5. Line snapshots (consume + output).
    let lineNo = 1;
    for (const c of consumeLines) {
      await trx.insert(production_order_lines).values({
        id: crypto.randomUUID(),
        org_id: ctx.org_id,
        production_order_id: productionId,
        line_no: lineNo++,
        line_type: 'consume',
        item_id: c.item_id,
        item_name_snapshot: c.name,
        qty: c.qty,
        unit_id: c.unit_id,
        rate: c.rate,
        value: c.value,
        location_id: location,
      });
    }
    await trx.insert(production_order_lines).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      production_order_id: productionId,
      line_no: lineNo,
      line_type: 'output',
      item_id: bom.finished_item_id,
      item_name_snapshot: bom.finished_item_name,
      qty: producedQty.toFixed(4),
      unit_id: null,
      rate: costPerUnit.toFixed(4),
      value: totalCost.toFixed(2),
      location_id: location,
    });

    // 6. Audit log (§1.8).
    await trx.insert(audit_log).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      ip: ctx.ip,
      entity_table: 'production_orders',
      entity_id: productionId,
      action: 'create',
      before_json: null,
      after_json: { voucher_no: voucherNo, produced_qty: producedQty.toFixed(3) },
    });

    return {
      id: productionId,
      voucher_no: voucherNo,
      produced_qty: producedQty.toFixed(3),
      total_cost: totalCost.toFixed(2),
      cost_per_unit: costPerUnit.toFixed(4),
    };
  });
}

/**
 * Cancel a completed production run: return consumed raw materials to stock and
 * remove the finished-good output, via append-only compensating ledger entries
 * (§1.3) in one transaction (§1.4). The finished good's moving-average cost
 * basis is a forward-only derived value and is left as-is (not reversible).
 */
export async function cancelProductionOrder(
  db: DbClient,
  ctx: RequestContext,
  productionId: string,
) {
  return await db.transaction(async (trx) => {
    const [order] = await trx
      .select()
      .from(production_orders)
      .where(
        and(
          eq(production_orders.id, productionId),
          eq(production_orders.org_id, ctx.org_id),
          isNull(production_orders.deleted_at),
        ),
      )
      .for('update');
    if (!order) throw new NotFoundError('ProductionOrder', productionId);
    if (order.status === 'cancelled') {
      throw new BusinessError('Production run is already cancelled');
    }

    const lines = await trx
      .select()
      .from(production_order_lines)
      .where(eq(production_order_lines.production_order_id, productionId));

    const now = new Date();

    for (const line of lines) {
      const locationId = line.location_id ?? order.location_id;
      const qty = new Decimal(line.qty);

      if (line.line_type === 'consume') {
        // Return raw material to stock (qty_in).
        const prev = await getStockBalance(trx, ctx.org_id, line.item_id, locationId);
        await trx.insert(stock_ledger).values({
          id: crypto.randomUUID(),
          org_id: ctx.org_id,
          item_id: line.item_id,
          location_id: locationId,
          batch_id: null,
          txn_type: 'production_consume_void',
          txn_date: now,
          qty_in: qty.toFixed(3),
          qty_out: '0',
          balance_qty: new Decimal(prev).plus(qty).toFixed(3),
          rate: line.rate,
          value: line.value,
          ref_table: 'production_orders',
          ref_id: productionId,
          note: `Cancelled ${order.voucher_no}: returned material`,
          created_by: ctx.user_id,
          device_id: ctx.device_id,
        });
      } else {
        // Remove the finished good (qty_out). Block if it was already sold.
        const [fgItem] = await trx
          .select({ allow_negative_stock: items.allow_negative_stock, name: items.name })
          .from(items)
          .where(and(eq(items.id, line.item_id), eq(items.org_id, ctx.org_id)));
        const prev = await getStockBalance(trx, ctx.org_id, line.item_id, locationId);
        const newBalance = new Decimal(prev).minus(qty);
        if (newBalance.isNegative() && !fgItem?.allow_negative_stock) {
          throw new BusinessError(
            `Cannot cancel ${order.voucher_no}: only ${prev} of ${fgItem?.name ?? 'the finished good'} remain in stock (some was already sold or moved).`,
          );
        }
        await trx.insert(stock_ledger).values({
          id: crypto.randomUUID(),
          org_id: ctx.org_id,
          item_id: line.item_id,
          location_id: locationId,
          batch_id: null,
          txn_type: 'production_output_void',
          txn_date: now,
          qty_in: '0',
          qty_out: qty.toFixed(3),
          balance_qty: newBalance.toFixed(3),
          rate: line.rate,
          value: line.value,
          ref_table: 'production_orders',
          ref_id: productionId,
          note: `Cancelled ${order.voucher_no}: removed output`,
          created_by: ctx.user_id,
          device_id: ctx.device_id,
        });
      }
    }

    await trx
      .update(production_orders)
      .set({
        status: 'cancelled',
        updated_at: now,
        updated_by: ctx.user_id,
        row_version: sql`${production_orders.row_version} + 1`,
      })
      .where(and(eq(production_orders.id, productionId), eq(production_orders.org_id, ctx.org_id)));

    await trx.insert(audit_log).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      ip: ctx.ip,
      entity_table: 'production_orders',
      entity_id: productionId,
      action: 'cancel',
      before_json: { status: order.status },
      after_json: { status: 'cancelled' },
    });

    return { id: productionId, voucher_no: order.voucher_no, status: 'cancelled' };
  });
}

export async function getProductionById(db: DbClient, ctx: RequestContext, productionId: string) {
  const [order] = await db
    .select()
    .from(production_orders)
    .where(
      and(
        eq(production_orders.id, productionId),
        eq(production_orders.org_id, ctx.org_id),
        isNull(production_orders.deleted_at),
      ),
    );
  if (!order) throw new NotFoundError('ProductionOrder', productionId);

  const lines = await db
    .select()
    .from(production_order_lines)
    .where(eq(production_order_lines.production_order_id, productionId))
    .orderBy(production_order_lines.line_no);

  return { ...order, lines };
}

export async function listProductions(
  db: DbClient,
  ctx: RequestContext,
  params: { limit: number; cursor?: string | undefined },
) {
  const conditions = [
    eq(production_orders.org_id, ctx.org_id),
    isNull(production_orders.deleted_at),
  ];
  if (params.cursor) conditions.push(lt(production_orders.id, params.cursor));

  const rows = await db
    .select({
      id: production_orders.id,
      voucher_no: production_orders.voucher_no,
      production_date: production_orders.production_date,
      finished_item_id: production_orders.finished_item_id,
      finished_item_name: items.name,
      finished_item_sku: items.sku,
      produced_qty: production_orders.produced_qty,
      total_cost: production_orders.total_cost,
      cost_per_unit: production_orders.cost_per_unit,
      status: production_orders.status,
    })
    .from(production_orders)
    .innerJoin(items, eq(items.id, production_orders.finished_item_id))
    .where(and(...conditions))
    .orderBy(desc(production_orders.id))
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
