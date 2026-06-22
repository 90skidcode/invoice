import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DbClient } from '@counter/db';
import {
  branches,
  devices,
  organizations,
  permissions_override,
  refresh_tokens,
  user_branch_access,
  users,
} from '@counter/db';
import type { LoginInput } from '@counter/schemas';
import * as argon2 from 'argon2';
import { and, eq, isNull } from 'drizzle-orm';
import { BusinessError, UnauthenticatedError } from '../errors.js';
import { permissionsForRole } from '../permissions.js';

async function applyPermissionOverrides(
  db: DbClient,
  userId: string,
  rolePermissions: string[],
): Promise<string[]> {
  if (rolePermissions.includes('*')) return rolePermissions;
  const overrides = await db
    .select({ permission_key: permissions_override.permission_key, allowed: permissions_override.allowed })
    .from(permissions_override)
    .where(eq(permissions_override.user_id, userId));
  if (overrides.length === 0) return rolePermissions;
  const perms = new Set(rolePermissions);
  for (const ov of overrides) {
    if (ov.allowed) perms.add(ov.permission_key);
    else perms.delete(ov.permission_key);
  }
  return [...perms];
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 60;

export interface AuthenticatedLogin {
  user: { id: string; name: string; role: string; branches: { id: string; name: string }[] };
  org: {
    id: string;
    name: string;
    gstin: string | null;
    industry_profile: string;
    state_code: string;
  };
  permissions: string[];
  device_id: string;
}

export async function authenticateLogin(
  db: DbClient,
  input: LoginInput,
): Promise<AuthenticatedLogin> {
  // 1. Find the user by phone (optionally scoped to an org via org_code)
  const candidates = await db
    .select({
      id: users.id,
      org_id: users.org_id,
      name: users.name,
      role: users.role,
      pin_hash: users.pin_hash,
      status: users.status,
      failed_login_count: users.failed_login_count,
      locked_until: users.locked_until,
    })
    .from(users)
    .where(and(eq(users.phone, input.identifier), isNull(users.deleted_at)));

  let matched: (typeof candidates)[number] | undefined;
  if (input.org_code) {
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.org_code, input.org_code));
    matched = candidates.find((c) => c.org_id === org?.id);
  } else {
    matched = candidates[0];
  }

  // Generic error to avoid leaking which part failed
  if (!matched || !matched.pin_hash) {
    throw new UnauthenticatedError('Invalid credentials');
  }

  if (matched.locked_until && matched.locked_until > new Date()) {
    throw new BusinessError('Account locked. Try again later.');
  }

  if (matched.status !== 'Active') {
    throw new UnauthenticatedError('Account is not active');
  }

  // 2. Verify the PIN (argon2id)
  const valid = await argon2.verify(matched.pin_hash, input.credential);
  if (!valid) {
    const nextCount = matched.failed_login_count + 1;
    const lockUntil =
      nextCount >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null;
    await db
      .update(users)
      .set({ failed_login_count: nextCount, locked_until: lockUntil })
      .where(eq(users.id, matched.id));
    throw new UnauthenticatedError('Invalid credentials');
  }

  // 3. Reset failed counter on success
  await db
    .update(users)
    .set({ failed_login_count: 0, locked_until: null })
    .where(eq(users.id, matched.id));

  // 4. Load org
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      gstin: organizations.gstin,
      industry_profile: organizations.industry_profile,
      state_code: organizations.state_code,
    })
    .from(organizations)
    .where(eq(organizations.id, matched.org_id));

  if (!org) throw new UnauthenticatedError('Organization not found');

  // 5. Load branch access
  const branchRows = await db
    .select({ id: branches.id, name: branches.name })
    .from(user_branch_access)
    .innerJoin(branches, eq(branches.id, user_branch_access.branch_id))
    .where(eq(user_branch_access.user_id, matched.id));

  // 6. Register / refresh the device
  await db
    .insert(devices)
    .values({
      id: input.device.id,
      org_id: matched.org_id,
      user_id: matched.id,
      name: input.device.name,
      platform: input.device.platform,
      app_version: input.device.app_version,
      install_id: input.device.install_id,
      last_seen_at: new Date(),
    })
    .onConflictDoUpdate({
      target: devices.id,
      set: {
        user_id: matched.id,
        last_seen_at: new Date(),
        app_version: input.device.app_version,
      },
    });

  return {
    user: { id: matched.id, name: matched.name, role: matched.role, branches: branchRows },
    org: {
      id: org.id,
      name: org.name,
      gstin: org.gstin,
      industry_profile: org.industry_profile,
      state_code: org.state_code,
    },
    permissions: await applyPermissionOverrides(db, matched.id, permissionsForRole(matched.role)),
    device_id: input.device.id,
  };
}

export async function issueRefreshToken(
  db: DbClient,
  orgId: string,
  userId: string,
  deviceId: string,
): Promise<string> {
  const raw = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000); // 30 days

  await db.insert(refresh_tokens).values({
    id: randomUUID(),
    org_id: orgId,
    user_id: userId,
    device_id: deviceId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  return raw;
}

/**
 * Validate a refresh token and rotate it: the presented token is revoked and a
 * fresh one issued (returned by the caller). Throws if invalid/expired/revoked.
 */
export async function consumeRefreshToken(
  db: DbClient,
  rawToken: string,
): Promise<{ org_id: string; user_id: string; device_id: string | null }> {
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const [row] = await db
    .select()
    .from(refresh_tokens)
    .where(eq(refresh_tokens.token_hash, tokenHash));

  if (!row || row.revoked_at || row.expires_at < new Date()) {
    throw new UnauthenticatedError('Invalid or expired refresh token');
  }

  await db
    .update(refresh_tokens)
    .set({ revoked_at: new Date() })
    .where(eq(refresh_tokens.id, row.id));

  return { org_id: row.org_id, user_id: row.user_id, device_id: row.device_id };
}

export async function revokeRefreshToken(db: DbClient, rawToken: string): Promise<void> {
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  await db
    .update(refresh_tokens)
    .set({ revoked_at: new Date() })
    .where(and(eq(refresh_tokens.token_hash, tokenHash), isNull(refresh_tokens.revoked_at)));
}

/** Rebuild the session (user, org, permissions) for an already-authenticated user. */
export async function loadSession(
  db: DbClient,
  orgId: string,
  userId: string,
  deviceId: string,
): Promise<AuthenticatedLogin> {
  const [user] = await db
    .select({ id: users.id, name: users.name, role: users.role, status: users.status })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deleted_at)));
  if (!user || user.status !== 'Active') {
    throw new UnauthenticatedError('User not active');
  }

  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      gstin: organizations.gstin,
      industry_profile: organizations.industry_profile,
      state_code: organizations.state_code,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  if (!org) throw new UnauthenticatedError('Organization not found');

  const branchRows = await db
    .select({ id: branches.id, name: branches.name })
    .from(user_branch_access)
    .innerJoin(branches, eq(branches.id, user_branch_access.branch_id))
    .where(eq(user_branch_access.user_id, userId));

  return {
    user: { id: user.id, name: user.name, role: user.role, branches: branchRows },
    org: {
      id: org.id,
      name: org.name,
      gstin: org.gstin,
      industry_profile: org.industry_profile,
      state_code: org.state_code,
    },
    permissions: await applyPermissionOverrides(db, user.id, permissionsForRole(user.role)),
    device_id: deviceId,
  };
}
