import { z } from 'zod';
import { IsoDateSchema, QuantitySchema, UuidSchema } from './common.js';

export const CreateProductionOrderInputSchema = z.object({
  finished_item_id: UuidSchema,
  produced_qty: QuantitySchema,
  location_id: UuidSchema.nullable().optional(),
  production_date: IsoDateSchema.nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export type CreateProductionOrderInput = z.infer<typeof CreateProductionOrderInputSchema>;
