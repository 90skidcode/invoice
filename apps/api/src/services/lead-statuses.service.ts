import type { DbClient } from '@counter/db';
import { lead_statuses } from '@counter/db';
import type { CreateLeadStatusInput, UpdateLeadStatusInput } from '@counter/schemas';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { BusinessError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';

// Business logic (dashboard queries, convertLead) depends on these slugs
// existing — block deleting them so the picklist can't be edited out from
// under the app.
const RESERVED_SLUGS = new Set(['lost', 'converted']);

export async function getLeadStatuses(db: DbClient, ctx: RequestContext) {
  return await db
    .select()
    .from(lead_statuses)
    .where(and(eq(lead_statuses.org_id, ctx.org_id), isNull(lead_statuses.deleted_at)))
    .orderBy(lead_statuses.order_index, desc(lead_statuses.created_at));
}

export async function createLeadStatus(
  db: DbClient,
  ctx: RequestContext,
  input: CreateLeadStatusInput,
) {
  const { id, ...data } = input;

  const result = await db
    .insert(lead_statuses)
    .values({
      id,
      org_id: ctx.org_id,
      name: data.name,
      slug: data.slug,
      badge_color: data.badge_color || 'bg-gray-100 text-gray-800',
      order_index: data.order_index ?? 0,
      is_active: true,
      created_by: ctx.user_id,
      updated_by: ctx.user_id,
    })
    .returning();

  return result[0];
}

export async function updateLeadStatus(
  db: DbClient,
  ctx: RequestContext,
  id: string,
  input: UpdateLeadStatusInput,
) {
  const existing = await db
    .select()
    .from(lead_statuses)
    .where(and(eq(lead_statuses.id, id), eq(lead_statuses.org_id, ctx.org_id)))
    .limit(1);

  if (!existing.length) {
    throw new NotFoundError('LeadStatus', id);
  }

  const result = await db
    .update(lead_statuses)
    .set({
      name: input.name ?? undefined,
      badge_color: input.badge_color ?? undefined,
      order_index: input.order_index ?? undefined,
      is_active: input.is_active ?? undefined,
      updated_at: new Date(),
      updated_by: ctx.user_id,
    })
    .where(and(eq(lead_statuses.id, id), eq(lead_statuses.org_id, ctx.org_id)))
    .returning();

  return result[0];
}

export async function deleteLeadStatus(db: DbClient, ctx: RequestContext, id: string) {
  const existing = await db
    .select()
    .from(lead_statuses)
    .where(and(eq(lead_statuses.id, id), eq(lead_statuses.org_id, ctx.org_id)))
    .limit(1);

  if (!existing.length) {
    throw new NotFoundError('LeadStatus', id);
  }
  if (RESERVED_SLUGS.has(existing[0]!.slug)) {
    throw new BusinessError(
      `"${existing[0]!.name}" is a system status and cannot be deleted. Deactivate it instead.`,
    );
  }

  await db
    .update(lead_statuses)
    .set({
      deleted_at: new Date(),
      updated_at: new Date(),
      updated_by: ctx.user_id,
    })
    .where(eq(lead_statuses.id, id));
}
