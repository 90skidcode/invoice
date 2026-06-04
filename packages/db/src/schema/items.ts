import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
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
import { brands, categories, tax_rates, units } from './master.js';
import { organizations } from './organizations.js';

export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    sku: varchar('sku', { length: 40 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    short_name: varchar('short_name', { length: 40 }),
    description: text('description'),
    category_id: uuid('category_id').references(() => categories.id),
    brand_id: uuid('brand_id').references(() => brands.id),
    hsn_code: varchar('hsn_code', { length: 8 }),
    primary_unit_id: uuid('primary_unit_id')
      .notNull()
      .references(() => units.id),
    tax_rate_id: uuid('tax_rate_id')
      .notNull()
      .references(() => tax_rates.id),
    // NOTE: no on_hand column — current stock is always from stock_ledger (§1.2)
    mrp: numeric('mrp', { precision: 14, scale: 2 }),
    sale_price: numeric('sale_price', { precision: 14, scale: 2 }).notNull().default('0'),
    purchase_price: numeric('purchase_price', { precision: 14, scale: 2 }),
    price_includes_tax: boolean('price_includes_tax').notNull().default(false),
    min_sale_price: numeric('min_sale_price', { precision: 14, scale: 2 }),
    max_discount_pct: numeric('max_discount_pct', { precision: 5, scale: 2 }),
    cess_rate: numeric('cess_rate', { precision: 5, scale: 2 }).default('0'),
    track_inventory: boolean('track_inventory').notNull().default(true),
    is_service: boolean('is_service').notNull().default(false),
    is_batched: boolean('is_batched').notNull().default(false),
    allow_negative_stock: boolean('allow_negative_stock').notNull().default(false),
    has_variants: boolean('has_variants').notNull().default(false),
    is_finished_good: boolean('is_finished_good').notNull().default(false),
    reorder_level: numeric('reorder_level', { precision: 14, scale: 3 }),
    reorder_qty: numeric('reorder_qty', { precision: 14, scale: 3 }),
    max_stock: numeric('max_stock', { precision: 14, scale: 3 }),
    lead_time_days: integer('lead_time_days'),
    shelf_life_days: integer('shelf_life_days'),
    storage_location: varchar('storage_location', { length: 60 }),
    weight_g: numeric('weight_g', { precision: 10, scale: 2 }),
    dimensions: varchar('dimensions', { length: 20 }),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    custom_fields: jsonb('custom_fields').default({}),
    tags: text('tags').array().default(sql`'{}'::text[]`),
    image_urls: text('image_urls').array().default(sql`'{}'::text[]`),
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
    index('items_org_id_idx').on(table.org_id),
    index('items_org_sku_idx').on(table.org_id, table.sku),
    index('items_org_status_idx').on(table.org_id, table.status),
    index('items_category_idx').on(table.category_id),
  ],
);

export const item_barcodes = pgTable(
  'item_barcodes',
  {
    id: uuid('id').primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    item_id: uuid('item_id')
      .notNull()
      .references(() => items.id),
    barcode: varchar('barcode', { length: 40 }).notNull(),
    symbology: varchar('symbology', { length: 20 }).notNull().default('CODE128'),
    unit_id: uuid('unit_id')
      .notNull()
      .references(() => units.id),
    is_primary: boolean('is_primary').notNull().default(false),
    created_at: timestamptz('created_at').notNull().default(sql`now()`),
    deleted_at: timestamptz('deleted_at'),
  },
  (table) => [
    index('item_barcodes_org_barcode_idx').on(table.org_id, table.barcode),
    index('item_barcodes_item_idx').on(table.item_id),
  ],
);

export const item_alt_units = pgTable('item_alt_units', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id').notNull(),
  item_id: uuid('item_id')
    .notNull()
    .references(() => items.id),
  unit_id: uuid('unit_id')
    .notNull()
    .references(() => units.id),
  conversion_factor: numeric('conversion_factor', { precision: 14, scale: 4 }).notNull(),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
});

export const item_prices = pgTable('item_prices', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id').notNull(),
  item_id: uuid('item_id')
    .notNull()
    .references(() => items.id),
  price_tier_id: uuid('price_tier_id').notNull(),
  min_qty: numeric('min_qty', { precision: 14, scale: 3 }).notNull().default('1'),
  price: numeric('price', { precision: 14, scale: 2 }).notNull(),
  effective_from: timestamptz('effective_from').notNull().default(sql`now()`),
  effective_to: timestamptz('effective_to'),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
});

export const item_price_history = pgTable('item_price_history', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id').notNull(),
  item_id: uuid('item_id')
    .notNull()
    .references(() => items.id),
  field_changed: varchar('field_changed', { length: 40 }).notNull(),
  old_value: numeric('old_value', { precision: 14, scale: 2 }),
  new_value: numeric('new_value', { precision: 14, scale: 2 }),
  changed_by: uuid('changed_by').notNull(),
  changed_at: timestamptz('changed_at').notNull().default(sql`now()`),
});
