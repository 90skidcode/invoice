import type { DbClient } from '@counter/db';
import {
  audit_log,
  customers,
  lead_activities,
  lead_sources,
  lead_tag_links,
  lead_tags,
  leads,
} from '@counter/db';
import type {
  ConvertLeadInput,
  CreateLeadInput,
  LogFollowUpInput,
  UpdateLeadInput,
} from '@counter/schemas';
import { and, desc, eq, gte, ilike, isNull, lt, lte, or, sql } from 'drizzle-orm';
import type { RequestContext } from '../context.js';
import { BusinessError, ConflictError, NotFoundError } from '../errors.js';
import { insertCustomerInTrx } from './customer.service.js';

type Trx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

const NOT_LOST_OR_CONVERTED = (orgId: string) =>
  and(
    eq(leads.org_id, orgId),
    isNull(leads.deleted_at),
    sql`${leads.status} not in ('lost', 'converted')`,
  );

export async function createLead(db: DbClient, ctx: RequestContext, input: CreateLeadInput) {
  return await db.transaction(async (trx) => {
    const leadId = input.client_id as string;

    await trx.insert(leads).values({
      id: leadId,
      org_id: ctx.org_id,
      name: input.name,
      phone: input.phone,
      email: input.email ?? null,
      company_name: input.company_name ?? null,
      source_id: input.source_id ?? null,
      status: input.status,
      assigned_to: input.assigned_to ?? null,
      expected_value: input.expected_value ?? null,
      next_follow_up_at: input.next_follow_up_at ? new Date(input.next_follow_up_at) : null,
      referred_by_customer_id: input.referred_by_customer_id ?? null,
      notes: input.notes ?? null,
      created_by: ctx.user_id,
      updated_by: ctx.user_id,
    });

    await trx.insert(audit_log).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      ip: ctx.ip,
      entity_table: 'leads',
      entity_id: leadId,
      action: 'create',
      before_json: null,
      after_json: { name: input.name, phone: input.phone },
    });

    return { id: leadId, name: input.name, phone: input.phone };
  });
}

export async function updateLead(
  db: DbClient,
  ctx: RequestContext,
  leadId: string,
  input: UpdateLeadInput,
  expectedVersion: number,
) {
  const result = await db
    .update(leads)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.company_name !== undefined ? { company_name: input.company_name } : {}),
      ...(input.source_id !== undefined ? { source_id: input.source_id } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.assigned_to !== undefined ? { assigned_to: input.assigned_to } : {}),
      ...(input.expected_value !== undefined ? { expected_value: input.expected_value } : {}),
      ...(input.next_follow_up_at !== undefined
        ? { next_follow_up_at: input.next_follow_up_at ? new Date(input.next_follow_up_at) : null }
        : {}),
      ...(input.referred_by_customer_id !== undefined
        ? { referred_by_customer_id: input.referred_by_customer_id }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      updated_at: new Date(),
      updated_by: ctx.user_id,
      row_version: sql`${leads.row_version} + 1`,
    })
    .where(
      and(
        eq(leads.id, leadId),
        eq(leads.org_id, ctx.org_id),
        eq(leads.row_version, expectedVersion),
        isNull(leads.deleted_at),
      ),
    )
    .returning({ id: leads.id, row_version: leads.row_version });

  if (result.length === 0) {
    const [exists] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.org_id, ctx.org_id)));
    if (!exists) throw new NotFoundError('Lead', leadId);
    throw new ConflictError('Lead was modified by another user — refresh and retry');
  }

  return result[0];
}

export async function listLeads(
  db: DbClient,
  ctx: RequestContext,
  params: {
    q?: string | undefined;
    status?: string | undefined;
    source_id?: string | undefined;
    assigned_to?: string | undefined;
    limit: number;
    cursor?: string | undefined;
  },
) {
  const conditions = [eq(leads.org_id, ctx.org_id), isNull(leads.deleted_at)];
  if (params.status) conditions.push(eq(leads.status, params.status));
  if (params.source_id) conditions.push(eq(leads.source_id, params.source_id));
  if (params.assigned_to) conditions.push(eq(leads.assigned_to, params.assigned_to));
  if (params.q) {
    const m = or(ilike(leads.name, `%${params.q}%`), ilike(leads.phone, `%${params.q}%`));
    if (m) conditions.push(m);
  }
  if (params.cursor) conditions.push(lt(leads.id, params.cursor));

  const rows = await db
    .select({
      id: leads.id,
      name: leads.name,
      phone: leads.phone,
      company_name: leads.company_name,
      source_id: leads.source_id,
      status: leads.status,
      assigned_to: leads.assigned_to,
      expected_value: leads.expected_value,
      next_follow_up_at: leads.next_follow_up_at,
    })
    .from(leads)
    .where(and(...conditions))
    .orderBy(desc(leads.id))
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

async function getLeadTagsFor(db: DbClient | Trx, orgId: string, leadId: string) {
  return db
    .select({ id: lead_tags.id, name: lead_tags.name, color: lead_tags.color })
    .from(lead_tag_links)
    .innerJoin(lead_tags, eq(lead_tag_links.tag_id, lead_tags.id))
    .where(and(eq(lead_tag_links.lead_id, leadId), eq(lead_tag_links.org_id, orgId)));
}

export async function getLeadById(db: DbClient, ctx: RequestContext, leadId: string) {
  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.org_id, ctx.org_id), isNull(leads.deleted_at)));
  if (!lead) throw new NotFoundError('Lead', leadId);

  const activities = await db
    .select()
    .from(lead_activities)
    .where(eq(lead_activities.lead_id, leadId))
    .orderBy(desc(lead_activities.created_at));

  const tags = await getLeadTagsFor(db, ctx.org_id, leadId);

  return { ...lead, activities, tags };
}

