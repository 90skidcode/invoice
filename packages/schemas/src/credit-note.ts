import { z } from 'zod';
import { IsoDateSchema, MoneySchema, QuantitySchema, UuidSchema } from './common.js';

export const CreditNoteReasonSchema = z.enum([
  'damaged',
  'wrong_item',
  'customer_cancel',
  'price_correction',
  'quality_issue',
  'other',
]);

export const RefundModeSchema = z.enum(['cash', 'upi', 'bank', 'adjust_ledger', 'replacement']);

export const CreditNoteLineInputSchema = z.object({
  item_id: UuidSchema,
  original_line_id: UuidSchema.nullable().optional(),
  qty: QuantitySchema,
  unit_id: UuidSchema,
  rate: MoneySchema,
  tax_rate_id: UuidSchema,
  batch_id: UuidSchema.nullable().optional(),
  location_id: UuidSchema,
  restore_stock: z.boolean().default(true),
});

export const CreateCreditNoteInputSchema = z.object({
  client_id: UuidSchema,
  branch_id: UuidSchema,
  credit_note_date: IsoDateSchema,
  original_invoice_id: UuidSchema,
  reason: CreditNoteReasonSchema,
  reason_note: z.string().max(255).nullable().optional(),
  refund_mode: RefundModeSchema,
  account_id: UuidSchema.nullable().optional(),
  lines: z.array(CreditNoteLineInputSchema).min(1).max(200),
});

export const VoidCreditNoteInputSchema = z.object({
  reason: z.string().min(1).max(255),
});

export type CreateCreditNoteInput = z.infer<typeof CreateCreditNoteInputSchema>;
