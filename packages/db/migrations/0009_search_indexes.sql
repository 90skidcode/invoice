-- Add indexes to optimize search/lookup queries
-- These indexes significantly improve performance for ILIKE searches on name/sku

-- Enable trigram extension for advanced text search (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN index on items.name for fast ILIKE searches
CREATE INDEX IF NOT EXISTS "items_name_trgm_idx"
  ON "items" USING gin ("name" gin_trgm_ops)
  WHERE "deleted_at" IS NULL AND "status" = 'active';

-- GIN index on items.sku for fast ILIKE searches
CREATE INDEX IF NOT EXISTS "items_sku_trgm_idx"
  ON "items" USING gin ("sku" gin_trgm_ops)
  WHERE "deleted_at" IS NULL AND "status" = 'active';

-- Composite index for common lookup filter combination
CREATE INDEX IF NOT EXISTS "items_org_lookup_idx"
  ON "items" ("org_id", "is_finished_good")
  WHERE "deleted_at" IS NULL AND "status" = 'active';

-- Similar indexes for customers
CREATE INDEX IF NOT EXISTS "customers_name_trgm_idx"
  ON "customers" USING gin ("name" gin_trgm_ops)
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "customers_phone_idx"
  ON "customers" ("phone")
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "customers_org_lookup_idx"
  ON "customers" ("org_id")
  WHERE "deleted_at" IS NULL;
