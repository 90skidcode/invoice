import type { DbClient } from '@counter/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { type Paper, renderInvoiceHtmlByHash } from '../services/invoice-render.service.js';
import { verifyInvoiceByHash } from '../services/invoice.service.js';

const PrintQuerySchema = z.object({
  paper: z.enum(['a4', 'thermal80', 'thermal58']).default('a4'),
});

function getDb(app: FastifyInstance): DbClient {
  return (app as unknown as { db: DbClient }).db;
}

/**
 * Public, unauthenticated endpoints (invoice QR verification). NO authHook.
 * Returns minimal data only — proves an invoice exists and is unmodified.
 */
export async function publicRoutes(app: FastifyInstance): Promise<void> {
  app.get('/invoices/:hash', async (request, reply) => {
    const { hash } = request.params as { hash: string };
    const result = await verifyInvoiceByHash(getDb(app), hash);
    return reply.send({ ok: true, data: result, meta: { server_time: new Date().toISOString() } });
  });

  // GET /public/invoices/:hash/print?paper=a4|thermal80|thermal58 — standalone public HTML
  app.get('/invoices/:hash/print', async (request, reply) => {
    const { hash } = request.params as { hash: string };
    const { paper } = PrintQuerySchema.parse(request.query);
    const host = request.headers['host'] ?? 'localhost:3001';
    const protocol = (request.headers['x-forwarded-proto'] as string | undefined) || 'http';
    const publicBaseUrl = process.env['PUBLIC_BASE_URL'] ?? `${protocol}://${host}`;
    const html = await renderInvoiceHtmlByHash(getDb(app), hash, paper as Paper, publicBaseUrl);
    return reply.type('text/html; charset=utf-8').send(html);
  });
}
