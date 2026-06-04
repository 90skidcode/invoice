import { z } from 'zod';
import { IsoDateSchema, MoneySchema, QuantitySchema, UuidSchema } from './common.js';

// Signed quantity (adjustments can be negative): "-5", "5", "10.5"
const SignedQtySchema = z
  .string()
  .regex(/^-?\d+(\.\d{1,3})?$/, 'Must be a signed quantity (e.g. "-5", "10.500")');

export const StockAdjustmentReasonSchema = z.enum([
  'damaged',
  'expired',
  'count_variance',
  'found',
  'theft',
  'quality',
  'other',
]);

export const StockAdjustmentLineInputSchema = z.object({
  item_id: UuidSchema,
  batch_id: UuidSchema.nullable().optional(),
  qty_change: SignedQtySchema,
  rate: MoneySchema.nullable().optional(),
  note: z.string().max(120).nullable().optional(),
});

export const CreateStockAdjustmentInputSchema = z.object({
  client_id: UuidSchema,
  adjustment_date: IsoDateSchema,
  location_id: UuidSchema,
  reason: StockAdjustmentReasonSchema,
  reason_note: z.string().max(255).nullable().optional(),
  lines: z.array(StockAdjustmentLineInputSchema).min(1).max(200),
});

export const StockTransferLineInputSchema = z.object({
  item_id: UuidSchema,
  batch_id: UuidSchema.nullable().optional(),
  qty: QuantitySchema,
});

export const CreateStockTransferInputSchema = z
  .object({
    client_id: UuidSchema,
    transfer_date: IsoDateSchema,
    from_location_id: UuidSchema,
    to_location_id: UuidSchema,
    mode: z.enum(['direct', 'in_transit']).default('direct'),
    transporter: z.string().max(120).nullable().optional(),
    vehicle_no: z.string().max(20).nullable().optional(),
    reason: z.string().max(255).nullable().optional(),
    lines: z.array(StockTransferLineInputSchema).min(1).max(200),
  })
  .refine((d) => d.from_location_id !== d.to_location_id, {
    message: 'From and To locations must differ',
    path: ['to_location_id'],
  });

export type CreateStockAdjustmentInput = z.infer<typeof CreateStockAdjustmentInputSchema>;
export type CreateStockTransferInput = z.infer<typeof CreateStockTransferInputSchema>;
