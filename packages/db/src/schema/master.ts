import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { timestamptz } from '../columns.js';
import { organizations } from './organizations.js';

// ─── Tax Rates ───────────────────────────────────────────────────────────────
export const tax_rates = pgTable('tax_rates', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: varchar('name', { length: 80 }).notNull(),
  total_rate: numeric('total_rate', { precision: 5, scale: 2 }).notNull(),
  cgst_rate: numeric('cgst_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  sgst_rate: numeric('sgst_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  igst_rate: numeric('igst_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  cess_rate: numeric('cess_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  effective_from: date('effective_from').notNull(),
  effective_to: date('effective_to'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
  updated_at: timestamptz('updated_at').notNull().default(sql`now()`),
  row_version: bigint('row_version', { mode: 'number' }).notNull().default(1),
});

// ─── Units ────────────────────────────────────────────────────────────────────
export const units = pgTable('units', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: varchar('name', { length: 40 }).notNull(),
  abbreviation: varchar('abbreviation', { length: 10 }).notNull(),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
  deleted_at: timestamptz('deleted_at'),
  row_version: bigint('row_version', { mode: 'number' }).notNull().default(1),
});

// ─── Categories ───────────────────────────────────────────────────────────────
export const categories = pgTable('categories', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  parent_id: uuid('parent_id'),
  name: varchar('name', { length: 80 }).notNull(),
  default_tax_rate_id: uuid('default_tax_rate_id').references(() => tax_rates.id),
  default_hsn_code: varchar('default_hsn_code', { length: 8 }),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
  deleted_at: timestamptz('deleted_at'),
  row_version: bigint('row_version', { mode: 'number' }).notNull().default(1),
});

// ─── Brands ───────────────────────────────────────────────────────────────────
export const brands = pgTable('brands', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: varchar('name', { length: 80 }).notNull(),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
  deleted_at: timestamptz('deleted_at'),
  row_version: bigint('row_version', { mode: 'number' }).notNull().default(1),
});

// ─── Price Tiers ──────────────────────────────────────────────────────────────
export const price_tiers = pgTable('price_tiers', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: varchar('name', { length: 80 }).notNull(),
  description: text('description'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
  deleted_at: timestamptz('deleted_at'),
  row_version: bigint('row_version', { mode: 'number' }).notNull().default(1),
});

// ─── Invoice Series ───────────────────────────────────────────────────────────
export const invoice_series = pgTable('invoice_series', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: varchar('name', { length: 80 }).notNull(),
  document_type: varchar('document_type', { length: 40 }).notNull().default('invoice'),
  prefix: varchar('prefix', { length: 10 }),
  suffix: varchar('suffix', { length: 10 }),
  number_padding: smallint('number_padding').notNull().default(4),
  starting_number: integer('starting_number').notNull().default(1),
  next_number: integer('next_number').notNull().default(1),
  reset_on_fy: boolean('reset_on_fy').notNull().default(true),
  branch_id: uuid('branch_id'),
  is_default: boolean('is_default').notNull().default(false),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
  updated_at: timestamptz('updated_at').notNull().default(sql`now()`),
  row_version: bigint('row_version', { mode: 'number' }).notNull().default(1),
});

// ─── Payment Modes ────────────────────────────────────────────────────────────
export const payment_modes = pgTable('payment_modes', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: varchar('name', { length: 100 }).notNull(),
  type: varchar('type', { length: 20 }).notNull().default('custom'),
  badge_color: varchar('badge_color', { length: 50 }).default('bg-gray-100 text-gray-800'),
  order_index: smallint('order_index').notNull().default(0),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
  created_by: uuid('created_by').notNull(),
  updated_at: timestamptz('updated_at').notNull().default(sql`now()`),
  updated_by: uuid('updated_by').notNull(),
  deleted_at: timestamptz('deleted_at'),
});

// ─── Lead Sources ─────────────────────────────────────────────────────────────
export const lead_sources = pgTable('lead_sources', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: varchar('name', { length: 100 }).notNull(),
  badge_color: varchar('badge_color', { length: 50 }).default('bg-gray-100 text-gray-800'),
  order_index: smallint('order_index').notNull().default(0),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
  created_by: uuid('created_by').notNull(),
  updated_at: timestamptz('updated_at').notNull().default(sql`now()`),
  updated_by: uuid('updated_by').notNull(),
  deleted_at: timestamptz('deleted_at'),
});

// ─── Lead Statuses ────────────────────────────────────────────────────────────
// `slug` is the stable identifier stored on leads.status and referenced by
// business logic (e.g. 'converted', 'lost') — generated once from `name` at
// creation and never changes, even if the display name is later edited.
// Mirrors payment_modes.type.
export const lead_statuses = pgTable('lead_statuses', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: varchar('name', { length: 60 }).notNull(),
  slug: varchar('slug', { length: 20 }).notNull(),
  badge_color: varchar('badge_color', { length: 50 }).default('bg-gray-100 text-gray-800'),
  order_index: smallint('order_index').notNull().default(0),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
  created_by: uuid('created_by').notNull(),
  updated_at: timestamptz('updated_at').notNull().default(sql`now()`),
  updated_by: uuid('updated_by').notNull(),
  deleted_at: timestamptz('deleted_at'),
});

// ─── Bank Accounts ────────────────────────────────────────────────────────────
export const bank_accounts = pgTable('bank_accounts', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: varchar('name', { length: 80 }).notNull(),
  bank_name: varchar('bank_name', { length: 80 }),
  account_no: varchar('account_no', { length: 30 }),
  ifsc: varchar('ifsc', { length: 15 }),
  upi_id: varchar('upi_id', { length: 80 }),
  type: varchar('type', { length: 20 }).notNull().default('savings'),
  current_balance: numeric('current_balance', { precision: 14, scale: 2 }).notNull().default('0'),
  is_default: boolean('is_default').notNull().default(false),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
  updated_at: timestamptz('updated_at').notNull().default(sql`now()`),
  deleted_at: timestamptz('deleted_at'),
  row_version: bigint('row_version', { mode: 'number' }).notNull().default(1),
});

// ─── Period Locks ─────────────────────────────────────────────────────────────
export const period_locks = pgTable('period_locks', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  lock_through_date: date('lock_through_date').notNull(),
  locked_by: uuid('locked_by').notNull(),
  locked_at: timestamptz('locked_at').notNull().default(sql`now()`),
  reason: text('reason'),
  unlocked_by: uuid('unlocked_by'),
  unlocked_at: timestamptz('unlocked_at'),
  unlock_reason: text('unlock_reason'),
});

// ─── Customer Groups ──────────────────────────────────────────────────────────
export const customer_groups = pgTable('customer_groups', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: varchar('name', { length: 80 }).notNull(),
  default_price_tier_id: uuid('default_price_tier_id').references(() => price_tiers.id),
  default_discount_pct: numeric('default_discount_pct', { precision: 5, scale: 2 }).default('0'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
  deleted_at: timestamptz('deleted_at'),
  row_version: bigint('row_version', { mode: 'number' }).notNull().default(1),
});
