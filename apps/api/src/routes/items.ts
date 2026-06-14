import type { DbClient } from '@counter/db';
import { items } from '@counter/db';
import { CreateItemInputSchema, UpdateItemInputSchema } from '@counter/schemas';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { BusinessError, NotFoundError, ValidationError } from '../errors.js';
import { authHook } from '../middleware/auth.js';
import {
  createItem,
  getItemById,
  getItemLookup,
  listItems,
  softDeleteItem,
  updateItem,
} from '../services/item.service.js';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

const UPLOADS_DIR = process.env['UPLOADS_DIR'] ?? path.join(process.cwd(), 'uploads');

const LookupQuerySchema = z.object({
  q: z.string().min(2),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  is_finished_good: z.coerce.boolean().optional(),
});

const ListQuerySchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  is_finished_good: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

const UploadImageSchema = z.object({
  image_data: z
    .string()
    .regex(/^data:image\/(jpeg|jpg|png|webp|gif);base64,/, 'Must be a valid image data URL'),
});

const RemoveImageSchema = z.object({
  url: z.string().min(1),
});

function getDb(app: FastifyInstance): DbClient {
  return (app as unknown as { db: DbClient }).db;
}

function meta(requestId: string) {
  return { request_id: requestId, server_time: new Date().toISOString() };
}

export async function itemRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authHook);

  // GET /v1/items/lookup
  app.get('/lookup', async (request, reply) => {
    const { q, limit, is_finished_good } = LookupQuerySchema.parse(request.query);
    const results = await getItemLookup(getDb(app), request.ctx, q, limit, is_finished_good);
    return reply.send({ ok: true, data: results, meta: meta(request.ctx.request_id) });
  });

  // GET /v1/items — paginated list
  app.get('/', async (request, reply) => {
    const query = ListQuerySchema.parse(request.query);
    const result = await listItems(getDb(app), request.ctx, query);
    return reply.send({
      ok: true,
      data: result.data,
      page: result.page,
      meta: meta(request.ctx.request_id),
    });
  });

  // GET /v1/items/:id
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await getItemById(getDb(app), request.ctx, id);
    return reply.send({ ok: true, data: item, meta: meta(request.ctx.request_id) });
  });

  // POST /v1/items
  app.post('/', async (request, reply) => {
    const body = CreateItemInputSchema.parse(request.body);
    const result = await createItem(getDb(app), request.ctx, body);
    return reply.status(201).send({ ok: true, data: result, meta: meta(request.ctx.request_id) });
  });

  // PATCH /v1/items/:id
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
    const body = UpdateItemInputSchema.parse(request.body);
    const data = await updateItem(getDb(app), request.ctx, id, body, expectedVersion);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  // DELETE /v1/items/:id
  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await softDeleteItem(getDb(app), request.ctx, id);
    return reply.send({ ok: true, data: null, meta: meta(request.ctx.request_id) });
  });

  // POST /v1/items/:id/image — upload one image (client has already resized to ≤800px)
  app.post('/:id/image', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { image_data } = UploadImageSchema.parse(request.body);

    const db = getDb(app);
    const [existing] = await db
      .select({ id: items.id, image_urls: items.image_urls })
      .from(items)
      .where(and(eq(items.id, id), eq(items.org_id, request.ctx.org_id), isNull(items.deleted_at)))
      .limit(1);

    if (!existing) throw new NotFoundError('Item', id);

    // Decode base64 payload
    const match = image_data.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match?.[2]) throw new ValidationError('Invalid image data URL');

    const imgBuffer = Buffer.from(match[2], 'base64');
    if (imgBuffer.length > 5 * 1024 * 1024) {
      throw new BusinessError('Image exceeds 5 MB — resize on the client before uploading');
    }

    const ext = match[1] === 'png' ? 'png' : match[1] === 'webp' ? 'webp' : 'jpg';
    const filename = `${uuidv7()}.${ext}`;
    const dir = path.join(UPLOADS_DIR, 'items', request.ctx.org_id);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, filename), imgBuffer);

    const url = `/uploads/items/${request.ctx.org_id}/${filename}`;
    const newUrls = [...(existing.image_urls ?? []), url];

    await db
      .update(items)
      .set({
        image_urls: newUrls,
        updated_at: new Date(),
        updated_by: request.ctx.user_id,
        row_version: sql`row_version + 1`,
      })
      .where(and(eq(items.id, id), eq(items.org_id, request.ctx.org_id)));

    return reply.status(201).send({ ok: true, data: { url, image_urls: newUrls }, meta: meta(request.ctx.request_id) });
  });

  // DELETE /v1/items/:id/image — remove one image by URL
  app.delete('/:id/image', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { url } = RemoveImageSchema.parse(request.body);

    const db = getDb(app);
    const [existing] = await db
      .select({ id: items.id, image_urls: items.image_urls })
      .from(items)
      .where(and(eq(items.id, id), eq(items.org_id, request.ctx.org_id), isNull(items.deleted_at)))
      .limit(1);

    if (!existing) throw new NotFoundError('Item', id);

    const newUrls = (existing.image_urls ?? []).filter((u) => u !== url);
    await db
      .update(items)
      .set({
        image_urls: newUrls,
        updated_at: new Date(),
        updated_by: request.ctx.user_id,
        row_version: sql`row_version + 1`,
      })
      .where(and(eq(items.id, id), eq(items.org_id, request.ctx.org_id)));

    // Best-effort: delete file from disk
    if (url.startsWith('/uploads/')) {
      const rel = url.slice('/uploads/'.length);
      const abs = path.resolve(path.join(UPLOADS_DIR, rel));
      if (abs.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) {
        try { await fs.promises.unlink(abs); } catch { /* ignore if already gone */ }
      }
    }

    return reply.send({ ok: true, data: { image_urls: newUrls }, meta: meta(request.ctx.request_id) });
  });
}
