-- Skill packs a client agent attached to one task card (path prefixes in the handoff-skills library).
-- task_id has no foreign key on purpose: eraseTaskRow deletes these rows first, and a merge that moves a task keeps them.
-- A detached row keeps its history (detached_at set); a live attachment has detached_at NULL.
CREATE TABLE task_skill_packs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  prefix TEXT NOT NULL,
  attached_by_kind TEXT NOT NULL CHECK (attached_by_kind IN ('staff', 'agent', 'system')),
  attached_by TEXT,
  attached_at INTEGER NOT NULL,
  detached_by TEXT,
  detached_at INTEGER
);

CREATE INDEX task_skill_packs_task ON task_skill_packs (task_id, detached_at);
