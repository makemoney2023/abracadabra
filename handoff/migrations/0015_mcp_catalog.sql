-- Servers from the catalog that a workflow's steps may call.
ALTER TABLE client_workflows ADD COLUMN mcp_server_ids TEXT;
