import { sql } from 'drizzle-orm';
import { bigint, smallint, uuid } from 'drizzle-orm/pg-core';
import { timestamptz } from './columns.js';

// Every business table gets these columns per §5.2
export function baseColumns() {
  return {
    id: uuid('id').primaryKey(),
    org_id: uuid('org_id').notNull(),
    created_at: timestamptz('created_at').notNull().default(sql`now()`),
    created_by: uuid('created_by').notNull(),
    updated_at: timestamptz('updated_at').notNull().default(sql`now()`),
    updated_by: uuid('updated_by').notNull(),
    deleted_at: timestamptz('deleted_at'),
    deleted_by: uuid('deleted_by'),
    row_version: bigint('row_version', { mode: 'number' }).notNull().default(1),
    sync_status: smallint('sync_status').notNull().default(0),
  };
}

// Append-only tables (stock_ledger, audit_log) don't get updated_* / deleted_*
export function appendOnlyColumns() {
  return {
    id: uuid('id').primaryKey(),
    org_id: uuid('org_id').notNull(),
    created_at: timestamptz('created_at').notNull().default(sql`now()`),
    created_by: uuid('created_by').notNull(),
  };
}
