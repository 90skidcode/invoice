import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreatePaymentInputSchema, VoidPaymentInputSchema } from '@counter/schemas';
import type { DbClient } from '@counter/db';
import { authHook } from '../middleware/auth.js';
import { createPayment, voidPayment, listPayments } from '../services/payment.service.js';

const ListQuerySchema = z.object({
  direction: z.string().optional(),
  party_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

function getDb(app: FastifyInstance): DbClient {
  return (app as unknown as { db: DbClient }).db;
}

function meta(requestId: string) {
  return { request_id: requestId, server_time: new Date().toISOString() };
}

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authHook);

  app.get('/', async (request, reply) => {
    const query = ListQuerySchema.parse(request.query);
    const result = await listPayments(getDb(app), request.ctx, query);
    return reply.send({
      ok: true,
      data: result.data,
      page: result.page,
      meta: meta(request.ctx.request_id),
    });
  });

  app.post('/', async (request, reply) => {
    const body = CreatePaymentInputSchema.parse(request.body);
    const data = await createPayment(getDb(app), request.ctx, body);
    return reply.status(201).send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.post('/:id/void', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = VoidPaymentInputSchema.parse(request.body);
    const data = await voidPayment(getDb(app), request.ctx, id, body.reason);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });
}
