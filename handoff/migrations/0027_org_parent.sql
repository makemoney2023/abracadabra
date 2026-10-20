-- A company can sit under a parent company (a holding group). One level only; src/db/org-groups.ts enforces that.
-- The step is marked applied by the index (created IF NOT EXISTS), so a run that stopped after the column runs again.
ALTER TABLE organizations ADD COLUMN parent_organization_id TEXT REFERENCES organizations(id)
  CHECK (parent_organization_id IS NULL OR parent_organization_id <> id);

CREATE INDEX IF NOT EXISTS organizations_parent ON organizations (parent_organization_id);
