-- Library article metadata, provenance, and explicit file selections. Additive only.
CREATE TABLE deliverable_artifact_metadata (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  deliverable_id TEXT NOT NULL REFERENCES deliverables(id),
  item_id TEXT NOT NULL REFERENCES deliverable_items(id),
  version INTEGER NOT NULL,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('article', 'social', 'video', 'image', 'website', 'document', 'file')),
  dek TEXT,
  canonical_url TEXT,
  publisher_name TEXT,
  author_name TEXT,
  external_published_at INTEGER,
  article_status TEXT CHECK (article_status IS NULL OR article_status IN ('draft', 'review', 'approved', 'published', 'updated', 'archived')),
  source_file_id TEXT REFERENCES files(id),
  seo_title TEXT,
  seo_description TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (item_id, version)
);
CREATE INDEX deliverable_artifact_metadata_workspace ON deliverable_artifact_metadata (workspace_id, artifact_type, updated_at);

CREATE TABLE artifact_relations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_version INTEGER NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_version INTEGER NOT NULL,
  relation_kind TEXT NOT NULL CHECK (relation_kind IN ('source_of', 'promotes', 'derived_from', 'supersedes')),
  created_by_kind TEXT NOT NULL CHECK (created_by_kind IN ('staff', 'client', 'agent', 'system')),
  created_by_id TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (workspace_id, source_kind, source_id, source_version, target_kind, target_id, target_version, relation_kind)
);
CREATE INDEX artifact_relations_workspace ON artifact_relations (workspace_id, relation_kind, created_at);

CREATE TABLE library_file_selections (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  file_id TEXT NOT NULL REFERENCES files(id),
  selected_by TEXT NOT NULL,
  selected_at INTEGER NOT NULL,
  revoked_by TEXT,
  revoked_at INTEGER
);
CREATE UNIQUE INDEX library_file_selections_active ON library_file_selections (workspace_id, file_id) WHERE revoked_at IS NULL;
CREATE INDEX library_file_selections_workspace ON library_file_selections (workspace_id, selected_at);
