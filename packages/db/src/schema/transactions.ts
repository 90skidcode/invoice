import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { timestamptz } from '../columns.js';
import { batches } from './inventory.js';
import { items } from './items.js';
import { bank_accounts, invoice_series, tax_rates, units } from './master.js';
import { branches, locations, organizations } from './organizations.js';
import { customers, vendors } from './parties.js';

// ─── Sales Invoices ───────────────────────────────────────────────────────────
export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    branch_id: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    series_id: uuid('series_id')
      .notNull()
      .references(() => invoice_series.id),
    invoice_no: varchar('invoice_no', { length: 40 }).notNull(),
    invoice_date: date('invoice_date').notNull(),
    customer_id: uuid('customer_id').references(() => customers.id),
    customer_name_snapshot: varchar('customer_name_snapshot', { length: 120 }),
    customer_gstin_snapshot: varchar('customer_gstin_snapshot', { length: 15 }),
    billing_address_snapshot: jsonb('billing_address_snapshot'),
    shipping_address_snapshot: jsonb('shipping_address_snapshot'),
    place_of_supply: varchar('place_of_supply', { length: 2 }).notNull(),
    is_intra_state: boolean('is_intra_state').notNull().default(true),
    salesperson_id: uuid('salesperson_id'),
    reference_no: varchar('reference_no', { length: 40 }),
    // Totals — stored for fast reads
    subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
    discount_total: numeric('discount_total', { precision: 14, scale: 2 }).notNull().default('0'),
    taxable_total: numeric('taxable_total', { precision: 14, scale: 2 }).notNull().default('0'),
    cgst_total: numeric('cgst_total', { precision: 14, scale: 2 }).notNull().default('0'),
    sgst_total: numeric('sgst_total', { precision: 14, scale: 2 }).notNull().default('0'),
    igst_total: numeric('igst_total', { precision: 14, scale: 2 }).notNull().default('0'),
    cess_total: numeric('cess_total', { precision: 14, scale: 2 }).notNull().default('0'),
    other_charges: numeric('other_charges', { precision: 14, scale: 2 }).notNull().default('0'),
    round_off: numeric('round_off', { precision: 14, scale: 2 }).notNull().default('0'),
    grand_total: numeric('grand_total', { precision: 14, scale: 2 }).notNull().default('0'),
    amount_paid: numeric('amount_paid', { precision: 14, scale: 2 }).notNull().default('0'),
    balance_due: numeric('balance_due', { precision: 14, scale: 2 }).notNull().default('0'),
    status: varchar('status', { length: 30 }).notNull().default('posted'),
    payment_status: varchar('payment_status', { length: 20 }).notNull().default('unpaid'),
    due_date: date('due_date'),
    invoice_hash: varchar('invoice_hash', { length: 64 }),
    signed_qr_data: text('signed_qr_data'),
    irn: varchar('irn', { length: 100 }),
    eway_bill_no: varchar('eway_bill_no', { length: 20 }),
    print_count: integer('print_count').notNull().default(0),
    notes: text('notes'),
    void_reason: text('void_reason'),
    voided_by: uuid('voided_by'),
    voided_at: timestamptz('voided_at'),
    created_at: timestamptz('created_at').notNull().default(sql`now()`),
    created_by: uuid('created_by').notNull(),
    updated_at: timestamptz('updated_at').notNull().default(sql`now()`),
    updated_by: uuid('updated_by').notNull(),
    deleted_at: timestamptz('deleted_at'),
    deleted_by: uuid('deleted_by'),
    row_version: bigint('row_version', { mode: 'number' }).notNull().default(1),
    sync_status: smallint('sync_status').notNull().default(0),
  },
  (table) => [
    index('invoices_org_date_idx').on(table.org_id, table.invoice_date),
    index('invoices_org_customer_idx').on(table.org_id, table.customer_id),
    index('invoices_org_status_idx').on(table.org_id, table.status),
    index('invoices_org_no_idx').on(table.org_id, table.invoice_no),
  ],
);

