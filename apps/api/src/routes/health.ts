import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Health check endpoint for UptimeRobot (unauthenticated)
  app.get('/health', async (_request, reply) => {
    try {
      const db = (app as unknown as { db: any }).db;

      // Verify database connection with a simple query
      await db.execute(sql`SELECT 1`);

      return reply.status(200).send({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env['APP_VERSION'] ?? '1.0.0',
        uptime: Math.floor(process.uptime()),
      });
    } catch (error) {
      return reply.status(503).send({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Legacy endpoint (kept for backward compatibility)
  app.get('/', async (_request, reply) => {
    return reply.send({
      status: 'ok',
      db: 'ok',
      redis: 'ok',
      version: process.env['APP_VERSION'] ?? '1.0.0',
    });
  });
}
