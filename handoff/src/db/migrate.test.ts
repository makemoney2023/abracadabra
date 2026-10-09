import { mkdtempSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate, statementsFromMigration } from "./migrate";
import { MIGRATION_SQL } from "./migration-sql";
import { sqliteSql } from "./sql";

describe("statementsFromMigration", () => {
  it("skips a leading comment so the first statement is SQL", () => {
    const file = readFileSync(path.join(process.cwd(), "migrations/0001_handoff.sql"), "utf8");
    const statements = statementsFromMigration(file);
    expect(statements[0]?.startsWith("--")).toBe(false);
    expect(statements.some((statement) => statement.startsWith("CREATE TABLE workspaces"))).toBe(true);
  });

  it("keeps the worker copy of each migration equal to the file on disk", () => {
    for (const file of [
      "0001_handoff.sql",
      "0002_sessions.sql",
      "0003_upload_shares.sql",
      "0004_knowledge.sql",
      "0005_crm.sql",
      "0006_deliverable_rounds.sql",
      "0007_agent.sql",
      "0009_conversations.sql",
      "0010_schema_checks.sql",
      "0011_schema_check_scan.sql",
      "0012_client_workflows.sql",
      "0013_workflow_task.sql",
      "0014_workflow_schedule.sql",
      "0015_mcp_catalog.sql",
      "0016_swarm_runs.sql",
      "0017_contact_opt_out.sql",
      "0018_task_position.sql",
      "0019_project_description.sql",
      "0020_connector_grants.sql",
    ]) {
      const disk = readFileSync(path.join(process.cwd(), "migrations", file), "utf8");
      expect(MIGRATION_SQL[file]).toBe(disk);
    }
  });

  it("creates the share table when the process folder has no migrations directory", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "handoff-migrate-"));
    const previous = process.cwd();
    process.chdir(dir);
    try {
      const db = new DatabaseSync(":memory:");
      await migrate(sqliteSql(db));
      const row = db.prepare("SELECT name FROM sqlite_master WHERE name = 'upload_shares'").get();
      expect(row).toEqual({ name: "upload_shares" });
      const columns = db.prepare("PRAGMA table_info(deliverables)").all() as { name: string }[];
      expect(columns.some((column) => column.name === "published_version")).toBe(true);
      await migrate(sqliteSql(db));
      const again = db.prepare("PRAGMA table_info(deliverables)").all() as { name: string }[];
      expect(again.filter((column) => column.name === "published_version")).toHaveLength(1);
      const settings = db.prepare("SELECT key, value FROM agent_settings ORDER BY key").all();
      expect(settings).toEqual([
        { key: "build_deadline_hours", value: "2" },
        { key: "max_cloud_runs", value: "4" },
        { key: "swarm_runs_backfill", value: "1" },
      ]);
      const scanColumn = db.prepare("PRAGMA table_info(schema_check_sites)").all() as { name: string }[];
      expect(scanColumn.some((column) => column.name === "scan_id")).toBe(true);
      const projectColumns = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
      expect(projectColumns.some((column) => column.name === "description")).toBe(true);
    } finally {
      process.chdir(previous);
    }
  });

  it("keeps existing deliverables and tasks when the agent columns arrive", async () => {
    const db = new DatabaseSync(":memory:");
    const sql = sqliteSql(db);
    for (const file of [
      "0001_handoff.sql",
      "0002_sessions.sql",
      "0003_upload_shares.sql",
      "0004_knowledge.sql",
      "0005_crm.sql",
      "0006_deliverable_rounds.sql",
    ]) {
      for (const statement of statementsFromMigration(MIGRATION_SQL[file] ?? "")) {
        await sql.run(statement);
      }
    }
    await sql.run(
      `INSERT INTO organizations (id, name, kind, created_at, updated_at)
       VALUES ('org-1', 'Strongfoam', 'client', 1, 1)`,
    );
    await sql.run(
      `INSERT INTO workspaces (
         id, slug, name, display_name, sender_name, policy_profile,
         quota_bytes, retention_days, request_digest, status, opened_at
       ) VALUES (
         'ws-1', 'strongfoam', 'Strongfoam', 'Strongfoam', 'Studio', 'standard',
         1, 1, 0, 'active', 1
       )`,
    );
    await sql.run(
      `INSERT INTO deliverables (
         id, organization_id, workspace_id, title, kind, status, version,
         actor_kind, created_at, updated_at, published_at, published_version
       ) VALUES (
         'del-1', 'org-1', 'ws-1', 'Launch pack', 'social_pack', 'approved', 2,
         'staff', 1, 1, 1, 2
       )`,
    );
    await sql.run(
      `INSERT INTO deliverable_items (
         id, deliverable_id, version, format, title, media_json, status
       ) VALUES ('item-1', 'del-1', 2, 'static', 'Post', '[]', 'pending')`,
    );
    await sql.run(
      `INSERT INTO tasks (id, organization_id, title, status, created_at, updated_at)
       VALUES ('task-1', 'org-1', 'Write the brief', 'todo', 1, 1)`,
    );
    await sql.run(
      `INSERT INTO knowledge_keys (id, workspace_id, token_hash, label, created_at)
       VALUES ('key-1', 'ws-1', 'hash', 'space', 1)`,
    );

    const agentSql = MIGRATION_SQL["0007_agent.sql"];
    expect(agentSql).toBeTruthy();
    for (const statement of statementsFromMigration(agentSql ?? "")) {
      await sql.run(statement);
    }

    const kept = await sql.get<{ title: string; kind: string; published_version: number }>(
      "SELECT title, kind, published_version FROM deliverables WHERE id = 'del-1'",
    );
    expect(kept).toEqual({ title: "Launch pack", kind: "social_pack", published_version: 2 });
    const item = await sql.get<{ id: string }>("SELECT id FROM deliverable_items WHERE id = 'item-1'");
    expect(item).toEqual({ id: "item-1" });
    const task = await sql.get<{ stage: string; round: number; created_by_kind: string }>(
      "SELECT stage, round, created_by_kind FROM tasks WHERE id = 'task-1'",
    );
    expect(task).toEqual({ stage: "describe", round: 1, created_by_kind: "staff" });
    const org = await sql.get<{ brief_approval: string; auto_publish_built: number }>(
      "SELECT brief_approval, auto_publish_built FROM organizations WHERE id = 'org-1'",
    );
    expect(org).toEqual({ brief_approval: "client", auto_publish_built: 1 });
    const scopes = await sql.all<{ name: string }>("PRAGMA table_info(knowledge_keys)");
    expect(scopes.filter((column) => column.name === "scopes")).toHaveLength(1);
    expect(scopes.some((column) => column.name === "organization_id")).toBe(true);

    await sql.run(
      `INSERT INTO deliverables (
         id, organization_id, workspace_id, title, kind, status,
         actor_kind, created_at, updated_at
       ) VALUES (
         'brief-1', 'org-1', 'ws-1', 'Brief', 'brief', 'draft',
         'agent', 2, 2
       )`,
    );
    await sql.run(
      `INSERT INTO deliverables (
         id, organization_id, workspace_id, title, kind, status,
         actor_kind, created_at, updated_at
       ) VALUES (
         'ds-1', 'org-1', 'ws-1', 'Design system', 'design_system', 'draft',
         'agent', 2, 2
       )`,
    );
  });
});
