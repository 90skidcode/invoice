import type { DbClient } from '@counter/db';
import { audit_log, invoice_series, organizations, period_locks, tax_rates } from '@counter/db';
import { Decimal, newId } from '@counter/utils';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { RequestContext } from '../context.js';
import { BusinessError, ConflictError, NotFoundError } from '../errors.js';

// ─── Period locks (§1.7, §22.4) ────────────────────────────────────────────────
export async function createPeriodLock(
  db: DbClient,
  ctx: RequestContext,
  lockThroughDate: string,
  reason: string | null,
) {
  return await db.transaction(async (trx) => {
    const id = newId<string>();
    await trx.insert(period_locks).values({
      id,
      org_id: ctx.org_id,
      lock_through_date: lockThroughDate,
      locked_by: ctx.user_id,
      reason,
    });
    await trx.insert(audit_log).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      ip: ctx.ip,
      entity_table: 'period_locks',
      entity_id: id,
      action: 'create',
      before_json: null,
      after_json: { lock_through_date: lockThroughDate, reason },
    });
    return { id, lock_through_date: lockThroughDate };
  });
}

export async function unlockPeriod(
  db: DbClient,
  ctx: RequestContext,
  lockId: string,
  reason: string,
) {
  const [lock] = await db
    .select()
    .from(period_locks)
    .where(and(eq(period_locks.id, lockId), eq(period_locks.org_id, ctx.org_id)));
  if (!lock) throw new NotFoundError('PeriodLock', lockId);
  if (lock.unlocked_at) throw new BusinessError('Period is already unlocked');

  await db.transaction(async (trx) => {
    await trx
      .update(period_locks)
      .set({ unlocked_at: new Date(), unlocked_by: ctx.user_id, unlock_reason: reason })
      .where(eq(period_locks.id, lockId));
    await trx.insert(audit_log).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      ip: ctx.ip,
      entity_table: 'period_locks',
      entity_id: lockId,
      action: 'update',
      before_json: { unlocked: false },
      after_json: { unlocked: true, reason },
    });
  });
  return { ok: true };
}

export async function listPeriodLocks(db: DbClient, ctx: RequestContext) {
  return db
    .select()
    .from(period_locks)
    .where(eq(period_locks.org_id, ctx.org_id))
    .orderBy(desc(period_locks.lock_through_date));
}

// ─── Tax rates (§7.5) ───────────────────────────────────────────────────────────
export async function createTaxRate(
  db: DbClient,
  ctx: RequestContext,
  input: {
    name: string;
    total_rate: string;
    cess_rate?: string | undefined;
    effective_from: string;
  },
) {
  const total = new Decimal(input.total_rate);
  const half = total.dividedBy(2).toFixed(2);
  const id = newId<string>();
  await db.insert(tax_rates).values({
    id,
    org_id: ctx.org_id,
    name: input.name,
    total_rate: total.toFixed(2),
    cgst_rate: half,
    sgst_rate: half,
    igst_rate: total.toFixed(2),
    cess_rate: input.cess_rate ?? '0',
    effective_from: input.effective_from,
    is_active: true,
  });
  return { id, name: input.name };
}

export async function updateTaxRate(
  db: DbClient,
  ctx: RequestContext,
  taxRateId: string,
  expectedVersion: number,
  input: {
    name?: string | undefined;
    total_rate?: string | undefined;
    cess_rate?: string | undefined;
    is_active?: boolean | undefined;
  },
) {
  const patch: Record<string, unknown> = {
    updated_at: new Date(),
    row_version: sql`${tax_rates.row_version} + 1`,
  };
  if (input.name !== undefined) patch['name'] = input.name;
  if (input.cess_rate !== undefined) patch['cess_rate'] = input.cess_rate;
  if (input.is_active !== undefined) patch['is_active'] = input.is_active;
  if (input.total_rate !== undefined) {
    const total = new Decimal(input.total_rate);
    patch['total_rate'] = total.toFixed(2);
    patch['cgst_rate'] = total.dividedBy(2).toFixed(2);
    patch['sgst_rate'] = total.dividedBy(2).toFixed(2);
    patch['igst_rate'] = total.toFixed(2);
  }
  const result = await db
    .update(tax_rates)
    .set(patch)
    .where(
      and(
        eq(tax_rates.id, taxRateId),
        eq(tax_rates.org_id, ctx.org_id),
        eq(tax_rates.row_version, expectedVersion),
      ),
    )
    .returning({ id: tax_rates.id, row_version: tax_rates.row_version });
  if (result.length === 0) {
    const [exists] = await db
      .select({ id: tax_rates.id })
      .from(tax_rates)
      .where(and(eq(tax_rates.id, taxRateId), eq(tax_rates.org_id, ctx.org_id)));
    if (!exists) throw new NotFoundError('TaxRate', taxRateId);
    throw new ConflictError('Tax rate was modified by another user — refresh and retry');
  }
  return result[0];
}

