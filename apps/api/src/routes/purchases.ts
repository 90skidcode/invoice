import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreatePurchaseInvoiceInputSchema } from '@counter/schemas';
import type { DbClient } from '@counter/db';
import { authHook } from '../middleware/auth.js';
import { createPurchaseInvoice, listPurchases } from '../services/purchase.service.js';

const ListQuerySchema = z.object({
  vendor_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

function getDb(app: FastifyInstance): DbClient {
  return (app as unknown as { db: DbClient }).db;
}
function meta(requestId: string) {
  return { request_id: requestId, server_time: new Date().toISOString() };
}

export async function purchaseRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authHook);

  app.get('/', async (request, reply) => {
    const query = ListQuerySchema.parse(request.query);
    const result = await listPurchases(getDb(app), request.ctx, query);
    return reply.send({
      ok: true,
      data: result.data,
      page: result.page,
      meta: meta(request.ctx.request_id),
    });
  });

  app.post('/', async (request, reply) => {
    const body = CreatePurchaseInvoiceInputSchema.parse(request.body);
    const data = await createPurchaseInvoice(getDb(app), request.ctx, body);
    return reply.status(201).send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });
}
