import { eq, and, isNull, ilike, or, lt, desc, sql } from 'drizzle-orm';
import type { DbClient } from '@counter/db';
import { vendors, purchase_invoices, audit_log } from '@counter/db';
import type { CreateVendorInput, UpdateVendorInput } from '@counter/schemas';
import { Decimal } from '@counter/utils';
import type { RequestContext } from '../context.js';
import { NotFoundError, ConflictError, BusinessError } from '../errors.js';

async function computePayable(
  db: DbClient,
  orgId: string,
  vendorId: string,
  openingBalance: string,
): Promise<string> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${purchase_invoices.balance_due}), 0)` })
    .from(purchase_invoices)
    .where(
      and(
        eq(purchase_invoices.org_id, orgId),
        eq(purchase_invoices.vendor_id, vendorId),
        isNull(purchase_invoices.deleted_at),
      ),
    );
  return new Decimal(openingBalance ?? '0').plus(row?.total ?? '0').toFixed(2);
}

async function nextVendorCode(db: DbClient, orgId: string): Promise<string> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(vendors)
    .where(eq(vendors.org_id, orgId));
  return `VEND-${String(Number(row?.n ?? 0) + 1).padStart(5, '0')}`;
}

export async function createVendor(db: DbClient, ctx: RequestContext, input: CreateVendorInput) {
  return await db.transaction(async (trx) => {
    const code = input.vendor_code ?? (await nextVendorCode(db, ctx.org_id));
    const existing = await trx
      .select({ id: vendors.id })
      .from(vendors)
      .where(
        and(
          eq(vendors.org_id, ctx.org_id),
          eq(vendors.vendor_code, code),
          isNull(vendors.deleted_at),
        ),
      )
      .limit(1);
    if (existing.length > 0) throw new ConflictError(`Vendor code "${code}" is already in use`);

    const vendorId = input.client_id as string;
    await trx.insert(vendors).values({
      id: vendorId,
      org_id: ctx.org_id,
      vendor_code: code,
      name: input.name,
      type: input.type,
      phone: input.phone ?? null,
      email: input.email ?? null,
      gstin: input.gstin ?? null,
      pan: input.pan ?? null,
      bank_account_no: input.bank_account_no ?? null,
      bank_ifsc: input.bank_ifsc ?? null,
      bank_name: input.bank_name ?? null,
      upi_id: input.upi_id ?? null,
      credit_days: input.credit_days,
      opening_balance: input.opening_balance,
      opening_as_of_date: input.opening_as_of_date ?? null,
      status: input.status,
      custom_fields: input.custom_fields ?? {},
      created_by: ctx.user_id,
      updated_by: ctx.user_id,
    });

    await trx.insert(audit_log).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      ip: ctx.ip,
      entity_table: 'vendors',
      entity_id: vendorId,
      action: 'create',
      before_json: null,
      after_json: { vendor_code: code, name: input.name },
    });

    return { id: vendorId, vendor_code: code, name: input.name };
  });
}

export async function updateVendor(
  db: DbClient,
  ctx: RequestContext,
  vendorId: string,
  input: UpdateVendorInput,
  expectedVersion: number,
) {
  const patch: Record<string, unknown> = {
    updated_at: new Date(),
    updated_by: ctx.user_id,
    row_version: sql`${vendors.row_version} + 1`,
  };
  for (const key of [
    'name',
    'phone',
    'email',
    'gstin',
    'pan',
    'bank_account_no',
    'bank_ifsc',
    'bank_name',
    'upi_id',
    'credit_days',
    'status',
  ] as const) {
    if (input[key] !== undefined) patch[key] = input[key];
  }

  const result = await db
    .update(vendors)
    .set(patch)
    .where(
      and(
        eq(vendors.id, vendorId),
        eq(vendors.org_id, ctx.org_id),
        eq(vendors.row_version, expectedVersion),
        isNull(vendors.deleted_at),
      ),
    )
    .returning({ id: vendors.id, row_version: vendors.row_version });

  if (result.length === 0) {
    const [exists] = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(eq(vendors.id, vendorId), eq(vendors.org_id, ctx.org_id)));
    if (!exists) throw new NotFoundError('Vendor', vendorId);
    throw new ConflictError('Vendor was modified by another user — refresh and retry');
  }
  return result[0];
}

export async function listVendors(
  db: DbClient,
  ctx: RequestContext,
  params: { q?: string | undefined; limit: number; cursor?: string | undefined },
) {
  const conditions = [eq(vendors.org_id, ctx.org_id), isNull(vendors.deleted_at)];
  if (params.q) {
    const m = or(
      ilike(vendors.name, `%${params.q}%`),
      ilike(vendors.phone, `%${params.q}%`),
      ilike(vendors.vendor_code, `%${params.q}%`),
    );
    if (m) conditions.push(m);
  }
  if (params.cursor) conditions.push(lt(vendors.id, params.cursor));

  const rows = await db
    .select({
      id: vendors.id,
      vendor_code: vendors.vendor_code,
      name: vendors.name,
      phone: vendors.phone,
      gstin: vendors.gstin,
      status: vendors.status,
    })
    .from(vendors)
    .where(and(...conditions))
    .orderBy(desc(vendors.id))
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

export async function lookupVendors(
  db: DbClient,
  ctx: RequestContext,
  query: string,
  limit = 10,
) {
  const rows = await db
    .select({
      id: vendors.id,
      name: vendors.name,
      phone: vendors.phone,
      gstin: vendors.gstin,
      opening_balance: vendors.opening_balance,
    })
    .from(vendors)
    .where(
      and(
        eq(vendors.org_id, ctx.org_id),
        isNull(vendors.deleted_at),
        or(ilike(vendors.name, `%${query}%`), ilike(vendors.phone, `%${query}%`)),
      ),
    )
    .limit(limit);

  const results = [];
  for (const r of rows) {
    const payable = await computePayable(db, ctx.org_id, r.id, r.opening_balance ?? '0');
    results.push({ id: r.id, name: r.name, phone: r.phone, gstin: r.gstin, payable });
  }
  return results;
}

export async function getVendorById(db: DbClient, ctx: RequestContext, vendorId: string) {
  const [vendor] = await db
    .select()
    .from(vendors)
    .where(
      and(eq(vendors.id, vendorId), eq(vendors.org_id, ctx.org_id), isNull(vendors.deleted_at)),
    );
  if (!vendor) throw new NotFoundError('Vendor', vendorId);
  const payable = await computePayable(db, ctx.org_id, vendorId, vendor.opening_balance ?? '0');
  return { ...vendor, payable };
}

export async function softDeleteVendor(
  db: DbClient,
  ctx: RequestContext,
  vendorId: string,
): Promise<void> {
  const [txn] = await db
    .select({ id: purchase_invoices.id })
    .from(purchase_invoices)
    .where(
      and(eq(purchase_invoices.org_id, ctx.org_id), eq(purchase_invoices.vendor_id, vendorId)),
    )
    .limit(1);
  if (txn) {
    throw new BusinessError(
      'Vendor has purchases and cannot be deleted. Set status to Inactive instead.',
    );
  }
  const [exists] = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(
      and(eq(vendors.id, vendorId), eq(vendors.org_id, ctx.org_id), isNull(vendors.deleted_at)),
    );
  if (!exists) throw new NotFoundError('Vendor', vendorId);

  await db.transaction(async (trx) => {
    await trx
      .update(vendors)
      .set({ deleted_at: new Date(), deleted_by: ctx.user_id, updated_by: ctx.user_id })
      .where(and(eq(vendors.id, vendorId), eq(vendors.org_id, ctx.org_id)));
    await trx.insert(audit_log).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      ip: ctx.ip,
      entity_table: 'vendors',
      entity_id: vendorId,
      action: 'delete',
      before_json: { id: vendorId },
      after_json: { deleted: true },
    });
  });
}
