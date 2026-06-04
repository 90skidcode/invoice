import { randomUUID } from 'node:crypto';
import type { DbClient } from '@counter/db';
import { idempotency_keys } from '@counter/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

interface IdemCtx {
  key: string;
  endpoint: string;
  orgId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    idemCtx: IdemCtx | null;
  }
}

/**
 * §6.7 — POSTs that carry an `Idempotency-Key` header are de-duplicated per
 * (org_id, key, endpoint). A replay returns the original cached response.
 */
export function registerIdempotency(app: FastifyInstance, db: DbClient): void {
  app.decorateRequest('idemCtx', null);

  app.addHook('preHandler', async (request, reply) => {
    if (request.method !== 'POST') return;
    const key = request.headers['idempotency-key'];
    if (!key || typeof key !== 'string') return;
    // ctx is set by authHook (onRequest) for protected routes only.
    const ctx = request.ctx;
    if (!ctx) return;

    const endpoint = request.routeOptions.url ?? request.url;

    const [existing] = await db
      .select({
        status_code: idempotency_keys.status_code,
        response_json: idempotency_keys.response_json,
      })
      .from(idempotency_keys)
      .where(
        and(
          eq(idempotency_keys.org_id, ctx.org_id),
          eq(idempotency_keys.idem_key, key),
          eq(idempotency_keys.endpoint, endpoint),
        ),
      );

    if (existing) {
      reply
        .code(existing.status_code)
        .header('Idempotent-Replay', 'true')
        .send(existing.response_json);
      return reply;
    }

    request.idemCtx = { key, endpoint, orgId: ctx.org_id };
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const idem = request.idemCtx;
    if (!idem) return payload;
    // Only cache successful creates.
    if (reply.statusCode < 200 || reply.statusCode >= 300) return payload;
    if (typeof payload !== 'string') return payload;

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return payload; // non-JSON body; don't cache
    }

    try {
      await db.insert(idempotency_keys).values({
        id: randomUUID(),
        org_id: idem.orgId,
        idem_key: idem.key,
        endpoint: idem.endpoint,
        status_code: reply.statusCode,
        response_json: parsed,
      });
    } catch {
      // Unique-violation on concurrent duplicate — the first writer won; ignore.
    }

    return payload;
  });
}
