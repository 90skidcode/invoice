import { z } from 'zod';
import { IsoDateSchema, MoneySchema, QuantitySchema, UuidSchema } from './common.js';

export const InvoiceStatusSchema = z.enum([
  'draft',
  'posted',
  'voided',
  'fully_returned',
  'partially_returned',
]);

export const PaymentStatusSchema = z.enum(['unpaid', 'partial', 'paid']);

export const InvoiceLineInputSchema = z.object({
  client_id: UuidSchema,
  item_id: UuidSchema,
  description: z.string().max(255).optional(),
  qty: QuantitySchema,
  unit_id: UuidSchema,
  rate: MoneySchema,
  discount_pct: z.string().default('0'),
  discount_amt: MoneySchema.optional(),
  tax_rate_id: UuidSchema,
  batch_id: UuidSchema.nullable().optional(),
  location_id: UuidSchema,
  is_free: z.boolean().default(false),
  mrp: MoneySchema.nullable().optional(),
});

export const OtherChargeInputSchema = z.object({
  type: z.enum(['freight', 'loading', 'handling', 'insurance', 'other']),
  description: z.string().max(120).optional(),
  amount: MoneySchema,
  gst_applicable: z.boolean(),
  tax_rate_id: UuidSchema.nullable().optional(),
});

export const PaymentLineInputSchema = z.object({
  mode: z.enum(['cash', 'card', 'upi', 'bank', 'cheque', 'credit']),
  amount: MoneySchema,
  account_id: UuidSchema.nullable().optional(),
  reference: z.string().max(80).nullable().optional(),
});

export const CreateInvoiceInputSchema = z.object({
  client_id: UuidSchema,
  series_id: UuidSchema,
  branch_id: UuidSchema,
  invoice_date: IsoDateSchema,
  customer_id: UuidSchema.nullable().optional(),
  place_of_supply: z.string().length(2),
  salesperson_id: UuidSchema.nullable().optional(),
  reference_no: z.string().max(40).nullable().optional(),
  lines: z.array(InvoiceLineInputSchema).min(1).max(200),
  other_charges: z.array(OtherChargeInputSchema).optional(),
  payments: z.array(PaymentLineInputSchema).optional(),
  notes: z.string().max(500).nullable().optional(),
  auto_print: z.boolean().default(false),
});

export const UpdateInvoiceInputSchema = z.object({
  invoice_date: IsoDateSchema,
  customer_id: UuidSchema.nullable().optional(),
  place_of_supply: z.string().length(2),
  salesperson_id: UuidSchema.nullable().optional(),
  reference_no: z.string().max(40).nullable().optional(),
  lines: z.array(InvoiceLineInputSchema).min(1).max(200),
  notes: z.string().max(500).nullable().optional(),
});

export const VoidInvoiceInputSchema = z.object({
  reason: z.string().min(1).max(255),
  approver_pin: z.string().optional(),
});

export const InvoiceTotalsSchema = z.object({
  subtotal: MoneySchema,
  discount_total: MoneySchema,
  taxable_total: MoneySchema,
  cgst: MoneySchema,
  sgst: MoneySchema,
  igst: MoneySchema,
  cess: MoneySchema,
  other_charges: MoneySchema,
  round_off: MoneySchema,
  grand_total: MoneySchema,
  amount_paid: MoneySchema,
  balance_due: MoneySchema,
});

export const InvoiceLineSchema = z.object({
  id: UuidSchema,
  line_no: z.number().int(),
  item: z.object({
    id: UuidSchema,
    sku_snapshot: z.string(),
    name_snapshot: z.string(),
  }),
  description: z.string().nullable(),
  hsn_code: z.string().nullable(),
  qty: QuantitySchema,
  unit_id: UuidSchema,
  rate: MoneySchema,
  mrp: MoneySchema.nullable(),
  discount_pct: z.string(),
  discount_amt: MoneySchema,
  taxable_amt: MoneySchema,
  tax_rate_id: UuidSchema,
  gst_rate: z.string(),
  cgst_amt: MoneySchema,
  sgst_amt: MoneySchema,
  igst_amt: MoneySchema,
  cess_amt: MoneySchema,
  total: MoneySchema,
  batch_id: UuidSchema.nullable(),
  location_id: UuidSchema,
  is_free: z.boolean(),
});

export const InvoiceSchema = z.object({
  id: UuidSchema,
  org_id: UuidSchema,
  branch_id: UuidSchema,
  series_id: UuidSchema,
  invoice_no: z.string(),
  invoice_date: IsoDateSchema,
  customer: z.object({
    id: UuidSchema.nullable(),
    name_snapshot: z.string().nullable(),
    gstin_snapshot: z.string().nullable(),
  }),
  place_of_supply: z.string(),
  salesperson_id: UuidSchema.nullable(),
  reference_no: z.string().nullable(),
  totals: InvoiceTotalsSchema,
  status: InvoiceStatusSchema,
  payment_status: PaymentStatusSchema,
  lines: z.array(InvoiceLineSchema),
  invoice_hash: z.string(),
  signed_qr_data: z.string().nullable(),
  irn: z.string().nullable(),
  eway_bill_no: z.string().nullable(),
  notes: z.string().nullable(),
  row_version: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type CreateInvoiceInput = z.infer<typeof CreateInvoiceInputSchema>;
export type UpdateInvoiceInput = z.infer<typeof UpdateInvoiceInputSchema>;
export type InvoiceLineInput = z.infer<typeof InvoiceLineInputSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;
export type InvoiceTotals = z.infer<typeof InvoiceTotalsSchema>;
