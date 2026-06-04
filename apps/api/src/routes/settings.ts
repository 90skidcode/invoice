import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DbClient } from '@counter/db';
import { authHook } from '../middleware/auth.js';
import { ValidationError } from '../errors.js';
import {
  createPeriodLock,
  unlockPeriod,
  listPeriodLocks,
  createTaxRate,
  updateTaxRate,
  expireTaxRate,
  listSeries,
  createSeries,
  updateSeries,
  getOrgSettings,
  updateOrgSettings,
} from '../services/settings.service.js';

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function getDb(app: FastifyInstance): DbClient {
  return (app as unknown as { db: DbClient }).db;
}
function meta(requestId: string) {
  return { request_id: requestId, server_time: new Date().toISOString() };
}
function ifMatchVersion(request: { headers: Record<string, unknown> }): number {
  const h = request.headers['if-match'];
  if (!h) throw new ValidationError('If-Match header (row_version) is required');
  const v = Number(String(h).replace(/"/g, ''));
  if (Number.isNaN(v)) throw new ValidationError('If-Match must be numeric');
  return v;
}

// ─── Period locks, tax rates, org settings ───────────────────────────────────
export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authHook);

  app.get('/', async (request, reply) => {
    const data = await getOrgSettings(getDb(app), request.ctx);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.patch('/', async (request, reply) => {
    const body = z
      .object({
        name: z.string().optional(),
        legal_name: z.string().optional(),
        gstin: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        upi_id: z.string().optional(),
        logo_url: z.string().nullable().optional(),
        settings: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(request.body);
    const data = await updateOrgSettings(getDb(app), request.ctx, body);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/period-locks', async (request, reply) => {
    const data = await listPeriodLocks(getDb(app), request.ctx);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.post('/period-lock', async (request, reply) => {
    const body = z.object({ lock_through_date: IsoDate, reason: z.string().max(255).nullable().optional() }).parse(request.body);
    const data = await createPeriodLock(getDb(app), request.ctx, body.lock_through_date, body.reason ?? null);
    return reply.status(201).send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.post('/period-unlock', async (request, reply) => {
    const body = z.object({ lock_id: z.string().uuid(), reason: z.string().min(1).max(255) }).parse(request.body);
    const data = await unlockPeriod(getDb(app), request.ctx, body.lock_id, body.reason);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });
}

// Tax-rate mutations (read is in masters @ /v1/tax-rates GET).
export async function taxRateMutationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authHook);

  app.post('/', async (request, reply) => {
    const body = z
      .object({ name: z.string().min(1), total_rate: z.string(), cess_rate: z.string().optional(), effective_from: IsoDate })
      .parse(request.body);
    const data = await createTaxRate(getDb(app), request.ctx, body);
    return reply.status(201).send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const version = ifMatchVersion(request as never);
    const body = z
      .object({ name: z.string().optional(), total_rate: z.string().optional(), cess_rate: z.string().optional(), is_active: z.boolean().optional() })
      .parse(request.body);
    const data = await updateTaxRate(getDb(app), request.ctx, id, version, body);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.post('/:id/expire', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({ effective_to: IsoDate }).parse(request.body);
    const data = await expireTaxRate(getDb(app), request.ctx, id, body.effective_to);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });
}

export async function invoiceSeriesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authHook);

  app.get('/', async (request, reply) => {
    const data = await listSeries(getDb(app), request.ctx);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.post('/', async (request, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        document_type: z.string().default('invoice'),
        prefix: z.string().optional(),
        suffix: z.string().optional(),
        number_padding: z.number().int().min(1).max(10).optional(),
        starting_number: z.number().int().min(1).optional(),
        reset_on_fy: z.boolean().optional(),
        is_default: z.boolean().optional(),
      })
      .parse(request.body);
    const data = await createSeries(getDb(app), request.ctx, body);
    return reply.status(201).send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({ name: z.string().optional(), prefix: z.string().optional(), suffix: z.string().optional(), is_active: z.boolean().optional(), is_default: z.boolean().optional() })
      .parse(request.body);
    const data = await updateSeries(getDb(app), request.ctx, id, body);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });
}
