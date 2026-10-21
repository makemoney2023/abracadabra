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
  { file: "0022_specialist_pipeline.sql", column: { table: "client_workflows", name: "last_receipt" } },
  { file: "0023_pipeline_auto.sql", column: { table: "workflow_groups", name: "brief" } },
  { file: "0024_lead_scores.sql", column: { table: "deals", name: "routing_status" } },
  { file: "0025_client_work.sql", table: "client_work_requests" },
  { file: "0026_agent_work.sql", table: "skill_grants" },
  { file: "0027_org_parent.sql", index: "organizations_parent" },
  { file: "0028_task_review.sql", column: { table: "tasks", name: "review_note" } },
  { file: "0029_task_skill_packs.sql", index: "task_skill_packs_task" },
  { file: "0030_today_feed.sql", table: "staff_feed_seen" },
  { file: "0031_task_agent_owner.sql", index: "tasks_agent_assignee" },
  { file: "0032_agent_work_review.sql", index: "agent_work_items_review" },
] as const;

type Step = (typeof STEPS)[number];

async function stepApplied(sql: Sql, step: Step): Promise<boolean> {
  if ("index" in step) {
    const index = await sql.get<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
      [step.index],
    );
    return index?.name === step.index;
  }
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

/**
 * A step is marked applied by its last table or column, so a step that stopped halfway runs again from the top.
 * CREATE TABLE and CREATE INDEX get IF NOT EXISTS so that re-run finishes instead of failing on the first table.
 * Only steps that are not applied yet run, so a database that is already current is not touched.
 */
export function idempotentStatement(statement: string): string {
  return statement
    .replace(/^CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS\b)/i, "CREATE TABLE IF NOT EXISTS ")
    .replace(/^CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS\b)/i, (_match, unique?: string) => `CREATE ${unique ? "UNIQUE " : ""}INDEX IF NOT EXISTS `);
}

function alreadyAddedColumn(statement: string, error: unknown): boolean {
  return /^ALTER\s+TABLE\s+\S+\s+ADD\s+COLUMN\b/i.test(statement) && error instanceof Error && /duplicate column name/i.test(error.message);
}

/**
 * HANDOFF_SKIP_MIGRATIONS (comma-separated file names) holds steps back. A preview version shares the live D1, so a
 * preview upload sets it to keep a new step off the live database until the real deploy. Never set it on a deploy.
 */
export function skippedMigrations(value = process.env.HANDOFF_SKIP_MIGRATIONS): Set<string> {
  return new Set((value ?? "").split(",").map((name) => name.trim()).filter(Boolean));
}

export async function migrate(sql: Sql): Promise<void> {
  const skipped = skippedMigrations();
  for (const step of STEPS) {
    if (skipped.has(step.file)) continue;
    if (await stepApplied(sql, step)) continue;
    const file = MIGRATION_SQL[step.file];
    if (!file) throw new Error(`Missing migration ${step.file}`);
    for (const raw of statementsFromMigration(file)) {
      const statement = idempotentStatement(raw);
      try {
        await sql.run(statement);
      } catch (error) {
        if (!alreadyAddedColumn(statement, error)) throw error;
      }
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
