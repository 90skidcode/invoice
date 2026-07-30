import { z } from 'zod';
import { IsoDateSchema, MoneySchema, UuidSchema } from './common.js';

export const PaymentDirectionSchema = z.enum(['inbound', 'outbound']);
export const PaymentPartyTypeSchema = z.enum(['customer', 'vendor']);
export const PaymentModeSchema = z.string().min(1).max(20);

export const PaymentAllocationInputSchema = z.object({
  invoice_id: UuidSchema,
  amount: MoneySchema,
});

export const CreatePaymentInputSchema = z.object({
  client_id: UuidSchema,
  payment_date: IsoDateSchema,
  direction: PaymentDirectionSchema.default('inbound'),
  party_type: PaymentPartyTypeSchema.default('customer'),
  party_id: UuidSchema.nullable(),
  amount: MoneySchema,
  mode: PaymentModeSchema,
  account_id: UuidSchema.nullable().optional(),
  reference: z.string().max(80).nullable().optional(),
  narration: z.string().max(255).nullable().optional(),
  allocations: z.array(PaymentAllocationInputSchema).optional(),
  discount_given: MoneySchema.optional(),
  write_off: MoneySchema.optional(),
});

export const VoidPaymentInputSchema = z.object({
  reason: z.string().min(1).max(255),
});

// ── Payment Modes (Master Setup) ──────────────────────────────────────────────
export const CreatePaymentModeInputSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(100),
  type: z.string().min(1).max(20),
  badge_color: z.string().max(50).optional(),
  order_index: z.number().int().min(0).optional(),
});

export const UpdatePaymentModeInputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.string().min(1).max(20).optional(),
  badge_color: z.string().max(50).optional(),
  order_index: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export const PaymentModeResponseSchema = z.object({
  id: UuidSchema,
  org_id: UuidSchema,
  name: z.string(),
  type: z.string(),
  badge_color: z.string(),
  order_index: z.number(),
  is_active: z.boolean(),
  created_at: z.string(),
  created_by: UuidSchema,
  updated_at: z.string(),
  updated_by: UuidSchema,
  deleted_at: z.string().nullable(),
});

export type CreatePaymentInput = z.infer<typeof CreatePaymentInputSchema>;
export type CreatePaymentModeInput = z.infer<typeof CreatePaymentModeInputSchema>;
export type UpdatePaymentModeInput = z.infer<typeof UpdatePaymentModeInputSchema>;
export type PaymentModeResponse = z.infer<typeof PaymentModeResponseSchema>;
export type PaymentMode = z.infer<typeof PaymentModeSchema>;
export type PaymentDirection = z.infer<typeof PaymentDirectionSchema>;
