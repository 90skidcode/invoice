-- Add new columns to payment_modes table if not already present
ALTER TABLE payment_modes
ADD COLUMN IF NOT EXISTS badge_color VARCHAR(50) DEFAULT 'bg-gray-100 text-gray-800',
ADD COLUMN IF NOT EXISTS order_index SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS created_by UUID NOT NULL,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_by UUID NOT NULL,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Create index for org_id lookups (if not already exists)
CREATE INDEX IF NOT EXISTS payment_modes_org_idx ON payment_modes(org_id, is_active, order_index);

-- Add unique constraint on org_id + name (if not already exists)
ALTER TABLE payment_modes
ADD CONSTRAINT payment_modes_org_name_unique UNIQUE (org_id, name);

-- Note: Seed default payment modes for each organization via application layer during onboarding
