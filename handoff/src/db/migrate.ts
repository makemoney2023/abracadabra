import { backfillSwarmRuns } from "../lib/swarm-runs";
import { MIGRATION_SQL } from "./migration-sql";
import type { Sql } from "./sql";

const STEPS = [
  { file: "0001_handoff.sql", table: "workspaces" },
  { file: "0002_sessions.sql", table: "sessions" },
  { file: "0003_upload_shares.sql", table: "upload_shares" },
  { file: "0004_knowledge.sql", table: "file_reads" },
  { file: "0005_crm.sql", table: "organizations" },
  { file: "0006_deliverable_rounds.sql", column: { table: "deliverables", name: "published_version" } },
  { file: "0007_agent.sql", table: "agent_settings" },
  { file: "0009_conversations.sql", table: "work_requests" },
  { file: "0010_schema_checks.sql", table: "schema_checks" },
  { file: "0011_schema_check_scan.sql", column: { table: "schema_check_sites", name: "scan_id" } },
  { file: "0012_client_workflows.sql", table: "workflow_groups" },
  { file: "0013_workflow_task.sql", column: { table: "client_workflows", name: "task_id" } },
  { file: "0014_workflow_schedule.sql", column: { table: "client_workflows", name: "next_run_at" } },
  { file: "0015_mcp_catalog.sql", column: { table: "client_workflows", name: "mcp_server_ids" } },
  { file: "0016_swarm_runs.sql", table: "swarm_runs" },
  { file: "0017_contact_opt_out.sql", column: { table: "contacts", name: "opted_out" } },
  { file: "0018_task_position.sql", column: { table: "tasks", name: "position" } },
  { file: "0019_project_description.sql", column: { table: "projects", name: "description" } },
  { file: "0020_connector_grants.sql", table: "connector_grants" },
  { file: "0021_workflow_chain.sql", column: { table: "client_workflows", name: "last_output" } },
] as const;

type Step = (typeof STEPS)[number];

async function stepApplied(sql: Sql, step: Step): Promise<boolean> {
  if ("column" in step) {
    if (!/^[a-z_]+$/.test(step.column.table)) return false;
    const columns = await sql.all<{ name: string }>(`PRAGMA table_info(${step.column.table})`);
    return columns.some((column) => column.name === step.column.name);
  }
  const existing = await sql.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [step.table],
  );
  return existing?.name === step.table;
}

/** D1 rejects a script whose first line is a comment, so each statement is run on its own. */
export function statementsFromMigration(file: string): string[] {
  const stripped = file
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith("--");
    })
    .join("\n");
  return stripped
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

export async function migrate(sql: Sql): Promise<void> {
  for (const step of STEPS) {
    if (await stepApplied(sql, step)) continue;
    const file = MIGRATION_SQL[step.file];
    if (!file) throw new Error(`Missing migration ${step.file}`);
    for (const statement of statementsFromMigration(file)) {
      await sql.run(statement);
    }
  }
  const marked = await sql.get<{ value: string }>(
    "SELECT value FROM agent_settings WHERE key = 'swarm_runs_backfill'",
  );
  if (marked) return;
  await backfillSwarmRuns(sql, Date.now());
  try {
    await sql.run("INSERT INTO agent_settings (key, value) VALUES ('swarm_runs_backfill', '1')");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("UNIQUE")) throw error;
  }
}
