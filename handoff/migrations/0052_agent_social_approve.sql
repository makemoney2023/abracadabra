-- Per-agent permission to approve single social pieces. Additive only: one defaulted column on agent_social_permissions.
-- can_approve: 1 lets a hire (function agent) approve or un-approve ONE piece of a published social pack through
-- POST /api/agent-social/items/<id>/approve. Default 0 (every existing row and every agent stays off). It is independent of
-- can_schedule: approving never schedules or posts. Client lead agents do not need a row; the client's publishing mode governs them.
ALTER TABLE agent_social_permissions ADD COLUMN can_approve INTEGER NOT NULL DEFAULT 0 CHECK (can_approve IN (0, 1));
