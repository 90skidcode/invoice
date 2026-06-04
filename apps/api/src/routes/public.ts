import type { FastifyInstance } from 'fastify';
import type { DbClient } from '@counter/db';
import { verifyInvoiceByHash } from '../services/invoice.service.js';

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
}
