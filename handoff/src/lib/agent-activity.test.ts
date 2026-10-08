import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql } from "@/db/sql";
import { activityLinks, recordAgentRun } from "./agent-activity";

const NOW = 1_700_000_000_000;

async function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  await sql.run(
    `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-1', 'Foam', 'lead', ?, ?)`,
    [NOW, NOW],
  );
  return sql;
}

describe("agent activity", () => {
  it("updates the same swarm row when the activity key matches", async () => {
    const sql = await database();
    await recordAgentRun(sql, {
      organizationId: "org-1",
      kind: "agent.swarm_run",
      body: "Still writing.",
      status: "running",
      data: { requestId: "wake-1:swarm-run", executionId: "ex-1" },
      now: NOW,
    });
    await recordAgentRun(sql, {
      organizationId: "org-1",
      kind: "agent.swarm_run",
      body: "The audit is done.",
      status: "completed",
      data: { requestId: "wake-1:swarm-run", executionId: "ex-1" },
      now: NOW + 45_000,
    });
    const rows = await sql.all<{ body: string; created_at: number }>(
      "SELECT body, created_at FROM activities WHERE organization_id = 'org-1' AND kind = 'agent.swarm_run'",
    );
    expect(rows).toEqual([{ body: "The audit is done.", created_at: NOW + 45_000 }]);
  });

  it("builds the report link and the saved files", () => {
    expect(
      activityLinks(JSON.stringify({ publicToken: "token-1", artifacts: ["agent/schema/home.md", ""] })),
    ).toEqual({
      reportUrl: "https://check.abra-ca-dabra.app/scan/token-1",
      artifacts: ["agent/schema/home.md"],
    });
    expect(activityLinks("not json")).toEqual({ reportUrl: null, artifacts: [] });
  });
});
