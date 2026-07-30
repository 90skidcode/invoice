import type { DbClient } from '@counter/db';
import { payment_modes } from '@counter/db';
import type { CreatePaymentModeInput, UpdatePaymentModeInput } from '@counter/schemas';
import { Decimal } from '@counter/utils';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { NotFoundError, PermissionError } from '../errors.js';
import type { RequestContext } from '../context.js';

export async function getPaymentModes(db: DbClient, ctx: RequestContext) {
  return await db
    .select()
    .from(payment_modes)
    .where(and(eq(payment_modes.org_id, ctx.org_id), isNull(payment_modes.deleted_at)))
    .orderBy(payment_modes.order_index, desc(payment_modes.created_at));
}

export async function createPaymentMode(
  db: DbClient,
  ctx: RequestContext,
  input: CreatePaymentModeInput,
) {
  const { id, ...data } = input;

  const result = await db
    .insert(payment_modes)
    .values({
      id,
      org_id: ctx.org_id,
      name: data.name,
      type: data.type,
      badge_color: data.badge_color || 'bg-gray-100 text-gray-800',
      order_index: data.order_index ?? 0,
      is_active: true,
      created_by: ctx.user_id,
      updated_by: ctx.user_id,
    })
    .returning();

  return result[0];
}

export async function updatePaymentMode(
  db: DbClient,
  ctx: RequestContext,
  id: string,
  input: UpdatePaymentModeInput,
) {
  const existing = await db
    .select()
    .from(payment_modes)
    .where(and(eq(payment_modes.id, id), eq(payment_modes.org_id, ctx.org_id)))
    .limit(1);

  if (!existing.length) {
    throw new NotFoundError('PaymentMode', id);
  }

  const result = await db
    .update(payment_modes)
    .set({
      name: input.name ?? undefined,
      type: input.type ?? undefined,
      badge_color: input.badge_color ?? undefined,
      order_index: input.order_index ?? undefined,
      is_active: input.is_active ?? undefined,
      updated_at: new Date(),
      updated_by: ctx.user_id,
    })
    .where(and(eq(payment_modes.id, id), eq(payment_modes.org_id, ctx.org_id)))
    .returning();

  return result[0];
}

export async function deletePaymentMode(db: DbClient, ctx: RequestContext, id: string) {
  const existing = await db
    .select()
    .from(payment_modes)
    .where(and(eq(payment_modes.id, id), eq(payment_modes.org_id, ctx.org_id)))
    .limit(1);

  if (!existing.length) {
    throw new NotFoundError('PaymentMode', id);
  }

  await db
    .update(payment_modes)
    .set({
      deleted_at: new Date(),
      updated_at: new Date(),
      updated_by: ctx.user_id,
    })
    .where(eq(payment_modes.id, id));
}
