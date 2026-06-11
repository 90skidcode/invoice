import type { DbClient } from '@counter/db';
import { CreateBomInputSchema, UpdateBomInputSchema } from '@counter/schemas';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authHook } from '../middleware/auth.js';
import { createBom, deleteBom, getBomById, listBoms, updateBom } from '../services/bom.service.js';

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

function getDb(app: FastifyInstance): DbClient {
  return (app as unknown as { db: DbClient }).db;
}
function meta(requestId: string) {
  return { request_id: requestId, server_time: new Date().toISOString() };
}

export async function bomRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authHook);

  app.get('/', async (request, reply) => {
    const query = ListQuerySchema.parse(request.query);
    const result = await listBoms(getDb(app), request.ctx, query);
    return reply.send({
      ok: true,
      data: result.data,
      page: result.page,
      meta: meta(request.ctx.request_id),
    });
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = await getBomById(getDb(app), request.ctx, id);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.post('/', async (request, reply) => {
    const body = CreateBomInputSchema.parse(request.body);
    const data = await createBom(getDb(app), request.ctx, body);
    return reply.status(201).send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = UpdateBomInputSchema.parse(request.body);
    const data = await updateBom(getDb(app), request.ctx, id, body);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = await deleteBom(getDb(app), request.ctx, id);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });
}
