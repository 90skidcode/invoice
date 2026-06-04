import { z } from 'zod';
import { GstinSchema, IsoDateSchema, MoneySchema, PanSchema, UuidSchema } from './common.js';

export const CustomerTypeSchema = z.enum(['Individual', 'Business', 'Government']);
export const CustomerStatusSchema = z.enum(['Active', 'Inactive', 'Blocked']);
export const GstRegTypeSchema = z.enum([
  'Regular',
  'Composition',
  'Unregistered',
  'Consumer',
  'SEZ',
  'Overseas',
]);

export const AddressSchema = z.object({
  line1: z.string().max(120).nullable().optional(),
  line2: z.string().max(120).nullable().optional(),
  city: z.string().max(60).nullable().optional(),
  state: z.string().max(60).nullable().optional(),
  state_code: z.string().length(2).nullable().optional(),
  pincode: z.string().max(10).nullable().optional(),
  country: z.string().max(60).default('India'),
});

export const CreateCustomerInputSchema = z.object({
  client_id: UuidSchema,
  customer_code: z.string().max(20).optional(),
  name: z.string().min(1).max(120),
  display_name: z.string().max(120).nullable().optional(),
  type: CustomerTypeSchema.default('Individual'),
  phone: z.string().min(10).max(15),
  alt_phone: z.string().max(15).nullable().optional(),
  email: z.string().email().max(120).nullable().optional(),
  whatsapp_number: z.string().max(15).nullable().optional(),
  gstin: GstinSchema.nullable().optional(),
  gst_reg_type: GstRegTypeSchema.default('Consumer'),
  pan: PanSchema.nullable().optional(),
  place_of_supply: z.string().length(2).nullable().optional(),
  billing_address: AddressSchema.optional(),
  shipping_address: AddressSchema.nullable().optional(),
  shipping_same_as_billing: z.boolean().default(true),
  credit_limit: MoneySchema.default('0.00'),
  credit_days: z.number().int().min(0).default(0),
  block_on_limit_breach: z.boolean().default(false),
  customer_group_id: UuidSchema.nullable().optional(),
  price_tier_id: UuidSchema.nullable().optional(),
  opening_balance: MoneySchema.default('0.00'),
  opening_as_of_date: IsoDateSchema.nullable().optional(),
  status: CustomerStatusSchema.default('Active'),
  tags: z.array(z.string()).optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateCustomerInputSchema = CreateCustomerInputSchema.partial().omit({
  client_id: true,
});

export const CustomerLookupResultSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  phone: z.string(),
  price_tier_id: UuidSchema.nullable(),
  credit_status: z.enum(['ok', 'near_limit', 'over_limit', 'blocked']),
  balance_due: MoneySchema,
});

export type CreateCustomerInput = z.infer<typeof CreateCustomerInputSchema>;
export type UpdateCustomerInput = z.infer<typeof UpdateCustomerInputSchema>;
export type CustomerLookupResult = z.infer<typeof CustomerLookupResultSchema>;
export type CustomerType = z.infer<typeof CustomerTypeSchema>;
export type CustomerStatus = z.infer<typeof CustomerStatusSchema>;
