import type { DbClient } from '@counter/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authHook } from '../middleware/auth.js';
import {
  gstr1,
  lowStock,
  payables,
  purchaseSummary,
  purchasesByItem,
  purchasesByVendor,
  receivables,
  salesByItem,
  salesByReferral,
  salesSummary,
  soapsByCustomer,
  stockValuation,
} from '../services/report.service.js';

const RangeSchema = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const PeriodSchema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) });
const AsOfSchema = z.object({
  as_of: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

function getDb(app: FastifyInstance): DbClient {
  return (app as unknown as { db: DbClient }).db;
}
function meta(requestId: string) {
  return { request_id: requestId, server_time: new Date().toISOString() };
}

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authHook);

  app.get('/sales/summary', async (request, reply) => {
    const { date_from, date_to } = RangeSchema.parse(request.query);
    const data = await salesSummary(getDb(app), request.ctx, date_from, date_to);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/sales/by-item', async (request, reply) => {
    const { date_from, date_to } = RangeSchema.parse(request.query);
    const data = await salesByItem(getDb(app), request.ctx, date_from, date_to);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/sales/soaps-by-customer', async (request, reply) => {
    const { date_from, date_to } = RangeSchema.parse(request.query);
    const data = await soapsByCustomer(getDb(app), request.ctx, date_from, date_to);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/sales/by-referral', async (request, reply) => {
    const { date_from, date_to } = RangeSchema.parse(request.query);
    const data = await salesByReferral(getDb(app), request.ctx, date_from, date_to);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/purchases/summary', async (request, reply) => {
    const { date_from, date_to } = RangeSchema.parse(request.query);
    const data = await purchaseSummary(getDb(app), request.ctx, date_from, date_to);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/purchases/by-vendor', async (request, reply) => {
    const { date_from, date_to } = RangeSchema.parse(request.query);
    const data = await purchasesByVendor(getDb(app), request.ctx, date_from, date_to);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/purchases/by-item', async (request, reply) => {
    const { date_from, date_to } = RangeSchema.parse(request.query);
    const data = await purchasesByItem(getDb(app), request.ctx, date_from, date_to);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/gst/gstr1', async (request, reply) => {
    const { period } = PeriodSchema.parse(request.query);
    const data = await gstr1(getDb(app), request.ctx, period);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/stock/valuation', async (request, reply) => {
    const data = await stockValuation(getDb(app), request.ctx);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/stock/low', async (request, reply) => {
    const data = await lowStock(getDb(app), request.ctx);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/financial/receivables', async (request, reply) => {
    const { as_of } = AsOfSchema.parse(request.query);
    const asOf = as_of ?? new Date().toISOString().slice(0, 10);
    const data = await receivables(getDb(app), request.ctx, asOf);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/financial/payables', async (request, reply) => {
    const data = await payables(getDb(app), request.ctx);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });
}
