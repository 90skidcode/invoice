import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  numeric,
  pgTable,
  smallint,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { timestamptz } from '../columns.js';
import { customers } from './parties.js';
import { organizations } from './organizations.js';
import { lead_sources } from './master.js';

// ─── Leads ──────────────────────────────────────────────────────────────────
export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    name: varchar('name', { length: 120 }).notNull(),
    phone: varchar('phone', { length: 15 }).notNull(),
    email: varchar('email', { length: 120 }),
    company_name: varchar('company_name', { length: 120 }),
    source_id: uuid('source_id').references(() => lead_sources.id),
    status: varchar('status', { length: 20 }).notNull().default('new'),
    assigned_to: uuid('assigned_to'),
    expected_value: numeric('expected_value', { precision: 14, scale: 2 }),
    next_follow_up_at: timestamptz('next_follow_up_at'),
    last_contacted_at: timestamptz('last_contacted_at'),
    lost_reason: text('lost_reason'),
    notes: text('notes'),
    referred_by_customer_id: uuid('referred_by_customer_id').references(() => customers.id),
    customer_id: uuid('customer_id')
      .unique()
      .references(() => customers.id),
    converted_at: timestamptz('converted_at'),
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
    index('leads_org_id_idx').on(table.org_id),
    index('leads_org_status_idx').on(table.org_id, table.status),
    index('leads_org_phone_idx').on(table.org_id, table.phone),
    index('leads_org_next_followup_idx').on(table.org_id, table.next_follow_up_at),
  ],
);

// ─── Lead Activities (append-only follow-up / call timeline) ────────────────
export const lead_activities = pgTable('lead_activities', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  lead_id: uuid('lead_id')
    .notNull()
    .references(() => leads.id),
  type: varchar('type', { length: 20 }).notNull().default('note'),
  note: text('note'),
  status_at_time: varchar('status_at_time', { length: 20 }),
  next_follow_up_at: timestamptz('next_follow_up_at'),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
  created_by: uuid('created_by').notNull(),
});

// ─── Lead Tags (dynamic, user-created) ───────────────────────────────────────
export const lead_tags = pgTable('lead_tags', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: varchar('name', { length: 40 }).notNull(),
  color: varchar('color', { length: 50 }).default('bg-gray-100 text-gray-800'),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
  created_by: uuid('created_by').notNull(),
});

export const lead_tag_links = pgTable('lead_tag_links', {
  lead_id: uuid('lead_id')
    .notNull()
    .references(() => leads.id),
  tag_id: uuid('tag_id')
    .notNull()
    .references(() => lead_tags.id),
  org_id: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
});
