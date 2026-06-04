import type { BranchId, DeviceId, OrgId, UserId } from '@counter/utils';
import type { FastifyRequest } from 'fastify';

export interface RequestContext {
  user_id: UserId;
  org_id: OrgId;
  device_id: DeviceId;
  branch_id: BranchId | undefined;
  permissions: Set<string>;
  request_id: string;
  ip: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    ctx: RequestContext;
  }
}

export function hasPermission(ctx: RequestContext, permission: string): boolean {
  return ctx.permissions.has(permission) || ctx.permissions.has('*');
}

export function requirePermission(ctx: RequestContext, permission: string): void {
  if (!hasPermission(ctx, permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }
}
