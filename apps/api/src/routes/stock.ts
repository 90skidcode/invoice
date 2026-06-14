import type { DbClient } from '@counter/db';
import { CreateStockAdjustmentInputSchema, CreateStockTransferInputSchema } from '@counter/schemas';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authHook } from '../middleware/auth.js';
import {
  createStockAdjustment,
  createStockTransfer,
  getStockLedger,
  listAdjustments,
  listItemsWithStock,
  listTransfers,
} from '../services/stock.service.js';

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

const LedgerQuerySchema = z.object({
  item_id: z.string().uuid(),
  location_id: z.string().uuid().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

function getDb(app: FastifyInstance): DbClient {
  return (app as unknown as { db: DbClient }).db;
}
function meta(requestId: string) {
  return { request_id: requestId, server_time: new Date().toISOString() };
}

export async function stockAdjustmentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authHook);

  app.get('/', async (request, reply) => {
    const query = ListQuerySchema.parse(request.query);
    const result = await listAdjustments(getDb(app), request.ctx, query);
    return reply.send({
      ok: true,
      data: result.data,
      page: result.page,
      meta: meta(request.ctx.request_id),
    });
  });

  app.post('/', async (request, reply) => {
    const body = CreateStockAdjustmentInputSchema.parse(request.body);
    const data = await createStockAdjustment(getDb(app), request.ctx, body);
    return reply.status(201).send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });
}

export async function stockTransferRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authHook);

  app.get('/', async (request, reply) => {
    const query = ListQuerySchema.parse(request.query);
    const result = await listTransfers(getDb(app), request.ctx, query);
    return reply.send({
      ok: true,
      data: result.data,
      page: result.page,
      meta: meta(request.ctx.request_id),
    });
  });

  app.post('/', async (request, reply) => {
    const body = CreateStockTransferInputSchema.parse(request.body);
    const data = await createStockTransfer(getDb(app), request.ctx, body);
    return reply.status(201).send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });
}

export async function stockLedgerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authHook);

  app.get('/items', async (request, reply) => {
    const data = await listItemsWithStock(getDb(app), request.ctx);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/', async (request, reply) => {
    const query = LedgerQuerySchema.parse(request.query);
    const data = await getStockLedger(getDb(app), request.ctx, query);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });
}
