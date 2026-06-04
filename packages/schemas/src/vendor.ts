import { z } from 'zod';
import { GstinSchema, IsoDateSchema, MoneySchema, PanSchema, UuidSchema } from './common.js';

export const VendorStatusSchema = z.enum(['Active', 'Inactive', 'Blocked']);

export const CreateVendorInputSchema = z.object({
  client_id: UuidSchema,
  vendor_code: z.string().max(20).optional(),
  name: z.string().min(1).max(120),
  type: z.enum(['Individual', 'Business', 'Government']).default('Business'),
  phone: z.string().max(15).nullable().optional(),
  email: z.string().email().max(120).nullable().optional(),
  gstin: GstinSchema.nullable().optional(),
  pan: PanSchema.nullable().optional(),
  bank_account_no: z.string().max(30).nullable().optional(),
  bank_ifsc: z.string().max(15).nullable().optional(),
  bank_name: z.string().max(80).nullable().optional(),
  upi_id: z.string().max(80).nullable().optional(),
  credit_days: z.number().int().min(0).default(0),
  opening_balance: MoneySchema.default('0.00'),
  opening_as_of_date: IsoDateSchema.nullable().optional(),
  status: VendorStatusSchema.default('Active'),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateVendorInputSchema = CreateVendorInputSchema.partial().omit({ client_id: true });

export type CreateVendorInput = z.infer<typeof CreateVendorInputSchema>;
export type UpdateVendorInput = z.infer<typeof UpdateVendorInputSchema>;
