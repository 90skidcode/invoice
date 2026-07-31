-- Remove expected_value column from leads table.
-- This field is being removed per product decision to simplify lead tracking.
ALTER TABLE leads DROP COLUMN IF EXISTS expected_value;
