import { eq, and, isNull, desc, lt, sql } from 'drizzle-orm';
import type { DbClient } from '@counter/db';
import {
  payments,
  payment_allocations,
  invoices,
  bank_accounts,
  audit_log,
} from '@counter/db';
import type { CreatePaymentInput } from '@counter/schemas';
import { Decimal } from '@counter/utils';
import type { RequestContext } from '../context.js';
import { NotFoundError, BusinessError } from '../errors.js';

function paymentStatusFor(grandTotal: Decimal, amountPaid: Decimal): string {
  if (amountPaid.greaterThanOrEqualTo(grandTotal)) return 'paid';
  if (amountPaid.greaterThan(0)) return 'partial';
  return 'unpaid';
}

async function nextPaymentNo(trx: DbClient, orgId: string): Promise<string> {
  const [row] = await trx
    .select({ n: sql<number>`count(*)` })
    .from(payments)
    .where(eq(payments.org_id, orgId));
  return `RCP-${String(Number(row?.n ?? 0) + 1).padStart(5, '0')}`;
}

export async function createPayment(
  db: DbClient,
  ctx: RequestContext,
  input: CreatePaymentInput,
) {
  return await db.transaction(async (trx) => {
    const allocations = input.allocations ?? [];
    const amount = new Decimal(input.amount);

    // 1. Validate allocation total does not exceed the payment amount.
    const allocTotal = allocations.reduce((acc, a) => acc.plus(a.amount), new Decimal('0'));
    if (allocTotal.greaterThan(amount)) {
      throw new BusinessError(
        `Allocated ₹${allocTotal.toFixed(2)} exceeds payment amount ₹${amount.toFixed(2)}`,
      );
    }

    const paymentId = input.client_id as string;
    const paymentNo = await nextPaymentNo(trx as unknown as DbClient, ctx.org_id);

    // 2. Insert the payment row.
    await trx.insert(payments).values({
      id: paymentId,
      org_id: ctx.org_id,
      payment_no: paymentNo,
      payment_date: input.payment_date,
      direction: input.direction,
      party_type: input.party_type,
      party_id: input.party_id ?? null,
      amount: input.amount,
      mode: input.mode,
      account_id: input.account_id ?? null,
      reference: input.reference ?? null,
      narration: input.narration ?? null,
      created_by: ctx.user_id,
      updated_by: ctx.user_id,
    });

    // 3. Apply each allocation to its invoice (validate + recompute status).
    for (const alloc of allocations) {
      const [inv] = await trx
        .select({
          id: invoices.id,
          grand_total: invoices.grand_total,
          amount_paid: invoices.amount_paid,
          balance_due: invoices.balance_due,
          row_version: invoices.row_version,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.id, alloc.invoice_id),
            eq(invoices.org_id, ctx.org_id),
            isNull(invoices.deleted_at),
          ),
        )
        .for('update');

      if (!inv) throw new NotFoundError('Invoice', alloc.invoice_id);

      const allocAmt = new Decimal(alloc.amount);
      const currentDue = new Decimal(inv.balance_due);
      if (allocAmt.greaterThan(currentDue)) {
        throw new BusinessError(
          `Allocation ₹${allocAmt.toFixed(2)} exceeds invoice ${inv.id} outstanding ₹${currentDue.toFixed(2)}`,
        );
      }

      const newPaid = new Decimal(inv.amount_paid).plus(allocAmt);
      const newDue = new Decimal(inv.grand_total).minus(newPaid);

      await trx
        .update(invoices)
        .set({
          amount_paid: newPaid.toFixed(2),
          balance_due: newDue.toFixed(2),
          payment_status: paymentStatusFor(new Decimal(inv.grand_total), newPaid),
          updated_at: new Date(),
          updated_by: ctx.user_id,
          row_version: sql`${invoices.row_version} + 1`,
        })
        .where(eq(invoices.id, alloc.invoice_id));

      await trx.insert(payment_allocations).values({
        id: crypto.randomUUID(),
        org_id: ctx.org_id,
        payment_id: paymentId,
        invoice_id: alloc.invoice_id,
        amount: alloc.amount,
      });
    }

    // 4. Update bank/cash account balance if specified.
    if (input.account_id) {
      const delta = input.direction === 'inbound' ? amount : amount.negated();
      await trx
        .update(bank_accounts)
        .set({
          current_balance: sql`${bank_accounts.current_balance} + ${delta.toFixed(2)}`,
          updated_at: new Date(),
        })
        .where(and(eq(bank_accounts.id, input.account_id), eq(bank_accounts.org_id, ctx.org_id)));
    }

    // 5. Audit.
    await trx.insert(audit_log).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      ip: ctx.ip,
      entity_table: 'payments',
      entity_id: paymentId,
      action: 'create',
      before_json: null,
      after_json: { payment_no: paymentNo, amount: input.amount, allocations: allocations.length },
    });

    const unallocated = amount.minus(allocTotal).toFixed(2);
    return {
      id: paymentId,
      payment_no: paymentNo,
      amount: input.amount,
      allocated: allocTotal.toFixed(2),
      unallocated,
    };
  });
}

