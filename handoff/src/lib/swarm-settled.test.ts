import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { signWake } from "@/lib/agent-wake";
import { migrate } from "@/db/migrate";
import { sqliteSql } from "@/db/sql";
import { settleOne } from "./client-workflows";
import { handleSwarmSettled } from "./swarm-settled";

const NOW = 1_700_000_000_000;

describe("swarm settled callback", () => {
  it("rejects a bad signature", async () => {
    const body = JSON.stringify({ runId: "exec-1", sentAt: NOW });
    const response = await handleSwarmSettled(
      new Request("https://handoff.example/api/swarm-settled", {
        method: "POST",
        headers: { "x-handoff-signature": "nope" },
        body,
      }),
      { secret: "run-secret", now: NOW, settle: async () => true },
    );
    expect(response.status).toBe(401);
  });

  it("settles a signed run once", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    const sql = sqliteSql(db);
    await migrate(sql);
    await sql.run(
      `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-1', 'Northwind', 'client', ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO swarm_runs (
        id, organization_id, project_id, workflow_id, swarm_workflow_id, execution_id, template_id, name, status, trigger, started_at
      ) VALUES ('swarm-1', 'org-1', NULL, NULL, 'client-1', 'exec-1', 'skill', 'research', 'running', 'chat', ?)`,
      [NOW],
    );
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      calls.push(String(url));
      if (String(url).includes("/api/template")) return Response.json({ nodes: [{ id: "n1" }] });
      return Response.json({ status: "completed", results: { n1: { status: "done", output: "The page" } } });
    }) as typeof fetch;
    const body = JSON.stringify({ runId: "exec-1", sentAt: NOW });
    const response = await handleSwarmSettled(
      new Request("https://handoff.example/api/swarm-settled", {
        method: "POST",
        headers: { "x-handoff-signature": signWake("run-secret", body) },
        body,
      }),
      {
        secret: "run-secret",
        now: NOW,
        settle: (runId) => settleOne({ sql, runId, origin: "https://swarm.example", now: NOW, fetchImpl }),
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, settled: true });
    const row = await sql.get<{ status: string }>("SELECT status FROM swarm_runs WHERE id = 'swarm-1'");
    expect(row?.status).toBe("completed");
    const again = await settleOne({ sql, runId: "exec-1", origin: "https://swarm.example", now: NOW + 1, fetchImpl });
    expect(again).toBe(false);
    expect(calls).toHaveLength(2);
  });
});
