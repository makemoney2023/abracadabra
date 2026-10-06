import { MIGRATION_SQL } from "./migration-sql";
import type { Sql } from "./sql";

const STEPS = [
  { file: "0001_handoff.sql", table: "workspaces" },
  { file: "0002_sessions.sql", table: "sessions" },
  { file: "0003_upload_shares.sql", table: "upload_shares" },
] as const;

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
    const existing = await sql.get<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      [step.table],
    );
    if (existing?.name === step.table) continue;
    const file = MIGRATION_SQL[step.file];
    if (!file) throw new Error(`Missing migration ${step.file}`);
    for (const statement of statementsFromMigration(file)) {
      await sql.run(statement);
    }
  }
}
