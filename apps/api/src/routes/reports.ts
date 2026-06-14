import type { DbClient } from '@counter/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authHook } from '../middleware/auth.js';
import {
  apAging,
  categoryWiseSales,
  customerLedger,
  dayBook,
  expiryReport,
  gstr1,
  gstr3bSummary,
  gstrPurchase,
  itemMargin,
  locationWiseStock,
  lowStock,
  materialConsumption,
  outstandingInvoices,
  payables,
  paymentCollection,
  productionByItem,
  productionSummary,
  profitAndLoss,
  purchaseSummary,
  purchasesByItem,
  purchasesByVendor,
  receivables,
  salesByItem,
  salesByReferral,
  salesDiscounts,
  salesReturns,
  salesSummary,
  salespersonPerformance,
  soapsByCustomer,
  stockLedgerReport,
  stockValuation,
  topCustomers,
  vendorLedger,
  voidedBills,
} from '../services/report.service.js';

const RangeSchema = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const PeriodSchema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) });
const ExpirySchema = z.object({
  days_ahead: z.coerce.number().int().min(1).max(365).optional().default(90),
});
const LedgerSchema = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  item_id: z.string().uuid().optional(),
});
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

  app.get('/production/summary', async (request, reply) => {
    const { date_from, date_to } = RangeSchema.parse(request.query);
    const data = await productionSummary(getDb(app), request.ctx, date_from, date_to);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/production/by-item', async (request, reply) => {
    const { date_from, date_to } = RangeSchema.parse(request.query);
    const data = await productionByItem(getDb(app), request.ctx, date_from, date_to);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/production/consumption', async (request, reply) => {
    const { date_from, date_to } = RangeSchema.parse(request.query);
    const data = await materialConsumption(getDb(app), request.ctx, date_from, date_to);
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

  // ── Phase 1 additions ──────────────────────────────────────────────────────

  app.get('/gst/purchase', async (request, reply) => {
    const { period } = PeriodSchema.parse(request.query);
    const data = await gstrPurchase(getDb(app), request.ctx, period);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/sales/voided', async (request, reply) => {
    const { date_from, date_to } = RangeSchema.parse(request.query);
    const data = await voidedBills(getDb(app), request.ctx, date_from, date_to);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/sales/returns', async (request, reply) => {
    const { date_from, date_to } = RangeSchema.parse(request.query);
    const data = await salesReturns(getDb(app), request.ctx, date_from, date_to);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/sales/discounts', async (request, reply) => {
    const { date_from, date_to } = RangeSchema.parse(request.query);
    const data = await salesDiscounts(getDb(app), request.ctx, date_from, date_to);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/sales/top-customers', async (request, reply) => {
    const { date_from, date_to } = RangeSchema.parse(request.query);
    const data = await topCustomers(getDb(app), request.ctx, date_from, date_to);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/financial/payment-collection', async (request, reply) => {
    const { date_from, date_to } = RangeSchema.parse(request.query);
    const data = await paymentCollection(getDb(app), request.ctx, date_from, date_to);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/financial/customer-ledger', async (request, reply) => {
    const { date_from, date_to } = RangeSchema.parse(request.query);
    const data = await customerLedger(getDb(app), request.ctx, date_from, date_to);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/stock/expiry', async (request, reply) => {
    const { days_ahead } = ExpirySchema.parse(request.query);
    const data = await expiryReport(getDb(app), request.ctx, days_ahead);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/stock/ledger', async (request, reply) => {
    const { date_from, date_to, item_id } = LedgerSchema.parse(request.query);
    const data = await stockLedgerReport(getDb(app), request.ctx, date_from, date_to, item_id);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  // ── Phase 2 additions ──────────────────────────────────────────────────────

  app.get('/financial/day-book', async (request, reply) => {
    const { date_from, date_to } = RangeSchema.parse(request.query);
    const data = await dayBook(getDb(app), request.ctx, date_from, date_to);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/sales/margin', async (request, reply) => {
    const { date_from, date_to } = RangeSchema.parse(request.query);
    const data = await itemMargin(getDb(app), request.ctx, date_from, date_to);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/purchases/vendor-ledger', async (request, reply) => {
    const { date_from, date_to } = RangeSchema.parse(request.query);
    const data = await vendorLedger(getDb(app), request.ctx, date_from, date_to);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/financial/ap-aging', async (request, reply) => {
    const { as_of } = AsOfSchema.parse(request.query);
    const asOf = as_of ?? new Date().toISOString().slice(0, 10);
    const data = await apAging(getDb(app), request.ctx, asOf);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/gst/gstr3b', async (request, reply) => {
    const { period } = PeriodSchema.parse(request.query);
    const data = await gstr3bSummary(getDb(app), request.ctx, period);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  // ── Phase 3 additions ──────────────────────────────────────────────────────

  app.get('/sales/salesperson', async (request, reply) => {
    const { date_from, date_to } = RangeSchema.parse(request.query);
    const data = await salespersonPerformance(getDb(app), request.ctx, date_from, date_to);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/sales/by-category', async (request, reply) => {
    const { date_from, date_to } = RangeSchema.parse(request.query);
    const data = await categoryWiseSales(getDb(app), request.ctx, date_from, date_to);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/stock/location', async (request, reply) => {
    const data = await locationWiseStock(getDb(app), request.ctx);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/financial/outstanding', async (request, reply) => {
    const { as_of } = AsOfSchema.parse(request.query);
    const asOf = as_of ?? new Date().toISOString().slice(0, 10);
    const data = await outstandingInvoices(getDb(app), request.ctx, asOf);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/financial/pl', async (request, reply) => {
    const { date_from, date_to } = RangeSchema.parse(request.query);
    const data = await profitAndLoss(getDb(app), request.ctx, date_from, date_to);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });
}
