import type { DbClient } from '@counter/db';
import { CreateProductionOrderInputSchema } from '@counter/schemas';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authHook } from '../middleware/auth.js';
import {
  cancelProductionOrder,
  createProductionOrder,
  getProductionById,
  listProductions,
  previewProduction,
} from '../services/production.service.js';

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

const PreviewQuerySchema = z.object({
  finished_item_id: z.string(),
  qty: z.string(),
  location_id: z.string().optional(),
});

function getDb(app: FastifyInstance): DbClient {
  return (app as unknown as { db: DbClient }).db;
}
function meta(requestId: string) {
  return { request_id: requestId, server_time: new Date().toISOString() };
}

export async function productionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authHook);

  app.get('/', async (request, reply) => {
    const query = ListQuerySchema.parse(request.query);
    const result = await listProductions(getDb(app), request.ctx, query);
    return reply.send({
      ok: true,
      data: result.data,
      page: result.page,
      meta: meta(request.ctx.request_id),
    });
  });

  app.get('/preview', async (request, reply) => {
    const { finished_item_id, qty, location_id } = PreviewQuerySchema.parse(request.query);
    const data = await previewProduction(
      getDb(app),
      request.ctx,
      finished_item_id,
      qty,
      location_id ?? null,
    );
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = await getProductionById(getDb(app), request.ctx, id);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.post('/', async (request, reply) => {
    const body = CreateProductionOrderInputSchema.parse(request.body);
    const data = await createProductionOrder(getDb(app), request.ctx, body);
    return reply.status(201).send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.post('/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = await cancelProductionOrder(getDb(app), request.ctx, id);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });
}
