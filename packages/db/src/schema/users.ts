import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { timestamptz } from '../columns.js';
import { branches, organizations } from './organizations.js';

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: varchar('name', { length: 120 }).notNull(),
  username: varchar('username', { length: 40 }),
  phone: varchar('phone', { length: 15 }).notNull(),
  email: varchar('email', { length: 120 }),
  role: varchar('role', { length: 40 }).notNull().default('cashier'),
  pin_hash: text('pin_hash'),
  failed_login_count: smallint('failed_login_count').notNull().default(0),
  locked_until: timestamptz('locked_until'),
  force_pin_change: boolean('force_pin_change').notNull().default(true),
  is_salesperson: boolean('is_salesperson').notNull().default(false),
  status: varchar('status', { length: 20 }).notNull().default('Active'),
  totp_secret: text('totp_secret'),
  totp_enabled: boolean('totp_enabled').notNull().default(false),
  default_branch_id: uuid('default_branch_id').references(() => branches.id),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
  created_by: uuid('created_by').notNull(),
  updated_at: timestamptz('updated_at').notNull().default(sql`now()`),
  updated_by: uuid('updated_by').notNull(),
  deleted_at: timestamptz('deleted_at'),
  row_version: bigint('row_version', { mode: 'number' }).notNull().default(1),
});

export const user_branch_access = pgTable('user_branch_access', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id').notNull(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id),
  branch_id: uuid('branch_id')
    .notNull()
    .references(() => branches.id),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
});

export const permissions_override = pgTable('permissions_override', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id').notNull(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id),
  permission_key: varchar('permission_key', { length: 80 }).notNull(),
  allowed: boolean('allowed').notNull(),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
  created_by: uuid('created_by').notNull(),
});

export const devices = pgTable('devices', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  user_id: uuid('user_id').references(() => users.id),
  name: varchar('name', { length: 80 }).notNull(),
  platform: varchar('platform', { length: 20 }).notNull(),
  app_version: varchar('app_version', { length: 20 }),
  install_id: varchar('install_id', { length: 80 }),
  is_active: boolean('is_active').notNull().default(true),
  last_seen_at: timestamptz('last_seen_at'),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
  revoked_at: timestamptz('revoked_at'),
  revoked_by: uuid('revoked_by'),
});

export const refresh_tokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id').notNull(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id),
  device_id: uuid('device_id').references(() => devices.id),
  token_hash: text('token_hash').notNull().unique(),
  expires_at: timestamptz('expires_at').notNull(),
  revoked_at: timestamptz('revoked_at'),
  created_at: timestamptz('created_at').notNull().default(sql`now()`),
});
