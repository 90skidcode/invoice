import type { DbClient } from '@counter/db';
import {
  bank_accounts,
  branches,
  invoice_series,
  invoices,
  items,
  locations,
  organizations,
  payment_modes,
  purchase_invoices,
  tax_rates,
  units,
  user_branch_access,
  users,
} from '@counter/db';
import * as argon2 from 'argon2';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { BusinessError, PermissionError, ValidationError } from '../errors.js';
import { authHook } from '../middleware/auth.js';
import { getUserPermissions, setUserPermissions } from '../services/user.service.js';

function getDb(app: FastifyInstance): DbClient {
  return (app as unknown as { db: DbClient }).db;
}

function meta(requestId: string) {
  return { request_id: requestId, server_time: new Date().toISOString() };
}

const CreateOrgSchema = z.object({
  name: z.string().min(1).max(160),
  legal_name: z.string().max(160).nullable().optional(),
  gstin: z.string().min(15).max(15).nullable().optional(),
  pan: z.string().length(10).nullable().optional(),
  state_code: z.string().length(2),
  address: z.string().nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().max(120).nullable().optional(),
  upi_id: z.string().max(80).nullable().optional(),
  plan: z.enum(['trial', 'basic', 'premium', 'enterprise']).default('trial'),
  owner_name: z.string().min(1).max(120),
  owner_phone: z.string().min(10).max(15),
  owner_pin: z
    .string()
    .length(4)
    .regex(/^\d{4}$/),
});

