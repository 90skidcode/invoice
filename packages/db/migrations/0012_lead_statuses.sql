-- Lead Statuses: DB-driven picklist (mirrors lead_sources/payment_modes),
-- so status labels/colors are Settings-managed instead of hardcoded.
-- leads.status keeps storing the stable `slug`, not lead_statuses.id, so
-- existing lead rows (already holding 'new'/'contacted'/etc.) need no
-- backfill and business logic keyed off those strings keeps working even
-- if a display name is later edited.

CREATE TABLE IF NOT EXISTS lead_statuses (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(60) NOT NULL,
  slug VARCHAR(20) NOT NULL,
  badge_color VARCHAR(50) DEFAULT 'bg-gray-100 text-gray-800',
  order_index SMALLINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NOT NULL,
  deleted_at TIMESTAMPTZ,
  UNIQUE(org_id, slug)
);

CREATE INDEX IF NOT EXISTS lead_statuses_org_idx ON lead_statuses(org_id, is_active, order_index);

-- Seed default statuses for every existing org (matches the fixed enum the
-- app shipped with, so nothing changes for orgs that never touch Settings).
INSERT INTO lead_statuses (id, org_id, name, slug, badge_color, order_index, created_by, updated_by)
SELECT gen_random_uuid(), o.id, v.name, v.slug, v.badge_color, v.order_index, u.id, u.id
FROM organizations o
CROSS JOIN (VALUES
  ('New', 'new', 'bg-blue-100 text-blue-800', 0),
  ('Contacted', 'contacted', 'bg-amber-100 text-amber-800', 1),
  ('Qualified', 'qualified', 'bg-purple-100 text-purple-800', 2),
  ('Lost', 'lost', 'bg-red-100 text-red-800', 3),
  ('Converted', 'converted', 'bg-green-100 text-green-800', 4)
) AS v(name, slug, badge_color, order_index)
JOIN LATERAL (
  SELECT id FROM users WHERE users.org_id = o.id AND users.deleted_at IS NULL
  ORDER BY (role = 'owner') DESC, created_at ASC LIMIT 1
) u ON true
ON CONFLICT (org_id, slug) DO NOTHING;

-- Seed default lead sources too, for the same reason (org onboarding does
-- this for new orgs going forward, but existing orgs never got any).
INSERT INTO lead_sources (id, org_id, name, badge_color, order_index, created_by, updated_by)
SELECT gen_random_uuid(), o.id, v.name, v.badge_color, v.order_index, u.id, u.id
FROM organizations o
CROSS JOIN (VALUES
  ('Walk-in', 'bg-green-100 text-green-800', 0),
  ('Referral', 'bg-blue-100 text-blue-800', 1),
  ('Instagram', 'bg-purple-100 text-purple-800', 2),
  ('Website', 'bg-amber-100 text-amber-800', 3)
) AS v(name, badge_color, order_index)
JOIN LATERAL (
  SELECT id FROM users WHERE users.org_id = o.id AND users.deleted_at IS NULL
  ORDER BY (role = 'owner') DESC, created_at ASC LIMIT 1
) u ON true
WHERE NOT EXISTS (
  SELECT 1 FROM lead_sources ls WHERE ls.org_id = o.id AND ls.deleted_at IS NULL
);
