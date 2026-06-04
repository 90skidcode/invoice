import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (_request, reply) => {
    return reply.send({
      status: 'ok',
      db: 'ok',
      redis: 'ok',
      version: process.env['APP_VERSION'] ?? '1.0.0',
    });
  });
}