export const invoice_lines = pgTable(
  'invoice_lines',
  {
    id: uuid('id').primaryKey(),
    org_id: uuid('org_id').notNull(),
    invoice_id: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    line_no: integer('line_no').notNull(),
    item_id: uuid('item_id')
      .notNull()
      .references(() => items.id),
    item_sku_snapshot: varchar('item_sku_snapshot', { length: 40 }),
    item_name_snapshot: varchar('item_name_snapshot', { length: 160 }),
    description: text('description'),
    hsn_code: varchar('hsn_code', { length: 8 }),
    qty: numeric('qty', { precision: 14, scale: 3 }).notNull(),
    unit_id: uuid('unit_id')
      .notNull()
      .references(() => units.id),
    rate: numeric('rate', { precision: 14, scale: 2 }).notNull(),
    mrp: numeric('mrp', { precision: 14, scale: 2 }),
    discount_pct: numeric('discount_pct', { precision: 5, scale: 2 }).notNull().default('0'),
    discount_amt: numeric('discount_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    taxable_amt: numeric('taxable_amt', { precision: 14, scale: 2 }).notNull(),
    tax_rate_id: uuid('tax_rate_id')
      .notNull()
      .references(() => tax_rates.id),
    gst_rate: numeric('gst_rate', { precision: 5, scale: 2 }).notNull().default('0'),
    cgst_amt: numeric('cgst_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    sgst_amt: numeric('sgst_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    igst_amt: numeric('igst_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    cess_amt: numeric('cess_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 14, scale: 2 }).notNull(),
    batch_id: uuid('batch_id').references(() => batches.id),
    location_id: uuid('location_id')
      .notNull()
      .references(() => locations.id),
    is_free: boolean('is_free').notNull().default(false),
    created_at: timestamptz('created_at').notNull().default(sql`now()`),
  },
  (table) => [index('invoice_lines_invoice_idx').on(table.invoice_id)],
);

// ─── Credit Notes (sales returns) ──────────────────────────────────────────────
export const credit_notes = pgTable(
  'credit_notes',
  {
    id: uuid('id').primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    branch_id: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    series_id: uuid('series_id').references(() => invoice_series.id),
    credit_note_no: varchar('credit_note_no', { length: 40 }).notNull(),
    credit_note_date: date('credit_note_date').notNull(),
    original_invoice_id: uuid('original_invoice_id').references(() => invoices.id),
    original_invoice_no: varchar('original_invoice_no', { length: 40 }),
    customer_id: uuid('customer_id').references(() => customers.id),
    customer_name_snapshot: varchar('customer_name_snapshot', { length: 120 }),
    customer_gstin_snapshot: varchar('customer_gstin_snapshot', { length: 15 }),
    place_of_supply: varchar('place_of_supply', { length: 2 }).notNull(),
    is_intra_state: boolean('is_intra_state').notNull().default(true),
    reason: varchar('reason', { length: 40 }).notNull(),
    reason_note: text('reason_note'),
    refund_mode: varchar('refund_mode', { length: 20 }).notNull(),
    subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
    taxable_total: numeric('taxable_total', { precision: 14, scale: 2 }).notNull().default('0'),
    cgst_total: numeric('cgst_total', { precision: 14, scale: 2 }).notNull().default('0'),
    sgst_total: numeric('sgst_total', { precision: 14, scale: 2 }).notNull().default('0'),
    igst_total: numeric('igst_total', { precision: 14, scale: 2 }).notNull().default('0'),
    round_off: numeric('round_off', { precision: 14, scale: 2 }).notNull().default('0'),
    grand_total: numeric('grand_total', { precision: 14, scale: 2 }).notNull().default('0'),
    status: varchar('status', { length: 20 }).notNull().default('posted'),
    void_reason: text('void_reason'),
    voided_by: uuid('voided_by'),
    voided_at: timestamptz('voided_at'),
    created_at: timestamptz('created_at').notNull().default(sql`now()`),
    created_by: uuid('created_by').notNull(),
    updated_at: timestamptz('updated_at').notNull().default(sql`now()`),
    updated_by: uuid('updated_by').notNull(),
    deleted_at: timestamptz('deleted_at'),
    deleted_by: uuid('deleted_by'),
    row_version: bigint('row_version', { mode: 'number' }).notNull().default(1),
    sync_status: smallint('sync_status').notNull().default(0),
  },
  (table) => [
    index('credit_notes_org_date_idx').on(table.org_id, table.credit_note_date),
    index('credit_notes_original_idx').on(table.original_invoice_id),
  ],
);

export const credit_note_lines = pgTable(
  'credit_note_lines',
  {
    id: uuid('id').primaryKey(),
    org_id: uuid('org_id').notNull(),
    credit_note_id: uuid('credit_note_id')
      .notNull()
      .references(() => credit_notes.id),
    line_no: integer('line_no').notNull(),
    item_id: uuid('item_id')
      .notNull()
      .references(() => items.id),
    item_name_snapshot: varchar('item_name_snapshot', { length: 160 }),
    hsn_code: varchar('hsn_code', { length: 8 }),
    qty: numeric('qty', { precision: 14, scale: 3 }).notNull(),
    unit_id: uuid('unit_id')
      .notNull()
      .references(() => units.id),
    rate: numeric('rate', { precision: 14, scale: 2 }).notNull(),
    taxable_amt: numeric('taxable_amt', { precision: 14, scale: 2 }).notNull(),
    tax_rate_id: uuid('tax_rate_id')
      .notNull()
      .references(() => tax_rates.id),
    gst_rate: numeric('gst_rate', { precision: 5, scale: 2 }).notNull().default('0'),
    cgst_amt: numeric('cgst_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    sgst_amt: numeric('sgst_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    igst_amt: numeric('igst_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 14, scale: 2 }).notNull(),
    batch_id: uuid('batch_id').references(() => batches.id),
    location_id: uuid('location_id')
      .notNull()
      .references(() => locations.id),
    restore_stock: boolean('restore_stock').notNull().default(true),
    original_line_id: uuid('original_line_id'),
    created_at: timestamptz('created_at').notNull().default(sql`now()`),
  },
  (table) => [index('credit_note_lines_cn_idx').on(table.credit_note_id)],
);

// ─── Payments ─────────────────────────────────────────────────────────────────
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    payment_no: varchar('payment_no', { length: 40 }).notNull(),
    payment_date: date('payment_date').notNull(),
    direction: varchar('direction', { length: 10 }).notNull(),
    party_type: varchar('party_type', { length: 20 }).notNull(),
    party_id: uuid('party_id'),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    mode: varchar('mode', { length: 20 }).notNull(),
    account_id: uuid('account_id').references(() => bank_accounts.id),
    reference: varchar('reference', { length: 80 }),
    narration: text('narration'),
    is_voided: boolean('is_voided').notNull().default(false),
    is_contra: boolean('is_contra').notNull().default(false),
    created_at: timestamptz('created_at').notNull().default(sql`now()`),
    created_by: uuid('created_by').notNull(),
    updated_at: timestamptz('updated_at').notNull().default(sql`now()`),
    updated_by: uuid('updated_by').notNull(),
    deleted_at: timestamptz('deleted_at'),
    row_version: bigint('row_version', { mode: 'number' }).notNull().default(1),
    sync_status: smallint('sync_status').notNull().default(0),
  },
  (table) => [
    index('payments_org_date_idx').on(table.org_id, table.payment_date),
    index('payments_org_party_idx').on(table.org_id, table.party_id),
  ],
);

export const payment_allocations = pgTable('payment_allocations', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id').notNull(),
  payment_id: uuid('payment_id')
    .notNull()
    .references(() => payments.id),
  invoice_id: uuid('invoice_id').references(() => invoices.id),
  ref_table: varchar('ref_table', { length: 40 }),
  ref_id: uuid('ref_id'),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
});

