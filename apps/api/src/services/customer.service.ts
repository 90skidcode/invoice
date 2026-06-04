import { eq, and, isNull, ilike, or, lt, desc, sql } from 'drizzle-orm';
import type { DbClient } from '@counter/db';
import { customers, invoices, payments, audit_log } from '@counter/db';
import type { CreateCustomerInput, UpdateCustomerInput } from '@counter/schemas';
import { Decimal } from '@counter/utils';
import type { RequestContext } from '../context.js';
import { NotFoundError, ConflictError, BusinessError } from '../errors.js';

function creditStatus(balance: Decimal, limit: Decimal, blocked: boolean): string {
  if (blocked) return 'blocked';
  if (limit.greaterThan(0)) {
    if (balance.greaterThan(limit)) return 'over_limit';
    if (balance.greaterThan(limit.times('0.8'))) return 'near_limit';
  }
  return 'ok';
}

/** Outstanding receivable = opening balance + sum of open invoice balances. */
async function computeOutstanding(
  db: DbClient,
  orgId: string,
  customerId: string,
  openingBalance: string,
): Promise<string> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${invoices.balance_due}), 0)` })
    .from(invoices)
    .where(
      and(
        eq(invoices.org_id, orgId),
        eq(invoices.customer_id, customerId),
        isNull(invoices.deleted_at),
      ),
    );
  return new Decimal(openingBalance ?? '0').plus(row?.total ?? '0').toFixed(2);
}

async function nextCustomerCode(db: DbClient, orgId: string): Promise<string> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(customers)
    .where(eq(customers.org_id, orgId));
  const next = Number(row?.n ?? 0) + 1;
  return `CUST-${String(next).padStart(5, '0')}`;
}

export async function createCustomer(
  db: DbClient,
  ctx: RequestContext,
  input: CreateCustomerInput,
) {
  return await db.transaction(async (trx) => {
    // Warn-but-allow duplicate phone is a UI concern; enforce code uniqueness here.
    const code = input.customer_code ?? (await nextCustomerCode(db, ctx.org_id));

    const existing = await trx
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.org_id, ctx.org_id),
          eq(customers.customer_code, code),
          isNull(customers.deleted_at),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      throw new ConflictError(`Customer code "${code}" is already in use`);
    }

    const customerId = input.client_id as string;

    await trx.insert(customers).values({
      id: customerId,
      org_id: ctx.org_id,
      customer_code: code,
      name: input.name,
      display_name: input.display_name ?? null,
      type: input.type,
      phone: input.phone,
      alt_phone: input.alt_phone ?? null,
      email: input.email ?? null,
      whatsapp_number: input.whatsapp_number ?? null,
      gstin: input.gstin ?? null,
      gst_reg_type: input.gst_reg_type,
      pan: input.pan ?? null,
      place_of_supply: input.place_of_supply ?? null,
      billing_address: input.billing_address ?? null,
      shipping_address: input.shipping_address ?? null,
      shipping_same_as_billing: input.shipping_same_as_billing,
      credit_limit: input.credit_limit,
      credit_days: input.credit_days,
      block_on_limit_breach: input.block_on_limit_breach,
      customer_group_id: input.customer_group_id ?? null,
      price_tier_id: input.price_tier_id ?? null,
      opening_balance: input.opening_balance,
      opening_as_of_date: input.opening_as_of_date ?? null,
      status: input.status,
      tags: input.tags ?? [],
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
      entity_table: 'customers',
      entity_id: customerId,
      action: 'create',
      before_json: null,
      after_json: { customer_code: code, name: input.name, phone: input.phone },
    });

    return { id: customerId, customer_code: code, name: input.name };
  });
}

export async function updateCustomer(
  db: DbClient,
  ctx: RequestContext,
  customerId: string,
  input: UpdateCustomerInput,
  expectedVersion: number,
) {
  const result = await db
    .update(customers)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.display_name !== undefined ? { display_name: input.display_name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.gstin !== undefined ? { gstin: input.gstin } : {}),
      ...(input.credit_limit !== undefined ? { credit_limit: input.credit_limit } : {}),
      ...(input.credit_days !== undefined ? { credit_days: input.credit_days } : {}),
      ...(input.block_on_limit_breach !== undefined
        ? { block_on_limit_breach: input.block_on_limit_breach }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.billing_address !== undefined ? { billing_address: input.billing_address } : {}),
      ...(input.price_tier_id !== undefined ? { price_tier_id: input.price_tier_id } : {}),
      updated_at: new Date(),
      updated_by: ctx.user_id,
      row_version: sql`${customers.row_version} + 1`,
    })
    .where(
      and(
        eq(customers.id, customerId),
        eq(customers.org_id, ctx.org_id),
        eq(customers.row_version, expectedVersion),
        isNull(customers.deleted_at),
      ),
    )
    .returning({ id: customers.id, row_version: customers.row_version });

  if (result.length === 0) {
    // Either not found or version mismatch — distinguish for a useful error.
    const [exists] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.org_id, ctx.org_id)));
    if (!exists) throw new NotFoundError('Customer', customerId);
    throw new ConflictError('Customer was modified by another user — refresh and retry');
  }

  return result[0];
}

export async function listCustomers(
  db: DbClient,
  ctx: RequestContext,
  params: {
    q?: string | undefined;
    status?: string | undefined;
    limit: number;
    cursor?: string | undefined;
  },
) {
  const conditions = [eq(customers.org_id, ctx.org_id), isNull(customers.deleted_at)];
  if (params.status) conditions.push(eq(customers.status, params.status));
  if (params.q) {
    const m = or(
      ilike(customers.name, `%${params.q}%`),
      ilike(customers.phone, `%${params.q}%`),
      ilike(customers.customer_code, `%${params.q}%`),
    );
    if (m) conditions.push(m);
  }
  if (params.cursor) conditions.push(lt(customers.id, params.cursor));

  const rows = await db
    .select({
      id: customers.id,
      customer_code: customers.customer_code,
      name: customers.name,
      phone: customers.phone,
      gstin: customers.gstin,
      credit_limit: customers.credit_limit,
      status: customers.status,
    })
    .from(customers)
    .where(and(...conditions))
    .orderBy(desc(customers.id))
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

export async function lookupCustomers(
  db: DbClient,
  ctx: RequestContext,
  query: string,
  limit = 10,
) {
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      price_tier_id: customers.price_tier_id,
      credit_limit: customers.credit_limit,
      opening_balance: customers.opening_balance,
      status: customers.status,
    })
    .from(customers)
    .where(
      and(
        eq(customers.org_id, ctx.org_id),
        isNull(customers.deleted_at),
        or(ilike(customers.name, `%${query}%`), ilike(customers.phone, `%${query}%`)),
      ),
    )
    .limit(limit);

  // Compute balance + credit status per result.
  const results = [];
  for (const r of rows) {
    const balance = await computeOutstanding(db, ctx.org_id, r.id, r.opening_balance ?? '0');
    results.push({
      id: r.id,
      name: r.name,
      phone: r.phone,
      price_tier_id: r.price_tier_id,
      credit_status: creditStatus(
        new Decimal(balance),
        new Decimal(r.credit_limit ?? '0'),
        r.status === 'Blocked',
      ),
      balance_due: balance,
    });
  }
  return results;
}

export async function getCustomerById(db: DbClient, ctx: RequestContext, customerId: string) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.id, customerId),
        eq(customers.org_id, ctx.org_id),
        isNull(customers.deleted_at),
      ),
    );
  if (!customer) throw new NotFoundError('Customer', customerId);

  const outstanding = await computeOutstanding(
    db,
    ctx.org_id,
    customerId,
    customer.opening_balance ?? '0',
  );
  return { ...customer, outstanding };
}

export async function getCustomerOutstanding(
  db: DbClient,
  ctx: RequestContext,
  customerId: string,
) {
  const [customer] = await db
    .select({ opening_balance: customers.opening_balance, credit_limit: customers.credit_limit, status: customers.status })
    .from(customers)
    .where(
      and(
        eq(customers.id, customerId),
        eq(customers.org_id, ctx.org_id),
        isNull(customers.deleted_at),
      ),
    );
  if (!customer) throw new NotFoundError('Customer', customerId);

  const balance = await computeOutstanding(
    db,
    ctx.org_id,
    customerId,
    customer.opening_balance ?? '0',
  );

  const openInvoices = await db
    .select({
      id: invoices.id,
      invoice_no: invoices.invoice_no,
      invoice_date: invoices.invoice_date,
      grand_total: invoices.grand_total,
      balance_due: invoices.balance_due,
      due_date: invoices.due_date,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.org_id, ctx.org_id),
        eq(invoices.customer_id, customerId),
        isNull(invoices.deleted_at),
        sql`${invoices.balance_due} > 0`,
      ),
    )
    .orderBy(invoices.invoice_date);

  return {
    balance_due: balance,
    credit_limit: String(customer.credit_limit ?? '0'),
    credit_status: creditStatus(
      new Decimal(balance),
      new Decimal(customer.credit_limit ?? '0'),
      customer.status === 'Blocked',
    ),
    open_invoices: openInvoices,
  };
}

/** Running-balance ledger from opening balance + invoices (debit) + receipts (credit). */
export async function getCustomerLedger(
  db: DbClient,
  ctx: RequestContext,
  customerId: string,
) {
  const [customer] = await db
    .select({ opening_balance: customers.opening_balance, opening_as_of_date: customers.opening_as_of_date, name: customers.name })
    .from(customers)
    .where(
      and(
        eq(customers.id, customerId),
        eq(customers.org_id, ctx.org_id),
        isNull(customers.deleted_at),
      ),
    );
  if (!customer) throw new NotFoundError('Customer', customerId);

  const invRows = await db
    .select({
      date: invoices.invoice_date,
      ref: invoices.invoice_no,
      debit: invoices.grand_total,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.org_id, ctx.org_id),
        eq(invoices.customer_id, customerId),
        isNull(invoices.deleted_at),
      ),
    );

  const payRows = await db
    .select({
      date: payments.payment_date,
      ref: payments.payment_no,
      credit: payments.amount,
    })
    .from(payments)
    .where(
      and(
        eq(payments.org_id, ctx.org_id),
        eq(payments.party_id, customerId),
        eq(payments.direction, 'inbound'),
        eq(payments.is_voided, false),
        isNull(payments.deleted_at),
      ),
    );

  type Entry = { date: string; type: string; ref: string; debit: string; credit: string };
  const entries: Entry[] = [
    ...invRows.map((r) => ({
      date: r.date,
      type: 'invoice',
      ref: r.ref,
      debit: String(r.debit),
      credit: '0.00',
    })),
    ...payRows.map((r) => ({
      date: r.date,
      type: 'receipt',
      ref: r.ref,
      debit: '0.00',
      credit: String(r.credit),
    })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let running = new Decimal(customer.opening_balance ?? '0');
  const ledger = entries.map((e) => {
    running = running.plus(e.debit).minus(e.credit);
    return { ...e, balance: running.toFixed(2) };
  });

  return {
    customer_name: customer.name,
    opening_balance: String(customer.opening_balance ?? '0.00'),
    opening_as_of_date: customer.opening_as_of_date,
    entries: ledger,
    closing_balance: running.toFixed(2),
  };
}

export async function softDeleteCustomer(
  db: DbClient,
  ctx: RequestContext,
  customerId: string,
): Promise<void> {
  // Block delete if the customer has any invoices (force inactive instead).
  const [txn] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.org_id, ctx.org_id), eq(invoices.customer_id, customerId)))
    .limit(1);
  if (txn) {
    throw new BusinessError(
      'Customer has transactions and cannot be deleted. Set status to Inactive instead.',
    );
  }

  const [exists] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.id, customerId),
        eq(customers.org_id, ctx.org_id),
        isNull(customers.deleted_at),
      ),
    );
  if (!exists) throw new NotFoundError('Customer', customerId);

  await db.transaction(async (trx) => {
    await trx
      .update(customers)
      .set({ deleted_at: new Date(), deleted_by: ctx.user_id, updated_by: ctx.user_id })
      .where(and(eq(customers.id, customerId), eq(customers.org_id, ctx.org_id)));

    await trx.insert(audit_log).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      ip: ctx.ip,
      entity_table: 'customers',
      entity_id: customerId,
      action: 'delete',
      before_json: { id: customerId },
      after_json: { deleted: true },
    });
  });
}
