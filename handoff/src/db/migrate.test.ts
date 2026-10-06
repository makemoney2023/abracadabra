import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { statementsFromMigration } from "./migrate";

describe("statementsFromMigration", () => {
  it("skips a leading comment so the first statement is SQL", () => {
    const file = readFileSync(path.join(process.cwd(), "migrations/0001_handoff.sql"), "utf8");
    const statements = statementsFromMigration(file);
    expect(statements[0]?.startsWith("--")).toBe(false);
    expect(statements.some((statement) => statement.startsWith("CREATE TABLE workspaces"))).toBe(true);
  });
});