// ─── Purchase Invoices ────────────────────────────────────────────────────────
export const purchase_invoices = pgTable(
  'purchase_invoices',
  {
    id: uuid('id').primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    branch_id: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    series_id: uuid('series_id').references(() => invoice_series.id),
    voucher_no: varchar('voucher_no', { length: 40 }).notNull(),
    voucher_date: date('voucher_date').notNull(),
    vendor_id: uuid('vendor_id').references(() => vendors.id),
    vendor_name_snapshot: varchar('vendor_name_snapshot', { length: 120 }),
    vendor_invoice_no: varchar('vendor_invoice_no', { length: 40 }).notNull(),
    vendor_invoice_date: date('vendor_invoice_date').notNull(),
    place_of_supply: varchar('place_of_supply', { length: 2 }).notNull(),
    is_intra_state: boolean('is_intra_state').notNull().default(true),
    reverse_charge: boolean('reverse_charge').notNull().default(false),
    receive_location_id: uuid('receive_location_id').references(() => locations.id),
    linked_po_id: uuid('linked_po_id'),
    subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
    discount_total: numeric('discount_total', { precision: 14, scale: 2 }).notNull().default('0'),
    taxable_total: numeric('taxable_total', { precision: 14, scale: 2 }).notNull().default('0'),
    cgst_total: numeric('cgst_total', { precision: 14, scale: 2 }).notNull().default('0'),
    sgst_total: numeric('sgst_total', { precision: 14, scale: 2 }).notNull().default('0'),
    igst_total: numeric('igst_total', { precision: 14, scale: 2 }).notNull().default('0'),
    other_charges: numeric('other_charges', { precision: 14, scale: 2 }).notNull().default('0'),
    round_off: numeric('round_off', { precision: 14, scale: 2 }).notNull().default('0'),
    grand_total: numeric('grand_total', { precision: 14, scale: 2 }).notNull().default('0'),
    amount_paid: numeric('amount_paid', { precision: 14, scale: 2 }).notNull().default('0'),
    balance_due: numeric('balance_due', { precision: 14, scale: 2 }).notNull().default('0'),
    payment_status: varchar('payment_status', { length: 20 }).notNull().default('unpaid'),
    due_date: date('due_date'),
    eway_bill_no: varchar('eway_bill_no', { length: 20 }),
    notes: text('notes'),
    status: varchar('status', { length: 20 }).notNull().default('posted'),
    created_at: timestamptz('created_at').notNull().default(sql`now()`),
    created_by: uuid('created_by').notNull(),
    updated_at: timestamptz('updated_at').notNull().default(sql`now()`),
    updated_by: uuid('updated_by').notNull(),
    deleted_at: timestamptz('deleted_at'),
    row_version: bigint('row_version', { mode: 'number' }).notNull().default(1),
    sync_status: smallint('sync_status').notNull().default(0),
  },
  (table) => [
    index('purchase_invoices_org_date_idx').on(table.org_id, table.voucher_date),
    index('purchase_invoices_org_vendor_idx').on(table.org_id, table.vendor_id),
    index('purchase_invoices_vendor_no_idx').on(
      table.org_id,
      table.vendor_id,
      table.vendor_invoice_no,
    ),
  ],
);

