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
    for (const file of ["0001_handoff.sql", "0002_sessions.sql", "0003_upload_shares.sql"]) {
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
    } finally {
      process.chdir(previous);
    }
  });
});
