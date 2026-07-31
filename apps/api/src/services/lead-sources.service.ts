import type { DbClient } from '@counter/db';
import { lead_sources } from '@counter/db';
import type { CreateLeadSourceInput, UpdateLeadSourceInput } from '@counter/schemas';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';

export async function getLeadSources(db: DbClient, ctx: RequestContext) {
  return await db
    .select()
    .from(lead_sources)
    .where(and(eq(lead_sources.org_id, ctx.org_id), isNull(lead_sources.deleted_at)))
    .orderBy(lead_sources.order_index, desc(lead_sources.created_at));
}

export async function createLeadSource(
  db: DbClient,
  ctx: RequestContext,
  input: CreateLeadSourceInput,
) {
  const { id, ...data } = input;

  const result = await db
    .insert(lead_sources)
    .values({
      id,
      org_id: ctx.org_id,
      name: data.name,
      badge_color: data.badge_color || 'bg-gray-100 text-gray-800',
      order_index: data.order_index ?? 0,
      is_active: true,
      created_by: ctx.user_id,
      updated_by: ctx.user_id,
    })
    .returning();

  return result[0];
}

export async function updateLeadSource(
  db: DbClient,
  ctx: RequestContext,
  id: string,
  input: UpdateLeadSourceInput,
) {
  const existing = await db
    .select()
    .from(lead_sources)
    .where(and(eq(lead_sources.id, id), eq(lead_sources.org_id, ctx.org_id)))
    .limit(1);

  if (!existing.length) {
    throw new NotFoundError('LeadSource', id);
  }

  const result = await db
    .update(lead_sources)
    .set({
      name: input.name ?? undefined,
      badge_color: input.badge_color ?? undefined,
      order_index: input.order_index ?? undefined,
      is_active: input.is_active ?? undefined,
      updated_at: new Date(),
      updated_by: ctx.user_id,
    })
    .where(and(eq(lead_sources.id, id), eq(lead_sources.org_id, ctx.org_id)))
    .returning();

  return result[0];
}

export async function deleteLeadSource(db: DbClient, ctx: RequestContext, id: string) {
  const existing = await db
    .select()
    .from(lead_sources)
    .where(and(eq(lead_sources.id, id), eq(lead_sources.org_id, ctx.org_id)))
    .limit(1);

  if (!existing.length) {
    throw new NotFoundError('LeadSource', id);
  }

  await db
    .update(lead_sources)
    .set({
      deleted_at: new Date(),
      updated_at: new Date(),
      updated_by: ctx.user_id,
    })
    .where(eq(lead_sources.id, id));
}