export const purchase_invoice_lines = pgTable('purchase_invoice_lines', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id').notNull(),
  purchase_invoice_id: uuid('purchase_invoice_id')
    .notNull()
    .references(() => purchase_invoices.id),
  line_no: integer('line_no').notNull(),
  item_id: uuid('item_id')
    .notNull()
    .references(() => items.id),
  item_name_snapshot: varchar('item_name_snapshot', { length: 160 }),
  hsn_code: varchar('hsn_code', { length: 8 }),
  qty: numeric('qty', { precision: 14, scale: 3 }).notNull(),
  free_qty: numeric('free_qty', { precision: 14, scale: 3 }).notNull().default('0'),
  unit_id: uuid('unit_id')
    .notNull()
    .references(() => units.id),
  rate: numeric('rate', { precision: 14, scale: 2 }).notNull(),
  mrp: numeric('mrp', { precision: 14, scale: 2 }),
  discount_pct: numeric('discount_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  discount_amt: numeric('discount_amt', { precision: 14, scale: 2 }).notNull().default('0'),
  taxable_amt: numeric('taxable_amt', { precision: 14, scale: 2 }).notNull(),
  tax_rate_id: uuid('tax_rate_id')
    .notNull()
    .references(() => tax_rates.id),
  gst_rate: numeric('gst_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  cgst_amt: numeric('cgst_amt', { precision: 14, scale: 2 }).notNull().default('0'),
  sgst_amt: numeric('sgst_amt', { precision: 14, scale: 2 }).notNull().default('0'),
  igst_amt: numeric('igst_amt', { precision: 14, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 14, scale: 2 }).notNull(),
  batch_no: varchar('batch_no', { length: 40 }),
  batch_id: uuid('batch_id').references(() => batches.id),
  mfg_date: date('mfg_date'),
  expiry_date: date('expiry_date'),
  location_id: uuid('location_id').references(() => locations.id),
  update_item_cost: boolean('update_item_cost').notNull().default(true),
  is_charge: boolean('is_charge').notNull().default(false),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
});

// ─── Audit Log — append-only (§1.8) ──────────────────────────────────────────
export const audit_log = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey(),
    org_id: uuid('org_id').notNull(),
    at: timestamptz('at').notNull().default(sql`now()`),
    user_id: uuid('user_id').notNull(),
    device_id: uuid('device_id'),
    ip: varchar('ip', { length: 50 }),
    entity_table: varchar('entity_table', { length: 40 }).notNull(),
    entity_id: uuid('entity_id').notNull(),
    action: varchar('action', { length: 20 }).notNull(),
    before_json: jsonb('before_json'),
    after_json: jsonb('after_json'),
    note: text('note'),
  },
  (table) => [
    index('audit_log_org_entity_idx').on(table.org_id, table.entity_table, table.entity_id),
    index('audit_log_org_user_idx').on(table.org_id, table.user_id),
    index('audit_log_org_at_idx').on(table.org_id, table.at),
  ],
);

