import type { DbClient } from '@counter/db';
import { users } from '@counter/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PermissionError, ValidationError } from '../errors.js';
import { authHook } from '../middleware/auth.js';
import {
  createUser,
  deleteUser,
  getUserPermissions,
  listUsers,
  setUserPermissions,
  updateUser,
} from '../services/user.service.js';

function getDb(app: FastifyInstance): DbClient {
  return (app as unknown as { db: DbClient }).db;
}

function meta(requestId: string) {
  return { request_id: requestId, server_time: new Date().toISOString() };
}

function ifMatchVersion(request: { headers: Record<string, unknown> }): number {
  const h = request.headers['if-match'];
  if (!h) throw new ValidationError('If-Match header (row_version) is required');
  const v = Number(String(h).replace(/"/g, ''));
  if (Number.isNaN(v)) throw new ValidationError('If-Match must be numeric');
  return v;
}

const CreateUserSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(10).max(15),
  email: z.string().email().nullable().optional(),
  role: z.enum(['admin', 'cashier', 'stock', 'accountant', 'mechanic', 'viewer']),
  pin: z
    .string()
    .length(4)
    .regex(/^\d{4}$/),
  default_branch_id: z.string().uuid(),
});

const UpdateUserSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().min(10).max(15).optional(),
  email: z.string().email().nullable().optional(),
  role: z.enum(['admin', 'cashier', 'stock', 'accountant', 'mechanic', 'viewer']).optional(),
  status: z.enum(['Active', 'Inactive']).optional(),
  pin: z
    .string()
    .length(4)
    .regex(/^\d{4}$/)
    .nullable()
    .optional(),
  default_branch_id: z.string().uuid().optional(),
});

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authHook);

  // preHandler hook to verify user is owner, admin or super_admin
  app.addHook('preHandler', async (request) => {
    const db = getDb(app);
    const [caller] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, request.ctx.user_id));

    if (
      !caller ||
      (caller.role !== 'owner' && caller.role !== 'admin' && caller.role !== 'super_admin')
    ) {
      throw new PermissionError(
        'Only organization owners or administrators can manage team members',
      );
    }
  });

  app.get('/', async (request, reply) => {
    const data = await listUsers(getDb(app), request.ctx);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.post('/', async (request, reply) => {
    const body = CreateUserSchema.parse(request.body);
    const data = await createUser(getDb(app), request.ctx, body);
    return reply.status(201).send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const version = ifMatchVersion(request as never);
    const body = UpdateUserSchema.parse(request.body);
    const data = await updateUser(getDb(app), request.ctx, id, version, body);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = await deleteUser(getDb(app), request.ctx, id);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/:id/permissions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = await getUserPermissions(getDb(app), request.ctx.org_id, id);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  const SetPermissionsSchema = z.object({
    overrides: z.array(
      z.object({
        permission_key: z.string().min(1).max(80),
        allowed: z.boolean(),
      }),
    ),
  });

  app.put('/:id/permissions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { overrides } = SetPermissionsSchema.parse(request.body);
    const data = await setUserPermissions(getDb(app), request.ctx.org_id, id, request.ctx.user_id, overrides);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });
}
