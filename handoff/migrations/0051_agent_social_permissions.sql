-- Per-agent social publishing permission. Additive only: one new table, no change to existing rows.
-- A hire (a function agent such as social-content-ops) can schedule or publish social posts for a client only when a row
-- here says so. No row means no: default off, so enabling an agent is a data change (staff or Client Services).
-- can_schedule: may prepare and run schedule plans. can_publish_now: may also prepare publish-now plans, which still need
-- a staff approval card before they run. platforms: comma-separated networks the agent may post to (default linkedin).
-- Client lead agents are unaffected; the client's publishing mode (social_agent_policies) still governs them.
CREATE TABLE agent_social_permissions (
  agent_id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  can_schedule INTEGER NOT NULL DEFAULT 0 CHECK (can_schedule IN (0, 1)),
  can_publish_now INTEGER NOT NULL DEFAULT 0 CHECK (can_publish_now IN (0, 1)),
  platforms TEXT NOT NULL DEFAULT 'linkedin',
  granted_by TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (agent_id, organization_id)
);
