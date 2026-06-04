import { z } from 'zod';
import { IsoDateSchema, MoneySchema, QuantitySchema, UuidSchema } from './common.js';

export const ItemStatusSchema = z.enum(['active', 'inactive', 'discontinued']);

export const ItemPricingSchema = z.object({
  mrp: MoneySchema.nullable(),
  sale_price: MoneySchema,
  purchase_price: MoneySchema.nullable(),
  tax_inclusive: z.boolean(),
  min_sale_price: MoneySchema.nullable(),
  max_discount_pct: z.string().nullable(),
});

export const ItemFlagsSchema = z.object({
  track_inventory: z.boolean(),
  is_service: z.boolean(),
  is_batched: z.boolean(),
  allow_negative_stock: z.boolean(),
  has_variants: z.boolean(),
});

export const ItemStockLevelsSchema = z.object({
  reorder_level: QuantitySchema.nullable(),
  reorder_qty: QuantitySchema.nullable(),
  max_stock: QuantitySchema.nullable(),
  lead_time_days: z.number().int().nullable(),
  shelf_life_days: z.number().int().nullable(),
});

export const BarcodeSchema = z.object({
  id: UuidSchema,
  barcode: z.string().min(1).max(40),
  symbology: z.enum(['EAN13', 'EAN8', 'UPCA', 'CODE128', 'CODE39', 'QR', 'CUSTOM']),
  unit_id: UuidSchema,
  is_primary: z.boolean(),
});

export const CreateItemInputSchema = z.object({
  client_id: UuidSchema,
  sku: z.string().min(1).max(40),
  name: z.string().min(1).max(160),
  short_name: z.string().max(40).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  category_id: UuidSchema.nullable().optional(),
  brand_id: UuidSchema.nullable().optional(),
  hsn_code: z
    .string()
    .regex(/^\d{4,8}$/)
    .nullable()
    .optional(),
  primary_unit_id: UuidSchema,
  tax_rate_id: UuidSchema,
  pricing: ItemPricingSchema,
  flags: ItemFlagsSchema,
  stock_levels: ItemStockLevelsSchema.optional(),
  opening_stock: z
    .array(
      z.object({
        location_id: UuidSchema,
        qty: QuantitySchema,
        rate: MoneySchema,
        as_of_date: IsoDateSchema,
      }),
    )
    .optional(),
  barcodes: z.array(BarcodeSchema.omit({ id: true })).optional(),
  status: ItemStatusSchema.default('active'),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

export const UpdateItemInputSchema = CreateItemInputSchema.partial()
  .omit({ client_id: true })
  .extend({
    // Nested objects must be partial too — .partial() only affects top-level keys.
    pricing: ItemPricingSchema.partial().optional(),
    flags: ItemFlagsSchema.partial().optional(),
    stock_levels: ItemStockLevelsSchema.partial().optional(),
  });

export const ItemLookupResultSchema = z.object({
  id: UuidSchema,
  sku: z.string(),
  name: z.string(),
  sale_price: MoneySchema,
  current_stock: QuantitySchema.nullable(),
  unit: z.string(),
  is_batched: z.boolean(),
  tax_rate_id: UuidSchema,
  hsn_code: z.string().nullable(),
});

export type CreateItemInput = z.infer<typeof CreateItemInputSchema>;
export type UpdateItemInput = z.infer<typeof UpdateItemInputSchema>;
export type ItemLookupResult = z.infer<typeof ItemLookupResultSchema>;
export type ItemStatus = z.infer<typeof ItemStatusSchema>;
export type BarcodeInput = z.infer<typeof BarcodeSchema>;