export async function softDeleteLead(db: DbClient, ctx: RequestContext, leadId: string) {
  const [exists] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.org_id, ctx.org_id), isNull(leads.deleted_at)));
  if (!exists) throw new NotFoundError('Lead', leadId);

  await db.transaction(async (trx) => {
    await trx
      .update(leads)
      .set({ deleted_at: new Date(), deleted_by: ctx.user_id, updated_by: ctx.user_id })
      .where(and(eq(leads.id, leadId), eq(leads.org_id, ctx.org_id)));

    await trx.insert(audit_log).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      ip: ctx.ip,
      entity_table: 'leads',
      entity_id: leadId,
      action: 'delete',
      before_json: { id: leadId },
      after_json: { deleted: true },
    });
  });
}

/**
 * Logs a follow-up: one activity row capturing what happened, plus updates
 * to the lead itself (status, next_follow_up_at, last_contacted_at) so
 * list/dashboard queries never need to derive current state from the log.
 * Re-typing an existing tag name never creates a duplicate — new tags are
 * inserted with ON CONFLICT DO NOTHING, then re-selected by name.
 */
export async function logFollowUp(
  db: DbClient,
  ctx: RequestContext,
  leadId: string,
  input: LogFollowUpInput,
) {
  return await db.transaction(async (trx) => {
    const [lead] = await trx
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.org_id, ctx.org_id), isNull(leads.deleted_at)));
    if (!lead) throw new NotFoundError('Lead', leadId);

    const nextFollowUp = input.next_follow_up_at ? new Date(input.next_follow_up_at) : null;

    await trx.insert(lead_activities).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      lead_id: leadId,
      type: 'call',
      note: input.note ?? null,
      status_at_time: input.status,
      next_follow_up_at: nextFollowUp,
      created_by: ctx.user_id,
    });

    await trx
      .update(leads)
      .set({
        status: input.status,
        next_follow_up_at: nextFollowUp,
        last_contacted_at: new Date(),
        updated_at: new Date(),
        updated_by: ctx.user_id,
        row_version: sql`${leads.row_version} + 1`,
      })
      .where(and(eq(leads.id, leadId), eq(leads.org_id, ctx.org_id)));

    const tagIds = new Set(input.tag_ids ?? []);
    for (const name of input.new_tag_names ?? []) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      await trx
        .insert(lead_tags)
        .values({ id: crypto.randomUUID(), org_id: ctx.org_id, name: trimmed, created_by: ctx.user_id })
        .onConflictDoNothing({ target: [lead_tags.org_id, lead_tags.name] });
      const [tag] = await trx
        .select({ id: lead_tags.id })
        .from(lead_tags)
        .where(and(eq(lead_tags.org_id, ctx.org_id), eq(lead_tags.name, trimmed)));
      if (tag) tagIds.add(tag.id);
    }

    for (const tagId of tagIds) {
      await trx
        .insert(lead_tag_links)
        .values({ lead_id: leadId, tag_id: tagId, org_id: ctx.org_id })
        .onConflictDoNothing({ target: [lead_tag_links.lead_id, lead_tag_links.tag_id] });
    }

    return { id: leadId, status: input.status, next_follow_up_at: input.next_follow_up_at ?? null };
  });
}

