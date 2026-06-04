import type { DbClient } from '@counter/db';
import { user_branch_access, users } from '@counter/db';
import * as argon2 from 'argon2';
import { and, eq, isNull } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { RequestContext } from '../context.js';
import { BusinessError, NotFoundError } from '../errors.js';

export interface UserInput {
  name: string;
  phone: string;
  email?: string | null | undefined;
  role: string;
  pin: string;
  default_branch_id: string;
}

export interface UserUpdateInput {
  name?: string | undefined;
  phone?: string | undefined;
  email?: string | null | undefined;
  role?: string | undefined;
  status?: string | undefined;
  pin?: string | null | undefined;
  default_branch_id?: string | undefined;
}

export async function listUsers(db: DbClient, ctx: RequestContext) {
  return db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
      email: users.email,
      role: users.role,
      status: users.status,
      default_branch_id: users.default_branch_id,
      created_at: users.created_at,
      row_version: users.row_version,
    })
    .from(users)
    .where(and(eq(users.org_id, ctx.org_id), isNull(users.deleted_at)))
    .orderBy(users.name);
}

export async function createUser(db: DbClient, ctx: RequestContext, input: UserInput) {
  const pinHash = await argon2.hash(input.pin, { type: argon2.argon2id });
  const userId = uuidv7();

  return db.transaction(async (trx) => {
    // 1. Check if phone number is already registered in this organization
    const [existing] = await trx
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.phone, input.phone), eq(users.org_id, ctx.org_id), isNull(users.deleted_at)),
      );
    if (existing) {
      throw new BusinessError('Phone number already registered in this organization');
    }

    // 2. Insert user
    const [user] = await trx
      .insert(users)
      .values({
        id: userId,
        org_id: ctx.org_id,
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        role: input.role,
        pin_hash: pinHash,
        force_pin_change: false,
        status: 'Active',
        default_branch_id: input.default_branch_id,
        created_by: ctx.user_id,
        updated_by: ctx.user_id,
      })
      .returning();

    if (!user) throw new Error('Failed to create user');

    // 3. Grant branch access
    await trx.insert(user_branch_access).values({
      id: uuidv7(),
      org_id: ctx.org_id,
      user_id: userId,
      branch_id: input.default_branch_id,
    });

    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      role: user.role,
      status: user.status,
      default_branch_id: user.default_branch_id,
    };
  });
}

export async function updateUser(
  db: DbClient,
  ctx: RequestContext,
  userId: string,
  version: number,
  input: UserUpdateInput,
) {
  return db.transaction(async (trx) => {
    // 1. Fetch current user
    const [user] = await trx
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.org_id, ctx.org_id), isNull(users.deleted_at)));

    if (!user) throw new NotFoundError('User', userId);

    if (user.row_version !== version) {
      throw new BusinessError('Conflict: User was modified by another operator');
    }

    // 2. If phone is changing, verify it is unique in this org
    if (input.phone && input.phone !== user.phone) {
      const [existing] = await trx
        .select({ id: users.id })
        .from(users)
        .where(
          and(eq(users.phone, input.phone), eq(users.org_id, ctx.org_id), isNull(users.deleted_at)),
        );
      if (existing) {
        throw new BusinessError('Phone number already registered in this organization');
      }
    }

    const updates: Partial<typeof users.$inferInsert> = {
      name: input.name ?? user.name,
      phone: input.phone ?? user.phone,
      email: input.email !== undefined ? input.email : user.email,
      role: input.role ?? user.role,
      status: input.status ?? user.status,
      default_branch_id: input.default_branch_id ?? user.default_branch_id,
      updated_by: ctx.user_id,
      updated_at: new Date(),
      row_version: version + 1,
    };

    if (input.pin) {
      updates.pin_hash = await argon2.hash(input.pin, { type: argon2.argon2id });
    }

    const [updated] = await trx.update(users).set(updates).where(eq(users.id, userId)).returning();

    if (!updated) throw new Error('Failed to update user');

    // 3. Ensure branch access if branch changed
    if (input.default_branch_id && input.default_branch_id !== user.default_branch_id) {
      const [existingAccess] = await trx
        .select({ id: user_branch_access.id })
        .from(user_branch_access)
        .where(
          and(
            eq(user_branch_access.user_id, userId),
            eq(user_branch_access.branch_id, input.default_branch_id),
          ),
        );
      if (!existingAccess) {
        await trx.insert(user_branch_access).values({
          id: uuidv7(),
          org_id: ctx.org_id,
          user_id: userId,
          branch_id: input.default_branch_id,
        });
      }
    }

    return {
      id: updated.id,
      name: updated.name,
      phone: updated.phone,
      email: updated.email,
      role: updated.role,
      status: updated.status,
      default_branch_id: updated.default_branch_id,
      row_version: updated.row_version,
    };
  });
}

export async function deleteUser(db: DbClient, ctx: RequestContext, userId: string) {
  // Prevent self deletion
  if (userId === ctx.user_id) {
    throw new BusinessError('You cannot delete your own user account');
  }

  const [result] = await db
    .update(users)
    .set({
      deleted_at: new Date(),
    })
    .where(and(eq(users.id, userId), eq(users.org_id, ctx.org_id), isNull(users.deleted_at)))
    .returning();

  if (!result) throw new NotFoundError('User', userId);
  return { id: userId, deleted: true };
}