export async function expireTaxRate(
  db: DbClient,
  ctx: RequestContext,
  taxRateId: string,
  effectiveTo: string,
) {
  const result = await db
    .update(tax_rates)
    .set({ effective_to: effectiveTo, is_active: false, updated_at: new Date() })
    .where(and(eq(tax_rates.id, taxRateId), eq(tax_rates.org_id, ctx.org_id)))
    .returning({ id: tax_rates.id });
  if (result.length === 0) throw new NotFoundError('TaxRate', taxRateId);
  return { ok: true };
}

// ─── Invoice series (§7.9) ──────────────────────────────────────────────────────
export async function listSeries(db: DbClient, ctx: RequestContext) {
  return db
    .select()
    .from(invoice_series)
    .where(eq(invoice_series.org_id, ctx.org_id))
    .orderBy(invoice_series.name);
}

export async function createSeries(
  db: DbClient,
  ctx: RequestContext,
  input: {
    name: string;
    document_type: string;
    prefix?: string | undefined;
    suffix?: string | undefined;
    number_padding?: number | undefined;
    starting_number?: number | undefined;
    reset_on_fy?: boolean | undefined;
    is_default?: boolean | undefined;
  },
) {
  const id = newId<string>();
  const start = input.starting_number ?? 1;
  await db.insert(invoice_series).values({
    id,
    org_id: ctx.org_id,
    name: input.name,
    document_type: input.document_type,
    prefix: input.prefix ?? null,
    suffix: input.suffix ?? null,
    number_padding: input.number_padding ?? 4,
    starting_number: start,
    next_number: start,
    reset_on_fy: input.reset_on_fy ?? true,
    is_default: input.is_default ?? false,
    is_active: true,
  });
  return { id, name: input.name };
}

export async function updateSeries(
  db: DbClient,
  ctx: RequestContext,
  seriesId: string,
  input: {
    name?: string | undefined;
    prefix?: string | undefined;
    suffix?: string | undefined;
    is_active?: boolean | undefined;
    is_default?: boolean | undefined;
  },
) {
  const patch: Record<string, unknown> = {
    updated_at: new Date(),
    row_version: sql`${invoice_series.row_version} + 1`,
  };
  for (const k of ['name', 'prefix', 'suffix', 'is_active', 'is_default'] as const) {
    if (input[k] !== undefined) patch[k] = input[k];
  }
  const result = await db
    .update(invoice_series)
    .set(patch)
    .where(and(eq(invoice_series.id, seriesId), eq(invoice_series.org_id, ctx.org_id)))
    .returning({ id: invoice_series.id });
  if (result.length === 0) throw new NotFoundError('InvoiceSeries', seriesId);
  return { ok: true };
}

// ─── Org settings ────────────────────────────────────────────────────────────────
export async function getOrgSettings(db: DbClient, ctx: RequestContext) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.org_id));
  if (!org) throw new NotFoundError('Organization', ctx.org_id);
  return org;
}

export async function updateOrgSettings(
  db: DbClient,
  ctx: RequestContext,
  input: {
    name?: string | undefined;
    legal_name?: string | undefined;
    gstin?: string | undefined;
    address?: string | undefined;
    phone?: string | undefined;
    email?: string | undefined;
    upi_id?: string | undefined;
    settings?: Record<string, unknown> | undefined;
  },
) {
  const patch: Record<string, unknown> = {
    updated_at: new Date(),
    row_version: sql`${organizations.row_version} + 1`,
  };
  for (const k of [
    'name',
    'legal_name',
    'gstin',
    'address',
    'phone',
    'email',
    'upi_id',
    'settings',
  ] as const) {
    if (input[k] !== undefined) patch[k] = input[k];
  }
  await db.update(organizations).set(patch).where(eq(organizations.id, ctx.org_id));
  await db.insert(audit_log).values({
    id: crypto.randomUUID(),
    org_id: ctx.org_id,
    user_id: ctx.user_id,
    device_id: ctx.device_id,
    ip: ctx.ip,
    entity_table: 'organizations',
    entity_id: ctx.org_id,
    action: 'update',
    before_json: null,
    after_json: { keys: Object.keys(input) },
  });
  return { ok: true };
}