export async function convertLead(
  db: DbClient,
  ctx: RequestContext,
  leadId: string,
  input: ConvertLeadInput,
) {
  return await db.transaction(async (trx) => {
    const [lead] = await trx
      .select()
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.org_id, ctx.org_id), isNull(leads.deleted_at)))
      .for('update');
    if (!lead) throw new NotFoundError('Lead', leadId);
    if (lead.customer_id) throw new BusinessError('Lead has already been converted');

    const customer = await insertCustomerInTrx(trx, ctx, {
      client_id: input.client_id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email ?? null,
      type: 'Individual',
      gstin: input.gstin ?? null,
      gst_reg_type: input.gst_reg_type ?? 'Consumer',
      shipping_same_as_billing: true,
      credit_limit: input.credit_limit ?? '0.00',
      credit_days: input.credit_days ?? 0,
      block_on_limit_breach: false,
      opening_balance: '0.00',
      status: 'Active',
    });

    await trx
      .update(leads)
      .set({
        customer_id: customer.id,
        status: 'converted',
        converted_at: new Date(),
        updated_at: new Date(),
        updated_by: ctx.user_id,
        row_version: sql`${leads.row_version} + 1`,
      })
      .where(eq(leads.id, leadId));

    await trx.insert(audit_log).values({
      id: crypto.randomUUID(),
      org_id: ctx.org_id,
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      ip: ctx.ip,
      entity_table: 'leads',
      entity_id: leadId,
      action: 'convert',
      before_json: { status: lead.status },
      after_json: { status: 'converted', customer_id: customer.id },
    });

    return { lead_id: leadId, customer };
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export async function leadDashboard(db: DbClient, ctx: RequestContext) {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const todayFollowups = await db
    .select({
      id: leads.id,
      name: leads.name,
      phone: leads.phone,
      status: leads.status,
      next_follow_up_at: leads.next_follow_up_at,
      notes: leads.notes,
    })
    .from(leads)
    .where(
      and(
        NOT_LOST_OR_CONVERTED(ctx.org_id),
        gte(leads.next_follow_up_at, startOfToday),
        lt(leads.next_follow_up_at, startOfTomorrow),
      ),
    )
    .orderBy(leads.next_follow_up_at);

  const overdueFollowups = await db
    .select({
      id: leads.id,
      name: leads.name,
      phone: leads.phone,
      status: leads.status,
      next_follow_up_at: leads.next_follow_up_at,
      notes: leads.notes,
    })
    .from(leads)
    .where(and(NOT_LOST_OR_CONVERTED(ctx.org_id), lt(leads.next_follow_up_at, startOfToday)))
    .orderBy(leads.next_follow_up_at);

  const [totalActive] = await db
    .select({ n: sql<number>`count(*)` })
    .from(leads)
    .where(NOT_LOST_OR_CONVERTED(ctx.org_id));

  const [newThisWeek] = await db
    .select({ n: sql<number>`count(*)` })
    .from(leads)
    .where(
      and(eq(leads.org_id, ctx.org_id), isNull(leads.deleted_at), gte(leads.created_at, weekAgo)),
    );

  const byStatus = await db
    .select({ status: leads.status, n: sql<number>`count(*)` })
    .from(leads)
    .where(and(eq(leads.org_id, ctx.org_id), isNull(leads.deleted_at)))
    .groupBy(leads.status);

  const bySource = await db
    .select({
      source_id: leads.source_id,
      source_name: lead_sources.name,
      n: sql<number>`count(*)`,
    })
    .from(leads)
    .leftJoin(lead_sources, eq(lead_sources.id, leads.source_id))
    .where(and(eq(leads.org_id, ctx.org_id), isNull(leads.deleted_at)))
    .groupBy(leads.source_id, lead_sources.name);

  const totalCreated = byStatus.reduce((acc, r) => acc + Number(r.n), 0);
  const convertedCount = Number(byStatus.find((r) => r.status === 'converted')?.n ?? 0);
  const conversionRate = totalCreated > 0 ? (convertedCount / totalCreated) * 100 : 0;

  return {
    today_followups: todayFollowups,
    overdue_followups: overdueFollowups,
    stats: {
      total_active: Number(totalActive?.n ?? 0),
      new_this_week: Number(newThisWeek?.n ?? 0),
      by_status: byStatus.map((r) => ({ status: r.status, count: Number(r.n) })),
      by_source: bySource.map((r) => ({
        source_id: r.source_id,
        source_name: r.source_name ?? 'Unspecified',
        count: Number(r.n),
      })),
      conversion_rate: conversionRate.toFixed(1),
    },
  };
}

// ─── Lead Tags ──────────────────────────────────────────────────────────────
export async function listLeadTags(db: DbClient, ctx: RequestContext) {
  return db
    .select({ id: lead_tags.id, name: lead_tags.name, color: lead_tags.color })
    .from(lead_tags)
    .where(eq(lead_tags.org_id, ctx.org_id))
    .orderBy(lead_tags.name);
}

export async function createLeadTag(
  db: DbClient,
  ctx: RequestContext,
  input: { id: string; name: string; color?: string | undefined },
) {
  const trimmed = input.name.trim();
  await db
    .insert(lead_tags)
    .values({
      id: input.id,
      org_id: ctx.org_id,
      name: trimmed,
      color: input.color ?? 'bg-gray-100 text-gray-800',
      created_by: ctx.user_id,
    })
    .onConflictDoNothing({ target: [lead_tags.org_id, lead_tags.name] });

  const [tag] = await db
    .select({ id: lead_tags.id, name: lead_tags.name, color: lead_tags.color })
    .from(lead_tags)
    .where(and(eq(lead_tags.org_id, ctx.org_id), eq(lead_tags.name, trimmed)));
  return tag;
}
