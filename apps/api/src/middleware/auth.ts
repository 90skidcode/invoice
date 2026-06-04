import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { UnauthenticatedError } from '../errors.js';
import type { OrgId, UserId, DeviceId, BranchId } from '@counter/utils';
import { brandId } from '@counter/utils';

export interface JwtPayload {
  sub: string;
  org_id: string;
  device_id: string;
  branch_id?: string;
  permissions: string[];
  iat: number;
  exp: number;
}

export async function authHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
    const payload = request.user as JwtPayload;

    request.ctx = {
      user_id: brandId<UserId>(payload.sub),
      org_id: brandId<OrgId>(payload.org_id),
      device_id: brandId<DeviceId>(payload.device_id),
      branch_id: payload.branch_id ? brandId<BranchId>(payload.branch_id) : undefined,
      permissions: new Set(payload.permissions),
      request_id: (request.headers['x-request-id'] as string) ?? crypto.randomUUID(),
      ip: request.ip,
    };
  } catch {
    throw new UnauthenticatedError('Invalid or expired token');
  }
}
