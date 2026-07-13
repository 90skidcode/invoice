import { randomUUID } from 'node:crypto';
import type { DbClient } from '@counter/db';
import { organizations } from '@counter/db';
import { LoginInputSchema, RefreshTokenInputSchema } from '@counter/schemas';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  type AuthenticatedLogin,
  authenticateLogin,
  consumeRefreshToken,
  issueRefreshToken,
  loadSession,
  revokeRefreshToken,
} from '../services/auth.service.js';

const ACCESS_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

const LogoutInputSchema = z.object({ refresh_token: z.string().min(1) });

function getDb(app: FastifyInstance): DbClient {
  return (app as unknown as { db: DbClient }).db;
}

function meta(requestId: string) {
  return { request_id: requestId, server_time: new Date().toISOString() };
}

/** Sign an RS256 access token + issue a rotating refresh token, returning the login envelope. */
async function buildSession(app: FastifyInstance, db: DbClient, session: AuthenticatedLogin) {
  const accessToken = app.jwt.sign(
    {
      sub: session.user.id,
      org_id: session.org.id,
      device_id: session.device_id,
      branch_id: session.user.branches[0]?.id,
      permissions: session.permissions,
    },
    { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  );

  const refreshToken = await issueRefreshToken(
    db,
    session.org.id,
    session.user.id,
    session.device_id,
  );

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    user: session.user,
    org: session.org,
    permissions: session.permissions,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb(app);

  // GET /v1/auth/organizations — public; list available organizations for login
  app.get('/organizations', async (request, reply) => {
    const orgs = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        org_code: organizations.org_code,
        logo_url: organizations.logo_url,
      })
      .from(organizations)
      .where(eq(organizations.is_active, true));

    const requestId = (request.headers['x-request-id'] as string) ?? randomUUID();
    return reply.send({
      ok: true,
      data: orgs,
      meta: meta(requestId),
    });
  });

  // POST /v1/auth/login — public
  app.post('/login', async (request, reply) => {
    const input = LoginInputSchema.parse(request.body);
    const session = await authenticateLogin(db, input);
    const data = await buildSession(app, db, session);
    const requestId = (request.headers['x-request-id'] as string) ?? randomUUID();
    return reply.send({ ok: true, data, meta: meta(requestId) });
  });

  // POST /v1/auth/refresh — public; rotates the refresh token
  app.post('/refresh', async (request, reply) => {
    const { refresh_token } = RefreshTokenInputSchema.parse(request.body);
    const { org_id, user_id, device_id } = await consumeRefreshToken(db, refresh_token);
    const session = await loadSession(db, org_id, user_id, device_id ?? '');
    const data = await buildSession(app, db, session);
    const requestId = (request.headers['x-request-id'] as string) ?? randomUUID();
    return reply.send({ ok: true, data, meta: meta(requestId) });
  });

  // POST /v1/auth/logout — public; revokes the supplied refresh token
  app.post('/logout', async (request, reply) => {
    const { refresh_token } = LogoutInputSchema.parse(request.body);
    await revokeRefreshToken(db, refresh_token);
    const requestId = (request.headers['x-request-id'] as string) ?? randomUUID();
    return reply.send({ ok: true, data: { ok: true }, meta: meta(requestId) });
  });
}
