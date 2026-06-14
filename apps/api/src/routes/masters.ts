import type { DbClient } from '@counter/db';
import { bank_accounts, brands, categories, locations, tax_rates, units } from '@counter/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authHook } from '../middleware/auth.js';

function getDb(app: FastifyInstance): DbClient {
  return (app as unknown as { db: DbClient }).db;
}

function meta(requestId: string) {
  return { request_id: requestId, server_time: new Date().toISOString() };
}

const CategoryBodySchema = z.object({
  name: z.string().min(1).max(80),
  default_hsn_code: z.string().max(8).nullable().optional(),
  default_tax_rate_id: z.string().uuid().nullable().optional(),
});

/** Master data routes — lookups + category/unit CRUD. */
export async function masterRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authHook);

  app.get('/units', async (request, reply) => {
    const rows = await getDb(app)
      .select({ id: units.id, name: units.name, abbreviation: units.abbreviation })
      .from(units)
      .where(and(eq(units.org_id, request.ctx.org_id), isNull(units.deleted_at)));
    return reply.send({ ok: true, data: rows, meta: meta(request.ctx.request_id) });
  });

  app.get('/tax-rates', async (request, reply) => {
    const rows = await getDb(app)
      .select({
        id: tax_rates.id,
        name: tax_rates.name,
        total_rate: tax_rates.total_rate,
        cgst_rate: tax_rates.cgst_rate,
        sgst_rate: tax_rates.sgst_rate,
        igst_rate: tax_rates.igst_rate,
      })
      .from(tax_rates)
      .where(and(eq(tax_rates.org_id, request.ctx.org_id), eq(tax_rates.is_active, true)));
    return reply.send({ ok: true, data: rows, meta: meta(request.ctx.request_id) });
  });

  // ── Categories ────────────────────────────────────────────────────────────
  app.get('/categories', async (request, reply) => {
    const rows = await getDb(app)
      .select({
        id: categories.id,
        name: categories.name,
        default_hsn_code: categories.default_hsn_code,
        default_tax_rate_id: categories.default_tax_rate_id,
        is_active: categories.is_active,
      })
      .from(categories)
      .where(and(eq(categories.org_id, request.ctx.org_id), isNull(categories.deleted_at)));
    return reply.send({ ok: true, data: rows, meta: meta(request.ctx.request_id) });
  });

  app.post('/categories', async (request, reply) => {
    const body = CategoryBodySchema.parse(request.body);
    const db = getDb(app);
    const id = crypto.randomUUID();
    await db.insert(categories).values({
      id,
      org_id: request.ctx.org_id,
      name: body.name,
      default_hsn_code: body.default_hsn_code ?? null,
      default_tax_rate_id: body.default_tax_rate_id ?? null,
    });
    return reply.status(201).send({ ok: true, data: { id, name: body.name }, meta: meta(request.ctx.request_id) });
  });

  app.patch('/categories/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = CategoryBodySchema.partial().parse(request.body);
    const db = getDb(app);
    await db.update(categories)
      .set({ ...body, row_version: sql`row_version + 1` })
      .where(and(eq(categories.id, id), eq(categories.org_id, request.ctx.org_id), isNull(categories.deleted_at)));
    return reply.send({ ok: true, data: { id }, meta: meta(request.ctx.request_id) });
  });

  app.delete('/categories/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb(app);
    await db.update(categories)
      .set({ deleted_at: new Date() })
      .where(and(eq(categories.id, id), eq(categories.org_id, request.ctx.org_id)));
    return reply.send({ ok: true, data: null, meta: meta(request.ctx.request_id) });
  });

  app.get('/brands', async (request, reply) => {
    const rows = await getDb(app)
      .select({ id: brands.id, name: brands.name })
      .from(brands)
      .where(and(eq(brands.org_id, request.ctx.org_id), isNull(brands.deleted_at)));
    return reply.send({ ok: true, data: rows, meta: meta(request.ctx.request_id) });
  });

  app.get('/locations', async (request, reply) => {
    const rows = await getDb(app)
      .select({
        id: locations.id,
        name: locations.name,
        is_default: locations.is_default,
      })
      .from(locations)
      .where(and(eq(locations.org_id, request.ctx.org_id), isNull(locations.deleted_at)));
    return reply.send({ ok: true, data: rows, meta: meta(request.ctx.request_id) });
  });

  app.get('/bank-accounts', async (request, reply) => {
    const rows = await getDb(app)
      .select({
        id: bank_accounts.id,
        name: bank_accounts.name,
        type: bank_accounts.type,
        current_balance: bank_accounts.current_balance,
        is_default: bank_accounts.is_default,
      })
      .from(bank_accounts)
      .where(and(eq(bank_accounts.org_id, request.ctx.org_id), isNull(bank_accounts.deleted_at)));
    return reply.send({ ok: true, data: rows, meta: meta(request.ctx.request_id) });
  });
}
