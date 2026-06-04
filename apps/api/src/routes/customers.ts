import type { DbClient } from '@counter/db';
import { CreateCustomerInputSchema, UpdateCustomerInputSchema } from '@counter/schemas';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ValidationError } from '../errors.js';
import { authHook } from '../middleware/auth.js';
import {
  createCustomer,
  getCustomerById,
  getCustomerLedger,
  getCustomerOutstanding,
  listCustomers,
  lookupCustomers,
  softDeleteCustomer,
  updateCustomer,
} from '../services/customer.service.js';

const LookupQuerySchema = z.object({
  q: z.string().min(2),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const ListQuerySchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

function getDb(app: FastifyInstance): DbClient {
  return (app as unknown as { db: DbClient }).db;
}

function meta(requestId: string) {
  return { request_id: requestId, server_time: new Date().toISOString() };
}

export async function customerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authHook);

  app.get('/lookup', async (request, reply) => {
    const { q, limit } = LookupQuerySchema.parse(request.query);
    const data = await lookupCustomers(getDb(app), request.ctx, q, limit);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/', async (request, reply) => {
    const query = ListQuerySchema.parse(request.query);
    const result = await listCustomers(getDb(app), request.ctx, query);
    return reply.send({
      ok: true,
      data: result.data,
      page: result.page,
      meta: meta(request.ctx.request_id),
    });
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = await getCustomerById(getDb(app), request.ctx, id);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/:id/outstanding', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = await getCustomerOutstanding(getDb(app), request.ctx, id);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/:id/ledger', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = await getCustomerLedger(getDb(app), request.ctx, id);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.post('/', async (request, reply) => {
    const body = CreateCustomerInputSchema.parse(request.body);
    const data = await createCustomer(getDb(app), request.ctx, body);
    return reply.status(201).send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const ifMatch = request.headers['if-match'];
    if (!ifMatch) {
      throw new ValidationError('If-Match header (row_version) is required for updates');
    }
    const expectedVersion = Number(String(ifMatch).replace(/"/g, ''));
    if (Number.isNaN(expectedVersion)) {
      throw new ValidationError('If-Match must be a numeric row_version');
    }
    const body = UpdateCustomerInputSchema.parse(request.body);
    const data = await updateCustomer(getDb(app), request.ctx, id, body, expectedVersion);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await softDeleteCustomer(getDb(app), request.ctx, id);
    return reply.send({ ok: true, data: null, meta: meta(request.ctx.request_id) });
  });
}
