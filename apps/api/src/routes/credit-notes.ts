import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateCreditNoteInputSchema } from '@counter/schemas';
import type { DbClient } from '@counter/db';
import { authHook } from '../middleware/auth.js';
import {
  createCreditNote,
  listCreditNotes,
  getCreditNoteById,
} from '../services/credit-note.service.js';

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

export async function creditNoteRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authHook);

  app.get('/', async (request, reply) => {
    const query = ListQuerySchema.parse(request.query);
    const result = await listCreditNotes(getDb(app), request.ctx, query);
    return reply.send({ ok: true, data: result.data, page: result.page, meta: meta(request.ctx.request_id) });
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = await getCreditNoteById(getDb(app), request.ctx, id);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.post('/', async (request, reply) => {
    const body = CreateCreditNoteInputSchema.parse(request.body);
    const data = await createCreditNote(getDb(app), request.ctx, body);
    return reply.status(201).send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });
}
