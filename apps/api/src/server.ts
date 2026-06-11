import { createDbClient } from '@counter/db';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { loadJwtKeys } from './keys.js';
import { registerErrorHandler } from './middleware/error-handler.js';
import { registerIdempotency } from './middleware/idempotency.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { bomRoutes } from './routes/bom.js';
import { creditNoteRoutes } from './routes/credit-notes.js';
import { customerRoutes } from './routes/customers.js';
import { healthRoutes } from './routes/health.js';
import { invoiceRoutes } from './routes/invoices.js';
import { itemRoutes } from './routes/items.js';
import { masterRoutes } from './routes/masters.js';
import { paymentRoutes } from './routes/payments.js';
import { posRoutes } from './routes/pos.js';
import { productionRoutes } from './routes/production.js';
import { publicRoutes } from './routes/public.js';
import { purchaseRoutes } from './routes/purchases.js';
import { reportRoutes } from './routes/reports.js';
import { invoiceSeriesRoutes, settingsRoutes, taxRateMutationRoutes } from './routes/settings.js';
import { stockAdjustmentRoutes, stockLedgerRoutes, stockTransferRoutes } from './routes/stock.js';
import { userRoutes } from './routes/users.js';
import { vendorRoutes } from './routes/vendors.js';

const PORT = Number(process.env['PORT'] ?? 3001);
const HOST = process.env['HOST'] ?? '0.0.0.0';
const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgresql://localhost:5432/counter_dev';

async function buildServer() {
  const isDev = process.env['NODE_ENV'] === 'development';
  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
      ...(isDev ? { transport: { target: 'pino-pretty' } } : {}),
    },
  });

  // DB client attached to app instance
  const db = createDbClient(DATABASE_URL);
  (app as unknown as { db: typeof db }).db = db;

  // Plugins
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false,
  });

  await app.register(fastifyCors, {
    origin: process.env['CORS_ORIGIN'] ?? '*',
  });

  await app.register(fastifyRateLimit, {
    max: 600,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      const userId = (request as unknown as { ctx?: { user_id?: string } }).ctx?.user_id;
      return userId ?? request.ip;
    },
  });

  const jwtKeys = loadJwtKeys(app.log);
  await app.register(fastifyJwt, {
    secret: { private: jwtKeys.private, public: jwtKeys.public },
    sign: { algorithm: 'RS256' },
    verify: { algorithms: ['RS256'] },
  });

  // Idempotency cache for create endpoints (§6.7)
  registerIdempotency(app, db);

  // Error handler
  registerErrorHandler(app);

  // Routes
  await app.register(healthRoutes, { prefix: '/v1/health' });
  await app.register(authRoutes, { prefix: '/v1/auth' });
  await app.register(customerRoutes, { prefix: '/v1/customers' });
  await app.register(vendorRoutes, { prefix: '/v1/vendors' });
  await app.register(itemRoutes, { prefix: '/v1/items' });
  await app.register(purchaseRoutes, { prefix: '/v1/purchase-invoices' });
  await app.register(bomRoutes, { prefix: '/v1/boms' });
  await app.register(productionRoutes, { prefix: '/v1/production-orders' });
  await app.register(invoiceRoutes, { prefix: '/v1/invoices' });
  await app.register(creditNoteRoutes, { prefix: '/v1/credit-notes' });
  await app.register(paymentRoutes, { prefix: '/v1/payments' });
  await app.register(masterRoutes, { prefix: '/v1' });
  await app.register(settingsRoutes, { prefix: '/v1/settings' });
  await app.register(taxRateMutationRoutes, { prefix: '/v1/tax-rates' });
  await app.register(invoiceSeriesRoutes, { prefix: '/v1/invoice-series' });
  await app.register(reportRoutes, { prefix: '/v1/reports' });
  await app.register(stockAdjustmentRoutes, { prefix: '/v1/stock-adjustments' });
  await app.register(stockTransferRoutes, { prefix: '/v1/stock-transfers' });
  await app.register(stockLedgerRoutes, { prefix: '/v1/stock-ledger' });
  await app.register(posRoutes, { prefix: '/v1/pos' });
  await app.register(publicRoutes, { prefix: '/public' });
  await app.register(adminRoutes, { prefix: '/v1/admin' });
  await app.register(userRoutes, { prefix: '/v1/users' });

  return app;
}

async function start() {
  const app = await buildServer();
  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Counter API running on port ${PORT}`);
  } catch (err) {
    app.log.fatal(err);
    process.exit(1);
  }
}

start();
