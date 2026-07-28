-- Add indexes to optimize search/lookup queries
-- These indexes significantly improve performance for ILIKE searches on name/sku

-- Enable trigram extension for advanced text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Simple B-tree indexes on items.name and items.sku for ILIKE searches
-- Note: ILIKE can use these indexes with appropriate query patterns
CREATE INDEX IF NOT EXISTS "items_name_idx"
  ON "items" ("name")
  WHERE "deleted_at" IS NULL AND "status" = 'active';

CREATE INDEX IF NOT EXISTS "items_sku_idx"
  ON "items" ("sku")
  WHERE "deleted_at" IS NULL AND "status" = 'active';

-- Composite index for org_id + is_finished_good lookup
CREATE INDEX IF NOT EXISTS "items_org_finished_good_idx"
  ON "items" ("org_id", "is_finished_good")
  WHERE "deleted_at" IS NULL AND "status" = 'active';

-- Indexes for customer lookups
CREATE INDEX IF NOT EXISTS "customers_name_idx"
  ON "customers" ("name")
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "customers_phone_idx"
  ON "customers" ("phone")
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "customers_org_idx"
  ON "customers" ("org_id")
  WHERE "deleted_at" IS NULL;
