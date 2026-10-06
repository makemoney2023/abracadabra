import { readFileSync } from "node:fs";
import path from "node:path";
import type { Sql } from "./sql";

export async function migrate(sql: Sql): Promise<void> {
  const existing = await sql.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'",
  );
  if (existing?.name === "workspaces") return;
  const file = readFileSync(path.join(process.cwd(), "migrations", "0001_handoff.sql"), "utf8");
  await sql.exec(file);
}
