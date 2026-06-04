import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  smallint,
  date,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { timestamptz } from '../columns.js';
import { organizations, locations } from './organizations.js';
import { items } from './items.js';

// ─── Batches ──────────────────────────────────────────────────────────────────
export const batches = pgTable(
  'batches',
  {
    id: uuid('id').primaryKey(),
    org_id: uuid('org_id').notNull().references(() => organizations.id),
    item_id: uuid('item_id').notNull().references(() => items.id),
    batch_no: varchar('batch_no', { length: 40 }).notNull(),
    mfg_date: date('mfg_date'),
    expiry_date: date('expiry_date'),
    mrp: numeric('mrp', { precision: 14, scale: 2 }),
    cost: numeric('cost', { precision: 14, scale: 2 }),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    origin_type: varchar('origin_type', { length: 30 }),
    origin_ref_id: uuid('origin_ref_id'),
    recall_reason: text('recall_reason'),
    recalled_at: timestamptz('recalled_at'),
    recalled_by: uuid('recalled_by'),
    created_at: timestamptz('created_at').notNull().default(sql`now()`),
    created_by: uuid('created_by').notNull(),
  },
  (table) => [
    index('batches_org_item_idx').on(table.org_id, table.item_id),
    index('batches_expiry_idx').on(table.org_id, table.expiry_date),
  ],
);

// ─── Stock Ledger — append-only (§1.2, §1.3) ─────────────────────────────────
// DO NOT add UPDATE or DELETE triggers/permissions on this table.
export const stock_ledger = pgTable(
  'stock_ledger',
  {
    id: uuid('id').primaryKey(),
    org_id: uuid('org_id').notNull().references(() => organizations.id),
    item_id: uuid('item_id').notNull().references(() => items.id),
    location_id: uuid('location_id').notNull().references(() => locations.id),
    batch_id: uuid('batch_id').references(() => batches.id),
    txn_type: varchar('txn_type', { length: 40 }).notNull(),
    txn_date: timestamptz('txn_date').notNull(),
    qty_in: numeric('qty_in', { precision: 14, scale: 3 }).notNull().default('0'),
    qty_out: numeric('qty_out', { precision: 14, scale: 3 }).notNull().default('0'),
    balance_qty: numeric('balance_qty', { precision: 14, scale: 3 }).notNull(),
    rate: numeric('rate', { precision: 14, scale: 2 }),
    value: numeric('value', { precision: 14, scale: 2 }),
    ref_table: varchar('ref_table', { length: 40 }),
    ref_id: uuid('ref_id'),
    note: text('note'),
    created_at: timestamptz('created_at').notNull().default(sql`now()`),
    created_by: uuid('created_by').notNull(),
    device_id: uuid('device_id'),
  },
  (table) => [
    index('stock_ledger_org_item_loc_idx').on(
      table.org_id,
      table.item_id,
      table.location_id,
      table.txn_date,
    ),
    index('stock_ledger_org_item_idx').on(table.org_id, table.item_id),
    index('stock_ledger_batch_idx').on(table.batch_id),
  ],
);

// ─── Stock Adjustments ────────────────────────────────────────────────────────
export const stock_adjustments = pgTable('stock_adjustments', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id').notNull().references(() => organizations.id),
  adjustment_no: varchar('adjustment_no', { length: 40 }).notNull(),
  adjustment_date: date('adjustment_date').notNull(),
  location_id: uuid('location_id').notNull().references(() => locations.id),
  reason: varchar('reason', { length: 30 }).notNull(),
  reason_note: text('reason_note'),
  status: varchar('status', { length: 20 }).notNull().default('posted'),
  total_value: numeric('total_value', { precision: 14, scale: 2 }),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
  created_by: uuid('created_by').notNull(),
  updated_at: timestamptz('updated_at').notNull().default(sql`now()`),
  updated_by: uuid('updated_by').notNull(),
  deleted_at: timestamptz('deleted_at'),
  row_version: smallint('row_version').notNull().default(1),
});

export const stock_adjustment_lines = pgTable('stock_adjustment_lines', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id').notNull(),
  adjustment_id: uuid('adjustment_id').notNull().references(() => stock_adjustments.id),
  item_id: uuid('item_id').notNull().references(() => items.id),
  batch_id: uuid('batch_id').references(() => batches.id),
  qty_change: numeric('qty_change', { precision: 14, scale: 3 }).notNull(),
  rate: numeric('rate', { precision: 14, scale: 2 }),
  value: numeric('value', { precision: 14, scale: 2 }),
  note: text('note'),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
});

// ─── Stock Transfers ──────────────────────────────────────────────────────────
export const stock_transfers = pgTable('stock_transfers', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id').notNull().references(() => organizations.id),
  transfer_no: varchar('transfer_no', { length: 40 }).notNull(),
  transfer_date: date('transfer_date').notNull(),
  from_location_id: uuid('from_location_id').notNull().references(() => locations.id),
  to_location_id: uuid('to_location_id').notNull().references(() => locations.id),
  mode: varchar('mode', { length: 20 }).notNull().default('direct'),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  transporter: varchar('transporter', { length: 120 }),
  vehicle_no: varchar('vehicle_no', { length: 20 }),
  expected_by: date('expected_by'),
  reason: text('reason'),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
  created_by: uuid('created_by').notNull(),
  updated_at: timestamptz('updated_at').notNull().default(sql`now()`),
  updated_by: uuid('updated_by').notNull(),
  deleted_at: timestamptz('deleted_at'),
  row_version: smallint('row_version').notNull().default(1),
});

export const stock_transfer_lines = pgTable('stock_transfer_lines', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id').notNull(),
  transfer_id: uuid('transfer_id').notNull().references(() => stock_transfers.id),
  item_id: uuid('item_id').notNull().references(() => items.id),
  batch_id: uuid('batch_id').references(() => batches.id),
  qty: numeric('qty', { precision: 14, scale: 3 }).notNull(),
  qty_received: numeric('qty_received', { precision: 14, scale: 3 }).default('0'),
  rate: numeric('rate', { precision: 14, scale: 2 }),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
});
