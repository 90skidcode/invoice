import type { DbClient } from '@counter/db';
import {
  ConvertLeadInputSchema,
  CreateLeadInputSchema,
  CreateLeadTagInputSchema,
  LogFollowUpInputSchema,
  UpdateLeadInputSchema,
} from '@counter/schemas';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ValidationError } from '../errors.js';
import { authHook } from '../middleware/auth.js';
import {
  convertLead,
  createLead,
  createLeadTag,
  getLeadById,
  leadDashboard,
  listLeadTags,
  listLeads,
  logFollowUp,
  softDeleteLead,
  updateLead,
} from '../services/lead.service.js';

const ListQuerySchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  source_id: z.string().uuid().optional(),
  assigned_to: z.string().uuid().optional(),
  tag_ids: z.string().optional(), // comma-separated UUIDs
  customer_name: z.string().optional(),
  phone: z.string().optional(),
  next_follow_up_from: z.string().optional(), // ISO date string
  next_follow_up_to: z.string().optional(), // ISO date string
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

function getDb(app: FastifyInstance): DbClient {
  return (app as unknown as { db: DbClient }).db;
}

function meta(requestId: string) {
  return { request_id: requestId, server_time: new Date().toISOString() };
}

export async function leadRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authHook);

  app.get('/dashboard', async (request, reply) => {
    const data = await leadDashboard(getDb(app), request.ctx);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/tags', async (request, reply) => {
    const data = await listLeadTags(getDb(app), request.ctx);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.post('/tags', async (request, reply) => {
    const body = CreateLeadTagInputSchema.parse(request.body);
    const data = await createLeadTag(getDb(app), request.ctx, body);
    return reply.status(201).send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.get('/', async (request, reply) => {
    const query = ListQuerySchema.parse(request.query);
    const result = await listLeads(getDb(app), request.ctx, query);
    return reply.send({
      ok: true,
      data: { data: result.data, page: result.page },
      meta: meta(request.ctx.request_id),
    });
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = await getLeadById(getDb(app), request.ctx, id);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.post('/', async (request, reply) => {
    const body = CreateLeadInputSchema.parse(request.body);
    const data = await createLead(getDb(app), request.ctx, body);
    return reply.status(201).send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const ifMatch = request.headers['if-match'];
    if (!ifMatch) {
      throw new ValidationError('If-Match header (row_version) is required for updates');
    }
    const expectedVersion = Number(String(ifMatch).replace(/"/g, ''));
    if (Number.isNaN(expectedVersion)) {
      throw new ValidationError('If-Match must be a numeric row_version');
    }
    const body = UpdateLeadInputSchema.parse(request.body);
    const data = await updateLead(getDb(app), request.ctx, id, body, expectedVersion);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await softDeleteLead(getDb(app), request.ctx, id);
    return reply.send({ ok: true, data: null, meta: meta(request.ctx.request_id) });
  });

  app.post('/:id/log-followup', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = LogFollowUpInputSchema.parse(request.body);
    const data = await logFollowUp(getDb(app), request.ctx, id, body);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  app.post('/:id/convert', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = ConvertLeadInputSchema.parse(request.body);
    const data = await convertLead(getDb(app), request.ctx, id, body);
    return reply.status(201).send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });
}
