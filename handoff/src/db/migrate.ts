import { readFileSync } from "node:fs";
import path from "node:path";
import type { Sql } from "./sql";

const STEPS = [
  { file: "0001_handoff.sql", table: "workspaces" },
  { file: "0002_sessions.sql", table: "sessions" },
] as const;

export async function migrate(sql: Sql): Promise<void> {
  for (const step of STEPS) {
    const existing = await sql.get<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      [step.table],
    );
    if (existing?.name === step.table) continue;
    const file = readFileSync(path.join(process.cwd(), "migrations", step.file), "utf8");
    await sql.exec(file);
  }
}
