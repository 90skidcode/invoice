import { z } from 'zod';
import { IsoDateSchema, MoneySchema, QuantitySchema, UuidSchema } from './common.js';

export const PurchaseLineInputSchema = z.object({
  client_id: UuidSchema,
  item_id: UuidSchema,
  qty: QuantitySchema,
  free_qty: QuantitySchema.default('0'),
  unit_id: UuidSchema,
  rate: MoneySchema,
  discount_pct: z.string().default('0'),
  tax_rate_id: UuidSchema,
  batch_no: z.string().max(40).nullable().optional(),
  mfg_date: IsoDateSchema.nullable().optional(),
  expiry_date: IsoDateSchema.nullable().optional(),
  mrp: MoneySchema.nullable().optional(),
  location_id: UuidSchema.nullable().optional(),
  update_item_cost: z.boolean().default(true),
});

export const CreatePurchaseInvoiceInputSchema = z.object({
  client_id: UuidSchema,
  branch_id: UuidSchema,
  vendor_id: UuidSchema,
  vendor_invoice_no: z.string().min(1).max(40),
  vendor_invoice_date: IsoDateSchema,
  voucher_date: IsoDateSchema,
  place_of_supply: z.string().length(2),
  reverse_charge: z.boolean().default(false),
  receive_location_id: UuidSchema,
  notes: z.string().max(500).nullable().optional(),
  lines: z.array(PurchaseLineInputSchema).min(1).max(200),
});

export const VoidPurchaseInputSchema = z.object({
  reason: z.string().min(1).max(255),
});

export type CreatePurchaseInvoiceInput = z.infer<typeof CreatePurchaseInvoiceInputSchema>;
export type PurchaseLineInput = z.infer<typeof PurchaseLineInputSchema>;
