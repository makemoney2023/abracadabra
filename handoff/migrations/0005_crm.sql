-- Agency CRM records. Timestamps are unix milliseconds. Booleans are 0 or 1.
-- D1 has no row rules. src/db/crm.ts is the wall: only staff can read or write these rows.

PRAGMA foreign_keys = ON;

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT UNIQUE,
  website TEXT,
  industry TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('lead', 'client', 'past_client', 'partner')),
  owner_user_id TEXT REFERENCES staff(user_id),
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER
);

CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id),
  name TEXT,
  title TEXT,
  email TEXT UNIQUE CHECK (email IS NULL OR email = lower(email)),
  phone TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  opted_in INTEGER NOT NULL DEFAULT 0 CHECK (opted_in IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE deals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('new', 'contacted', 'call_booked', 'proposal', 'won', 'lost')),
  source TEXT NOT NULL,
  value_cents INTEGER,
  lost_reason TEXT,
  owner_user_id TEXT REFERENCES staff(user_id),
  next_step TEXT,
  next_step_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE INDEX deals_stage_updated ON deals (stage, updated_at);

CREATE TABLE assessments (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id),
  contact_id TEXT REFERENCES contacts(id),
  deal_id TEXT REFERENCES deals(id),
  domain TEXT,
  answers_json TEXT NOT NULL,
  scores_json TEXT NOT NULL,
  total_score INTEGER,
  utm_json TEXT,
  report_url TEXT,
  completed_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE TABLE appointments (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  organization_id TEXT REFERENCES organizations(id),
  contact_id TEXT REFERENCES contacts(id),
  deal_id TEXT REFERENCES deals(id),
  starts_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('booked', 'rescheduled', 'cancelled', 'done', 'no_show')),
  UNIQUE (provider, external_id)
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  deal_id TEXT REFERENCES deals(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned', 'active', 'waiting_on_client', 'done', 'paused', 'cancelled')),
  owner_user_id TEXT REFERENCES staff(user_id),
  starts_at INTEGER,
  due_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  due_at INTEGER,
  done_at INTEGER,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  milestone_id TEXT REFERENCES milestones(id),
  organization_id TEXT REFERENCES organizations(id),
  deal_id TEXT REFERENCES deals(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('todo', 'doing', 'blocked', 'done')),
  assignee_user_id TEXT REFERENCES staff(user_id),
  due_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  done_at INTEGER
);

CREATE INDEX tasks_assignee_status_due ON tasks (assignee_user_id, status, due_at);

CREATE TABLE activities (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id),
  contact_id TEXT REFERENCES contacts(id),
  deal_id TEXT REFERENCES deals(id),
  project_id TEXT REFERENCES projects(id),
  workspace_id TEXT REFERENCES workspaces(id),
  kind TEXT NOT NULL,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('staff', 'agent', 'system')),
  actor_id TEXT,
  body TEXT,
  data_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX activities_org_created ON activities (organization_id, created_at);

ALTER TABLE workspaces ADD COLUMN organization_id TEXT REFERENCES organizations(id);
ALTER TABLE workspaces ADD COLUMN project_id TEXT REFERENCES projects(id);

CREATE INDEX workspaces_organization ON workspaces (organization_id);

CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT REFERENCES projects(id),
  contact_id TEXT REFERENCES contacts(id),
  status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'partly_paid', 'paid', 'void')),
  currency TEXT NOT NULL DEFAULT 'usd',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_rate_bp INTEGER NOT NULL DEFAULT 0 CHECK (tax_rate_bp >= 0),
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  paid_cents INTEGER NOT NULL DEFAULT 0,
  issued_at INTEGER,
  due_at INTEGER,
  sent_at INTEGER,
  paid_at INTEGER,
  pdf_r2_key TEXT,
  external_id TEXT,
  memo TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX invoices_status_due ON invoices (status, due_at);

CREATE TABLE invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  milestone_id TEXT REFERENCES milestones(id),
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_cents INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE invoice_counters (
  year INTEGER PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL,
  provider TEXT,
  external_id TEXT,
  received_at INTEGER NOT NULL,
  recorded_by TEXT,
  note TEXT,
  UNIQUE (provider, external_id)
);

CREATE TABLE status_updates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  health TEXT NOT NULL CHECK (health IN ('on_track', 'at_risk', 'off_track', 'done')),
  audience TEXT NOT NULL CHECK (audience IN ('internal', 'client')),
  body TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('draft', 'published')),
  emailed_at INTEGER,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('staff', 'agent', 'system')),
  actor_id TEXT,
  created_at INTEGER NOT NULL,
  published_at INTEGER
);

CREATE INDEX status_updates_project_created ON status_updates (project_id, created_at);

CREATE TABLE github_installations (
  id INTEGER PRIMARY KEY,
  account_login TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('User', 'Organization')),
  organization_id TEXT REFERENCES organizations(id),
  suspended_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE repos (
  id TEXT PRIMARY KEY,
  github_repo_id INTEGER NOT NULL UNIQUE,
  installation_id INTEGER REFERENCES github_installations(id),
  full_name TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT REFERENCES projects(id),
  default_branch TEXT,
  is_private INTEGER NOT NULL DEFAULT 1,
  owned_by TEXT NOT NULL DEFAULT 'agency' CHECK (owned_by IN ('client', 'agency')),
  linked_by TEXT,
  created_at INTEGER NOT NULL,
  archived_at INTEGER
);

CREATE INDEX repos_organization ON repos (organization_id);

CREATE TABLE deliverables (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT REFERENCES projects(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('social_pack', 'website', 'document', 'other')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'in_review', 'approved', 'changes_requested', 'archived')),
  version INTEGER NOT NULL DEFAULT 1,
  source_repo_id TEXT REFERENCES repos(id),
  source_ref TEXT,
  published_at INTEGER,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('staff', 'agent', 'system')),
  actor_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX deliverables_workspace_status ON deliverables (workspace_id, status, published_at);

CREATE TABLE deliverable_items (
  id TEXT PRIMARY KEY,
  deliverable_id TEXT NOT NULL REFERENCES deliverables(id),
  version INTEGER NOT NULL,
  section TEXT,
  format TEXT NOT NULL CHECK (format IN (
    'video', 'static', 'carousel', 'story', 'ad_video', 'ad_static', 'ad_carousel', 'page', 'link', 'file'
  )),
  channel TEXT,
  title TEXT NOT NULL,
  copy_text TEXT,
  media_json TEXT NOT NULL DEFAULT '[]',
  link_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'changes_requested')),
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX deliverable_items_version ON deliverable_items (deliverable_id, version, sort);

CREATE TABLE deliverable_feedback (
  id TEXT PRIMARY KEY,
  deliverable_id TEXT NOT NULL REFERENCES deliverables(id),
  item_id TEXT REFERENCES deliverable_items(id),
  version INTEGER NOT NULL,
  author_kind TEXT NOT NULL CHECK (author_kind IN ('client', 'staff')),
  author_id TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'changes', 'comment')),
  body TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX deliverable_feedback_created ON deliverable_feedback (deliverable_id, created_at);

CREATE TABLE idempotency_keys (
  key TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (actor_id, key)
);

CREATE TABLE intake_receipts (
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  PRIMARY KEY (source, external_id)
);

ALTER TABLE knowledge_keys ADD COLUMN scopes TEXT NOT NULL DEFAULT 'read';
ALTER TABLE knowledge_keys ADD COLUMN can_publish INTEGER NOT NULL DEFAULT 0 CHECK (can_publish IN (0, 1));
