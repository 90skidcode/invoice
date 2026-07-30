-- Add new columns to payment_modes table if not already present.
-- created_by/updated_by are added nullable first, backfilled, then set
-- NOT NULL — the table already has rows (default modes seeded at org
-- onboarding), so adding them NOT NULL with no default in one step would
-- fail the whole statement per Postgres's "column contains null values".
ALTER TABLE payment_modes
ADD COLUMN IF NOT EXISTS badge_color VARCHAR(50) DEFAULT 'bg-gray-100 text-gray-800',
ADD COLUMN IF NOT EXISTS order_index SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS created_by UUID,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_by UUID,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Backfill existing rows using each org's owner user, so the NOT NULL
-- constraint below can be applied safely.
UPDATE payment_modes pm
SET created_by = u.id, updated_by = u.id
FROM users u
WHERE pm.created_by IS NULL
  AND u.org_id = pm.org_id
  AND u.role = 'owner'
  AND u.deleted_at IS NULL;

-- Any row whose org somehow has no owner falls back to any user in the org,
-- so the NOT NULL constraint below never fails on an orphaned row.
UPDATE payment_modes pm
SET created_by = u.id, updated_by = u.id
FROM users u
WHERE pm.created_by IS NULL
  AND u.org_id = pm.org_id
  AND u.deleted_at IS NULL;

ALTER TABLE payment_modes
ALTER COLUMN created_by SET NOT NULL,
ALTER COLUMN updated_by SET NOT NULL;

-- Create index for org_id lookups (if not already exists)
CREATE INDEX IF NOT EXISTS payment_modes_org_idx ON payment_modes(org_id, is_active, order_index);

-- Add unique constraint on org_id + name (if not already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_modes_org_name_unique'
  ) THEN
    ALTER TABLE payment_modes ADD CONSTRAINT payment_modes_org_name_unique UNIQUE (org_id, name);
  END IF;
END $$;

-- Note: Seed default payment modes for each organization via application layer during onboarding
