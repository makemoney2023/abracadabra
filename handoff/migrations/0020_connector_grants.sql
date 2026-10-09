CREATE TABLE connector_grants (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  connector_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (organization_id, connector_id)
);
