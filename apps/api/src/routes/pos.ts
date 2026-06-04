import type { DbClient } from '@counter/db';
import type { FastifyInstance } from 'fastify';
import { authHook } from '../middleware/auth.js';
import { getPosBootstrap } from '../services/pos.service.js';

function getDb(app: FastifyInstance): DbClient {
  return (app as unknown as { db: DbClient }).db;
}

export async function posRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authHook);

  // GET /v1/pos/bootstrap
  app.get('/bootstrap', async (request, reply) => {
    const data = await getPosBootstrap(getDb(app), request.ctx);
    return reply.send({
      ok: true,
      data,
      meta: {
        request_id: request.ctx.request_id,
        server_time: new Date().toISOString(),
      },
    });
  });
}
