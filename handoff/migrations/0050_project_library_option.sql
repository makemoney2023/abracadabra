-- Per-project Library option. The Library is part of the social pipeline, so print and other non-social projects can
-- opt out. Additive only: one defaulted column on projects.
-- include_in_library: 1 (default, every existing project keeps today's behaviour) or 0 (the project's finished work,
-- built sites and files stay out of the Library and out of auto-scheduling). Files are unaffected.
-- Staff switch a project at creation or later on its page; client leads can set it at POST/PATCH /api/agent-projects.
ALTER TABLE projects ADD COLUMN include_in_library INTEGER NOT NULL DEFAULT 1 CHECK (include_in_library IN (0, 1));
