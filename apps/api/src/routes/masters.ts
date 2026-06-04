import type { DbClient } from '@counter/db';
import { bank_accounts, brands, categories, locations, tax_rates, units } from '@counter/db';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { authHook } from '../middleware/auth.js';

function getDb(app: FastifyInstance): DbClient {
  return (app as unknown as { db: DbClient }).db;
}

function meta(requestId: string) {
  return { request_id: requestId, server_time: new Date().toISOString() };
}

/** Read-only master lookups used to populate form selects. */
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

  app.get('/categories', async (request, reply) => {
    const rows = await getDb(app)
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(and(eq(categories.org_id, request.ctx.org_id), isNull(categories.deleted_at)));
    return reply.send({ ok: true, data: rows, meta: meta(request.ctx.request_id) });
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
