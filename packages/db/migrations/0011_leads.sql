-- Lead Management: lead_sources (master), leads, lead_activities, lead_tags, lead_tag_links.
-- All new tables — no backfill/NOT NULL-on-populated-table concerns.

-- ─── Lead Sources (Settings-managed master, same shape as payment_modes) ─────
CREATE TABLE IF NOT EXISTS lead_sources (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(100) NOT NULL,
  badge_color VARCHAR(50) DEFAULT 'bg-gray-100 text-gray-800',
  order_index SMALLINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- ─── Leads ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(15) NOT NULL,
  email VARCHAR(120),
  company_name VARCHAR(120),
  source_id UUID REFERENCES lead_sources(id),
  status VARCHAR(20) NOT NULL DEFAULT 'new',
  assigned_to UUID,
  expected_value NUMERIC(14,2),
  next_follow_up_at TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  lost_reason TEXT,
  notes TEXT,
  referred_by_customer_id UUID REFERENCES customers(id),
  customer_id UUID UNIQUE REFERENCES customers(id),
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NOT NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  row_version BIGINT NOT NULL DEFAULT 1,
  sync_status SMALLINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS leads_org_id_idx ON leads(org_id);
CREATE INDEX IF NOT EXISTS leads_org_status_idx ON leads(org_id, status);
CREATE INDEX IF NOT EXISTS leads_org_phone_idx ON leads(org_id, phone);
CREATE INDEX IF NOT EXISTS leads_org_next_followup_idx ON leads(org_id, next_follow_up_at);

-- ─── Lead Activities (append-only follow-up / call timeline) ────────────────
CREATE TABLE IF NOT EXISTS lead_activities (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  lead_id UUID NOT NULL REFERENCES leads(id),
  type VARCHAR(20) NOT NULL DEFAULT 'note',
  note TEXT,
  status_at_time VARCHAR(20),
  next_follow_up_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

CREATE INDEX IF NOT EXISTS lead_activities_lead_idx ON lead_activities(lead_id, created_at DESC);

-- ─── Lead Tags (dynamic, user-created) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_tags (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(40) NOT NULL,
  color VARCHAR(50) DEFAULT 'bg-gray-100 text-gray-800',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  UNIQUE(org_id, name)
);

CREATE TABLE IF NOT EXISTS lead_tag_links (
  lead_id UUID NOT NULL REFERENCES leads(id),
  tag_id UUID NOT NULL REFERENCES lead_tags(id),
  org_id UUID NOT NULL REFERENCES organizations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, tag_id)
);