// ─── Invoice Drafts (transient) ───────────────────────────────────────────────
export const invoice_drafts = pgTable('invoice_drafts', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id').notNull(),
  device_id: uuid('device_id').notNull(),
  created_by: uuid('created_by').notNull(),
  data: jsonb('data').notNull(),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
  updated_at: timestamptz('updated_at').notNull().default(sql`now()`),
});

// ─── Idempotency Keys (§6.7) — cache create responses for 24h ─────────────────
export const idempotency_keys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').primaryKey(),
    org_id: uuid('org_id').notNull(),
    idem_key: varchar('idem_key', { length: 80 }).notNull(),
    endpoint: varchar('endpoint', { length: 120 }).notNull(),
    status_code: integer('status_code').notNull(),
    response_json: jsonb('response_json').notNull(),
    created_at: timestamptz('created_at').notNull().default(sql`now()`),
  },
  (table) => [
    uniqueIndex('idempotency_keys_unique_idx').on(table.org_id, table.idem_key, table.endpoint),
  ],
);

// ─── Sync Outbox ───────────────────────────────────────────────────────────────
export const sync_outbox = pgTable('sync_outbox', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id').notNull(),
  device_id: uuid('device_id').notNull(),
  entity: varchar('entity', { length: 40 }).notNull(),
  entity_id: uuid('entity_id').notNull(),
  op: varchar('op', { length: 10 }).notNull(),
  payload: jsonb('payload').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  attempts: smallint('attempts').notNull().default(0),
  last_error: text('last_error'),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
  processed_at: timestamptz('processed_at'),
});
