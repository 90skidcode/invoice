import { z } from 'zod';
import { UuidSchema } from './common.js';

export const LoginInputSchema = z.object({
  identifier: z.string().min(1),
  credential: z.string().min(1),
  credential_type: z.enum(['pin', 'password', 'otp']),
  org_code: z.string().optional(),
  device: z.object({
    id: UuidSchema,
    name: z.string().min(1).max(80),
    platform: z.enum(['win', 'mac', 'linux', 'android', 'ios', 'web']),
    app_version: z.string(),
    install_id: z.string(),
  }),
});

export const RefreshTokenInputSchema = z.object({
  refresh_token: z.string().min(1),
});

export const OtpSendInputSchema = z.object({
  phone: z.string().min(10),
  purpose: z.enum(['reset_pin', 'login', '2fa_setup']),
});

export const OtpVerifyInputSchema = z.object({
  phone: z.string().min(10),
  otp: z.string().length(6),
  purpose: z.enum(['reset_pin', 'login', '2fa_setup']),
});

export const PinResetInputSchema = z.object({
  reset_token: z.string().min(1),
  new_pin: z.string().min(4).max(8),
});

export const UserInfoSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  role: z.string(),
  branches: z.array(z.object({ id: UuidSchema, name: z.string() })),
});

export const OrgInfoSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  gstin: z.string().nullable(),
  industry_profile: z.string(),
  state_code: z.string(),
});

export const LoginResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  user: UserInfoSchema,
  org: OrgInfoSchema,
  permissions: z.array(z.string()),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type UserInfo = z.infer<typeof UserInfoSchema>;
export type OrgInfo = z.infer<typeof OrgInfoSchema>;
