import { idempotentStatement, statementsFromMigration } from "./migrate";
import { SEARCH_MIGRATION_SQL } from "./search-migration-sql";
import type { Sql } from "./sql";

/**
 * Migrations for the handoff-search D1 database (binding SEARCH_DB), kept apart from handoff's own migrate().
 * Same pattern: a step is applied when its last table exists; each statement runs on its own with IF NOT EXISTS,
 * so a step that stopped halfway finishes on the next run. The search-sync queue consumer runs this once per isolate.
 */
export const SEARCH_STEPS = [{ file: "s0001_facts.sql", table: "search_api_minute" }] as const;

async function stepApplied(sql: Sql, table: string): Promise<boolean> {
  const row = await sql.get<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [table]);
  return row?.name === table;
}

export async function migrateSearch(sql: Sql): Promise<void> {
  for (const step of SEARCH_STEPS) {
    if (await stepApplied(sql, step.table)) continue;
    const file = SEARCH_MIGRATION_SQL[step.file];
    if (!file) throw new Error(`Missing search migration ${step.file}`);
    for (const statement of statementsFromMigration(file)) await sql.run(idempotentStatement(statement));
  }
}
