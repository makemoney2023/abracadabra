-- A share link lets someone add files without an email invite.
CREATE TABLE upload_shares (
  workspace_id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
