import type { DbClient } from '@counter/db';
import { CreateItemInputSchema, UpdateItemInputSchema } from '@counter/schemas';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ValidationError } from '../errors.js';
import { authHook } from '../middleware/auth.js';
import {
  createItem,
  getItemById,
  getItemLookup,
  listItems,
  softDeleteItem,
  updateItem,
} from '../services/item.service.js';

const LookupQuerySchema = z.object({
  q: z.string().min(2),
  limit: z.coerce.number().int().min(1).max(50).default(20),
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

export async function itemRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authHook);

  // GET /v1/items/lookup
  app.get('/lookup', async (request, reply) => {
    const { q, limit } = LookupQuerySchema.parse(request.query);
    const results = await getItemLookup(getDb(app), request.ctx, q, limit);
    return reply.send({ ok: true, data: results, meta: meta(request.ctx.request_id) });
  });

  // GET /v1/items — paginated list
  app.get('/', async (request, reply) => {
    const query = ListQuerySchema.parse(request.query);
    const result = await listItems(getDb(app), request.ctx, query);
    return reply.send({
      ok: true,
      data: result.data,
      page: result.page,
      meta: meta(request.ctx.request_id),
    });
  });

  // GET /v1/items/:id
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await getItemById(getDb(app), request.ctx, id);
    return reply.send({ ok: true, data: item, meta: meta(request.ctx.request_id) });
  });

  // POST /v1/items
  app.post('/', async (request, reply) => {
    const body = CreateItemInputSchema.parse(request.body);
    const result = await createItem(getDb(app), request.ctx, body);
    return reply.status(201).send({ ok: true, data: result, meta: meta(request.ctx.request_id) });
  });

  // PATCH /v1/items/:id
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
    const body = UpdateItemInputSchema.parse(request.body);
    const data = await updateItem(getDb(app), request.ctx, id, body, expectedVersion);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  // DELETE /v1/items/:id
  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await softDeleteItem(getDb(app), request.ctx, id);
    return reply.send({ ok: true, data: null, meta: meta(request.ctx.request_id) });
  });
}
