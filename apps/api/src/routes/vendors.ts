import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateVendorInputSchema, UpdateVendorInputSchema } from '@counter/schemas';
import type { DbClient } from '@counter/db';
import { authHook } from '../middleware/auth.js';
import { ValidationError } from '../errors.js';
import {
  createVendor,
  updateVendor,
  listVendors,
  lookupVendors,
  getVendorById,
  softDeleteVendor,
} from '../services/vendor.service.js';

const LookupQuerySchema = z.object({
  q: z.string().min(2),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
const ListQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

function getDb(app: FastifyInstance): DbClient {
  return (app as unknown as { db: DbClient }).db;
}
function meta(requestId: string) {
  return { request_id: requestId, server_time: new Date().toISOString() };
}

export async function vendorRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authHook);

  app.get('/lookup', async (request, reply) => {
    const { q, limit } = LookupQuerySchema.parse(request.query);
    const data = await lookupVendors(getDb(app), request.ctx, q, limit);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/', async (request, reply) => {
    const query = ListQuerySchema.parse(request.query);
    const result = await listVendors(getDb(app), request.ctx, query);
    return reply.send({
      ok: true,
      data: result.data,
      page: result.page,
      meta: meta(request.ctx.request_id),
    });
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = await getVendorById(getDb(app), request.ctx, id);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.post('/', async (request, reply) => {
    const body = CreateVendorInputSchema.parse(request.body);
    const data = await createVendor(getDb(app), request.ctx, body);
    return reply.status(201).send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const ifMatch = request.headers['if-match'];
    if (!ifMatch) throw new ValidationError('If-Match header (row_version) is required for updates');
    const expectedVersion = Number(String(ifMatch).replace(/"/g, ''));
    if (Number.isNaN(expectedVersion)) throw new ValidationError('If-Match must be a numeric row_version');
    const body = UpdateVendorInputSchema.parse(request.body);
    const data = await updateVendor(getDb(app), request.ctx, id, body, expectedVersion);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await softDeleteVendor(getDb(app), request.ctx, id);
    return reply.send({ ok: true, data: null, meta: meta(request.ctx.request_id) });
  });
}
