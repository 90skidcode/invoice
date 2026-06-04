import { z } from 'zod';
import { IsoDateSchema, MoneySchema, UuidSchema } from './common.js';

export const PaymentDirectionSchema = z.enum(['inbound', 'outbound']);
export const PaymentPartyTypeSchema = z.enum(['customer', 'vendor']);
export const PaymentModeSchema = z.enum(['cash', 'card', 'upi', 'bank', 'cheque']);

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

export type CreatePaymentInput = z.infer<typeof CreatePaymentInputSchema>;
export type PaymentMode = z.infer<typeof PaymentModeSchema>;
export type PaymentDirection = z.infer<typeof PaymentDirectionSchema>;
