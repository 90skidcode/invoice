import { z } from 'zod';
import { QuantitySchema, UuidSchema } from './common.js';

export const BomLineInputSchema = z.object({
  raw_item_id: UuidSchema,
  qty: QuantitySchema,
  unit_id: UuidSchema,
  wastage_pct: z.string().default('0'),
});

export const CreateBomInputSchema = z.object({
  finished_item_id: UuidSchema,
  name: z.string().max(160).nullable().optional(),
  output_qty: QuantitySchema,
  output_unit_id: UuidSchema,
  labor_cost: z.string().default('0'),
  overhead_cost: z.string().default('0'),
  notes: z.string().max(500).nullable().optional(),
  is_active: z.boolean().default(true),
  lines: z.array(BomLineInputSchema).min(1).max(200),
});

export const UpdateBomInputSchema = z.object({
  name: z.string().max(160).nullable().optional(),
  output_qty: QuantitySchema,
  output_unit_id: UuidSchema,
  labor_cost: z.string().default('0'),
  overhead_cost: z.string().default('0'),
  notes: z.string().max(500).nullable().optional(),
  is_active: z.boolean().default(true),
  lines: z.array(BomLineInputSchema).min(1).max(200),
});

export type BomLineInput = z.infer<typeof BomLineInputSchema>;
export type CreateBomInput = z.infer<typeof CreateBomInputSchema>;
export type UpdateBomInput = z.infer<typeof UpdateBomInputSchema>;
