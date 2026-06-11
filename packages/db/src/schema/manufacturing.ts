import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { timestamptz } from '../columns.js';
import { items } from './items.js';
import { units } from './master.js';
import { locations, organizations } from './organizations.js';

/**
 * Bill of Materials — the recipe for a finished good. A header carries the
 * finished item, the batch yield (output_qty) and non-inventory costs
 * (labour / overhead per batch); the items are the consumed raw materials.
 *
 * BOMs are master data only — defining one never moves stock (§1.2). Stock
 * moves at production time (Phase 2), which reads the active BOM.
 */
export const bom_headers = pgTable(
  'bom_headers',
  {
    id: uuid('id').primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    finished_item_id: uuid('finished_item_id')
      .notNull()
      .references(() => items.id),
    version: integer('version').notNull().default(1),
    name: varchar('name', { length: 160 }),
    // A batch of this recipe yields output_qty units of the finished item.
    output_qty: numeric('output_qty', { precision: 14, scale: 3 }).notNull().default('1'),
    output_unit_id: uuid('output_unit_id')
      .notNull()
      .references(() => units.id),
    // Non-inventory costs per batch (inventory costs come from bom_items).
    labor_cost: numeric('labor_cost', { precision: 14, scale: 2 }).notNull().default('0'),
    overhead_cost: numeric('overhead_cost', { precision: 14, scale: 2 }).notNull().default('0'),
    notes: text('notes'),
    is_active: boolean('is_active').notNull().default(true),
    status: varchar('status', { length: 20 }).notNull().default('active'),
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
    index('bom_headers_org_idx').on(table.org_id),
    index('bom_headers_org_item_idx').on(table.org_id, table.finished_item_id),
    uniqueIndex('bom_headers_org_item_version_uq').on(
      table.org_id,
      table.finished_item_id,
      table.version,
    ),
  ],
);

/**
 * A recipe line: how much of a raw material a BOM consumes per batch.
 * Child rows of bom_headers — replaced wholesale on edit, so they carry no
 * soft-delete / row_version columns (same shape as purchase_invoice_lines).
 */
export const bom_items = pgTable(
  'bom_items',
  {
    id: uuid('id').primaryKey(),
    org_id: uuid('org_id').notNull(),
    bom_header_id: uuid('bom_header_id')
      .notNull()
      .references(() => bom_headers.id),
    line_no: integer('line_no').notNull(),
    raw_item_id: uuid('raw_item_id')
      .notNull()
      .references(() => items.id),
    qty: numeric('qty', { precision: 14, scale: 4 }).notNull(),
    unit_id: uuid('unit_id')
      .notNull()
      .references(() => units.id),
    wastage_pct: numeric('wastage_pct', { precision: 5, scale: 2 }).notNull().default('0'),
    created_at: timestamptz('created_at').notNull().default(sql`now()`),
  },
  (table) => [index('bom_items_header_idx').on(table.bom_header_id)],
);

/**
 * A production run. Posting one consumes raw materials and outputs the finished
 * good through the append-only stock_ledger (§1.3), in a single transaction
 * (§1.4). Costs are rolled up from consumed material (moving-avg) + labour +
 * overhead and become the finished good's cost basis.
 */
export const production_orders = pgTable(
  'production_orders',
  {
    id: uuid('id').primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    voucher_no: varchar('voucher_no', { length: 40 }).notNull(),
    production_date: date('production_date').notNull(),
    bom_header_id: uuid('bom_header_id')
      .notNull()
      .references(() => bom_headers.id),
    finished_item_id: uuid('finished_item_id')
      .notNull()
      .references(() => items.id),
    planned_qty: numeric('planned_qty', { precision: 14, scale: 3 }).notNull(),
    produced_qty: numeric('produced_qty', { precision: 14, scale: 3 }).notNull(),
    location_id: uuid('location_id')
      .notNull()
      .references(() => locations.id),
    total_material_cost: numeric('total_material_cost', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    labor_cost: numeric('labor_cost', { precision: 14, scale: 2 }).notNull().default('0'),
    overhead_cost: numeric('overhead_cost', { precision: 14, scale: 2 }).notNull().default('0'),
    total_cost: numeric('total_cost', { precision: 14, scale: 2 }).notNull().default('0'),
    cost_per_unit: numeric('cost_per_unit', { precision: 14, scale: 4 }).notNull().default('0'),
    status: varchar('status', { length: 20 }).notNull().default('completed'),
    notes: text('notes'),
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
    index('production_orders_org_idx').on(table.org_id),
    index('production_orders_org_date_idx').on(table.org_id, table.production_date),
    index('production_orders_org_item_idx').on(table.org_id, table.finished_item_id),
  ],
);

/**
 * Snapshot of every stock move a production run made: 'consume' rows (raw
 * materials out) and 'output' rows (finished good in). Mirrors the matching
 * stock_ledger entries for reporting; child rows carry no soft-delete columns.
 */
export const production_order_lines = pgTable(
  'production_order_lines',
  {
    id: uuid('id').primaryKey(),
    org_id: uuid('org_id').notNull(),
    production_order_id: uuid('production_order_id')
      .notNull()
      .references(() => production_orders.id),
    line_no: integer('line_no').notNull(),
    line_type: varchar('line_type', { length: 12 }).notNull(), // 'consume' | 'output'
    item_id: uuid('item_id')
      .notNull()
      .references(() => items.id),
    item_name_snapshot: varchar('item_name_snapshot', { length: 160 }),
    qty: numeric('qty', { precision: 14, scale: 4 }).notNull(),
    unit_id: uuid('unit_id').references(() => units.id),
    rate: numeric('rate', { precision: 14, scale: 4 }).notNull().default('0'),
    value: numeric('value', { precision: 14, scale: 2 }).notNull().default('0'),
    location_id: uuid('location_id').references(() => locations.id),
    batch_id: uuid('batch_id'),
    created_at: timestamptz('created_at').notNull().default(sql`now()`),
  },
  (table) => [index('production_order_lines_order_idx').on(table.production_order_id)],
);