const UpdateOrgSchema = z.object({
  plan: z.enum(['trial', 'basic', 'premium', 'enterprise']).optional(),
  is_active: z.boolean().optional(),
});

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authHook);

  // Verify that the caller is a super_admin
  app.addHook('preHandler', async (request) => {
    const db = getDb(app);
    const [caller] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, request.ctx.user_id));

    if (!caller || caller.role !== 'super_admin') {
      throw new PermissionError(
        'Only system administrators can perform global administration tasks',
      );
    }
  });

  // GET /v1/admin/organizations
  app.get('/organizations', async (request, reply) => {
    const db = getDb(app);

    const orgsList = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        legal_name: organizations.legal_name,
        gstin: organizations.gstin,
        pan: organizations.pan,
        state_code: organizations.state_code,
        address: organizations.address,
        phone: organizations.phone,
        email: organizations.email,
        industry_profile: organizations.industry_profile,
        upi_id: organizations.upi_id,
        plan: organizations.plan,
        is_active: organizations.is_active,
        created_at: organizations.created_at,
      })
      .from(organizations)
      .orderBy(organizations.created_at);

    const invoiceStats = await db
      .select({
        org_id: invoices.org_id,
        count: sql<number>`count(*)::int`,
        receivables: sql<string>`coalesce(sum(${invoices.balance_due}), 0)`,
      })
      .from(invoices)
      .where(and(eq(invoices.status, 'posted'), isNull(invoices.deleted_at)))
      .groupBy(invoices.org_id);

    const purchaseStats = await db
      .select({
        org_id: purchase_invoices.org_id,
        payables: sql<string>`coalesce(sum(${purchase_invoices.balance_due}), 0)`,
      })
      .from(purchase_invoices)
      .where(isNull(purchase_invoices.deleted_at))
      .groupBy(purchase_invoices.org_id);

    const itemStats = await db
      .select({
        org_id: items.org_id,
        count: sql<number>`count(*)::int`,
      })
      .from(items)
      .where(isNull(items.deleted_at))
      .groupBy(items.org_id);

    const invoiceMap = new Map(invoiceStats.map((s) => [s.org_id, s]));
    const purchaseMap = new Map(purchaseStats.map((s) => [s.org_id, s]));
    const itemMap = new Map(itemStats.map((s) => [s.org_id, s]));

    const data = orgsList.map((org) => {
      const inv = invoiceMap.get(org.id);
      const pur = purchaseMap.get(org.id);
      const itm = itemMap.get(org.id);
      return {
        ...org,
        invoices_count: inv?.count ?? 0,
        receivables_total: inv?.receivables ?? '0.00',
        payables_total: pur?.payables ?? '0.00',
        items_count: itm?.count ?? 0,
      };
    });

    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  // PATCH /v1/admin/organizations/:id
  app.patch('/organizations/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = UpdateOrgSchema.parse(request.body);
    const db = getDb(app);

    const [existing] = await db.select().from(organizations).where(eq(organizations.id, id));

    if (!existing) {
      throw new ValidationError('Organization not found');
    }

    const updates: Partial<typeof organizations.$inferInsert> = {
      updated_at: new Date(),
    };

    if (body.plan !== undefined) updates.plan = body.plan;
    if (body.is_active !== undefined) updates.is_active = body.is_active;

    const [updated] = await db
      .update(organizations)
      .set(updates)
      .where(eq(organizations.id, id))
      .returning();

    return reply.send({ ok: true, data: updated, meta: meta(request.ctx.request_id) });
  });

  // POST /v1/admin/organizations
  app.post('/organizations', async (request, reply) => {
    const body = CreateOrgSchema.parse(request.body);
    const db = getDb(app);

    let orgCode = body.name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 10);
    if (!orgCode) orgCode = 'ORG';

    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 10) {
      const code = `${orgCode}-${Math.floor(100 + Math.random() * 900)}`;
      const [existingCode] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.org_code, code));
      if (!existingCode) {
        orgCode = code;
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      throw new BusinessError('Could not generate a unique organization code. Please try again.');
    }

    const orgId = uuidv7();
    const branchId = uuidv7();
    const locationId = uuidv7();
    const ownerId = uuidv7();

    const pinHash = await argon2.hash(body.owner_pin, { type: argon2.argon2id });

    const result = await db.transaction(async (trx) => {
      const [org] = await trx
        .insert(organizations)
        .values({
          id: orgId,
          name: body.name,
          legal_name: body.legal_name ?? null,
          gstin: body.gstin ?? null,
          pan: body.pan ?? null,
          state_code: body.state_code,
          address: body.address ?? null,
          phone: body.phone ?? null,
          email: body.email ?? null,
          upi_id: body.upi_id ?? null,
          org_code: orgCode,
          plan: body.plan,
          is_active: true,
        })
        .returning();

      if (!org) throw new Error('Failed to create organization');

      const [branch] = await trx
        .insert(branches)
        .values({
          id: branchId,
          org_id: orgId,
          name: 'HQ Branch',
          code: 'HQ',
          state_code: body.state_code,
          address: body.address ?? null,
          phone: body.phone ?? null,
          is_default: true,
          is_active: true,
        })
        .returning();

      if (!branch) throw new Error('Failed to create default branch');

      const [location] = await trx
        .insert(locations)
        .values({
          id: locationId,
          org_id: orgId,
          branch_id: branchId,
          name: 'Main Store',
          code: 'LOC1',
          type: 'warehouse',
          is_default: true,
          is_active: true,
        })
        .returning();

      if (!location) throw new Error('Failed to create default location');

      const [owner] = await trx
        .insert(users)
        .values({
          id: ownerId,
          org_id: orgId,
          name: body.owner_name,
          phone: body.owner_phone,
          email: body.email ?? null,
          role: 'owner',
          pin_hash: pinHash,
          force_pin_change: false,
          is_salesperson: true,
          status: 'Active',
          default_branch_id: branchId,
          created_by: request.ctx.user_id,
          updated_by: request.ctx.user_id,
        })
        .returning();

      if (!owner) throw new Error('Failed to create owner user');

      await trx.insert(user_branch_access).values({
        id: uuidv7(),
        org_id: orgId,
        user_id: ownerId,
        branch_id: branchId,
      });

      const gstDefs = [
        { name: 'GST 0%', total: '0', half: '0', igst: '0' },
        { name: 'GST 5%', total: '5', half: '2.5', igst: '5' },
        { name: 'GST 12%', total: '12', half: '6', igst: '12' },
        { name: 'GST 18%', total: '18', half: '9', igst: '18' },
        { name: 'GST 28%', total: '28', half: '14', igst: '28' },
      ];
      for (const g of gstDefs) {
        await trx.insert(tax_rates).values({
          id: uuidv7(),
          org_id: orgId,
          name: g.name,
          total_rate: g.total,
          cgst_rate: g.half,
          sgst_rate: g.half,
          igst_rate: g.igst,
          cess_rate: '0',
          effective_from: '2026-04-01',
        });
      }

      const unitDefs = [
        { name: 'Pieces', abbreviation: 'PCS' },
        { name: 'Kilogram', abbreviation: 'KG' },
        { name: 'Litre', abbreviation: 'LTR' },
        { name: 'Box', abbreviation: 'BOX' },
      ];
      for (const u of unitDefs) {
        await trx.insert(units).values({
          id: uuidv7(),
          org_id: orgId,
          name: u.name,
          abbreviation: u.abbreviation,
        });
      }

      await trx.insert(invoice_series).values({
        id: uuidv7(),
        org_id: orgId,
        name: 'Main Sales',
        document_type: 'invoice',
        prefix: 'INV-',
        suffix: '/2026-27',
        number_padding: 4,
        starting_number: 1,
        next_number: 1,
        reset_on_fy: true,
        is_default: true,
        is_active: true,
      });

      const modeDefs = [
        { name: 'Cash', type: 'cash' },
        { name: 'Card', type: 'card' },
        { name: 'UPI', type: 'upi' },
        { name: 'Bank Transfer', type: 'bank' },
      ];
      let order = 0;
      for (const m of modeDefs) {
        await trx.insert(payment_modes).values({
          id: uuidv7(),
          org_id: orgId,
          name: m.name,
          type: m.type,
          display_order: order++,
        });
      }

      await trx.insert(bank_accounts).values([
        {
          id: uuidv7(),
          org_id: orgId,
          name: 'Cash Drawer',
          type: 'cash',
          current_balance: '0.00',
          is_default: true,
        },
        {
          id: uuidv7(),
          org_id: orgId,
          name: 'Main Bank Account',
          type: 'bank',
          current_balance: '0.00',
          is_default: false,
        },
      ]);

      return {
        id: org.id,
        name: org.name,
        org_code: org.org_code,
        plan: org.plan,
        is_active: org.is_active,
        owner: {
          id: owner.id,
          name: owner.name,
          phone: owner.phone,
        },
      };
    });

    return reply.status(201).send({ ok: true, data: result, meta: meta(request.ctx.request_id) });
  });

  // GET /v1/admin/organizations/:orgId/users — list users in any org with their permissions
  app.get('/organizations/:orgId/users', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const db = getDb(app);

    const orgUsers = await db
      .select({
        id: users.id,
        name: users.name,
        phone: users.phone,
        email: users.email,
        role: users.role,
        status: users.status,
        row_version: users.row_version,
      })
      .from(users)
      .where(and(eq(users.org_id, orgId), isNull(users.deleted_at)))
      .orderBy(users.name);

    return reply.send({ ok: true, data: orgUsers, meta: meta(request.ctx.request_id) });
  });

  // GET /v1/admin/organizations/:orgId/users/:userId/permissions
  app.get('/organizations/:orgId/users/:userId/permissions', async (request, reply) => {
    const { orgId, userId } = request.params as { orgId: string; userId: string };
    const data = await getUserPermissions(getDb(app), orgId, userId);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });

  const AdminSetPermissionsSchema = z.object({
    overrides: z.array(
      z.object({
        permission_key: z.string().min(1).max(80),
        allowed: z.boolean(),
      }),
    ),
  });

  // PUT /v1/admin/organizations/:orgId/users/:userId/permissions
  app.put('/organizations/:orgId/users/:userId/permissions', async (request, reply) => {
    const { orgId, userId } = request.params as { orgId: string; userId: string };
    const { overrides } = AdminSetPermissionsSchema.parse(request.body);
    const data = await setUserPermissions(getDb(app), orgId, userId, request.ctx.user_id, overrides);
    return reply.send({ ok: true, data, meta: meta(request.ctx.request_id) });
  });
}
