import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateInvoiceInputSchema, VoidInvoiceInputSchema } from '@counter/schemas';
import type { DbClient } from '@counter/db';
import { authHook } from '../middleware/auth.js';
import {
  createInvoice,
  voidInvoice,
  getInvoiceById,
  listInvoices,
} from '../services/invoice.service.js';
import { renderInvoiceHtml, type Paper } from '../services/invoice-render.service.js';

const ListQuerySchema = z.object({
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  customer_id: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

const PrintQuerySchema = z.object({
  paper: z.enum(['a4', 'thermal80', 'thermal58']).default('a4'),
});

function getDb(app: FastifyInstance): DbClient {
  return (app as unknown as { db: DbClient }).db;
}

function meta(requestId: string) {
  return { request_id: requestId, server_time: new Date().toISOString() };
}

export async function invoiceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authHook);

  // GET /v1/invoices — list
  app.get('/', async (request, reply) => {
    const query = ListQuerySchema.parse(request.query);
    const result = await listInvoices(getDb(app), request.ctx, query);
    return reply.send({
      ok: true,
      data: result.data,
      page: result.page,
      meta: meta(request.ctx.request_id),
    });
  });

  // GET /v1/invoices/:id — full invoice
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = await getInvoiceById(getDb(app), request.ctx, id);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  // GET /v1/invoices/:id/print?paper=a4|thermal80|thermal58 — standalone HTML
  app.get('/:id/print', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { paper } = PrintQuerySchema.parse(request.query);
    const publicBaseUrl = process.env['PUBLIC_BASE_URL'] ?? 'https://api.counter.app';
    const html = await renderInvoiceHtml(
      getDb(app),
      request.ctx,
      id,
      paper as Paper,
      publicBaseUrl,
    );
    return reply.type('text/html; charset=utf-8').send(html);
  });

  // POST /v1/invoices
  app.post('/', async (request, reply) => {
    const body = CreateInvoiceInputSchema.parse(request.body);
    const result = await createInvoice(getDb(app), request.ctx, body);
    return reply
      .status(201)
      .send({ ok: true, data: result, meta: meta(request.ctx.request_id) });
  });

  // POST /v1/invoices/:id/void
  app.post('/:id/void', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = VoidInvoiceInputSchema.parse(request.body);
    const result = await voidInvoice(getDb(app), request.ctx, id, body.reason);
    return reply.send({ ok: true, data: result, meta: meta(request.ctx.request_id) });
  });
}