export async function voidPayment(
  db: DbClient,
  ctx: RequestContext,
  paymentId: string,
  reason: string,
) {
  return await db.transaction(async (trx) => {
    const [pmt] = await trx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.id, paymentId),
          eq(payments.org_id, ctx.org_id),
          isNull(payments.deleted_at),
        ),
      )
      .for('update');

    if (!pmt) throw new NotFoundError('Payment', paymentId);
    if (pmt.is_voided) throw new BusinessError('Payment is already voided');

    // Reverse each allocation against its invoice.
    const allocs = await trx
      .select()
      .from(payment_allocations)
      .where(eq(payment_allocations.payment_id, paymentId));

    for (const a of allocs) {
      if (!a.invoice_id) continue;
      const [inv] = await trx
        .select({
          grand_total: invoices.grand_total,
          amount_paid: invoices.amount_paid,
        })
        .from(invoices)
        .where(eq(invoices.id, a.invoice_id))
        .for('update');
      if (!inv) continue;

      const newPaid = new Decimal(inv.amount_paid).minus(a.amount);
      const newDue = new Decimal(inv.grand_total).minus(newPaid);
      await trx
        .update(invoices)
        .set({
          amount_paid: newPaid.toFixed(2),
          balance_due: newDue.toFixed(2),
          payment_status: paymentStatusFor(new Decimal(inv.grand_total), newPaid),
          updated_at: new Date(),
          updated_by: ctx.user_id,
          row_version: sql`${invoices.row_version} + 1`,
        })
        .where(eq(invoices.id, a.invoice_id));
    }

    // Reverse bank balance.
    if (pmt.account_id) {
      const delta =
        pmt.direction === 'inbound'
          ? new Decimal(pmt.amount).negated()
          : new Decimal(pmt.amount);
      await trx
        .update(bank_accounts)
        .set({
          current_balance: sql`${bank_accounts.current_balance} + ${delta.toFixed(2)}`,
          updated_at: new Date(),
        })
        .where(eq(bank_accounts.id, pmt.account_id));
    }

    await trx
      .update(payments)
      .set({
        is_voided: true,
        narration: `VOID: ${reason}`,
        updated_at: new Date(),
        updated_by: ctx.user_id,
        row_version: sql`${payments.row_version} + 1`,
      })
      .where(eq(payments.id, paymentId));

    await trx.insert(audit_log).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      ip: ctx.ip,
      entity_table: 'payments',
      entity_id: paymentId,
      action: 'void',
      before_json: { is_voided: false },
      after_json: { is_voided: true, reason },
      note: reason,
    });

    return { ok: true };
  });
}

export async function listPayments(
  db: DbClient,
  ctx: RequestContext,
  params: {
    direction?: string | undefined;
    party_id?: string | undefined;
    limit: number;
    cursor?: string | undefined;
  },
) {
  const conditions = [eq(payments.org_id, ctx.org_id), isNull(payments.deleted_at)];
  if (params.direction) conditions.push(eq(payments.direction, params.direction));
  if (params.party_id) conditions.push(eq(payments.party_id, params.party_id));
  if (params.cursor) conditions.push(lt(payments.id, params.cursor));

  const rows = await db
    .select({
      id: payments.id,
      payment_no: payments.payment_no,
      payment_date: payments.payment_date,
      direction: payments.direction,
      party_type: payments.party_type,
      party_id: payments.party_id,
      amount: payments.amount,
      mode: payments.mode,
      reference: payments.reference,
      is_voided: payments.is_voided,
    })
    .from(payments)
    .where(and(...conditions))
    .orderBy(desc(payments.id))
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
