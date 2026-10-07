import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import { LIMITS } from "@/lib/policy/limits";
import { dueOrganizations, signWake, verifyWake, wakeDueAgents } from "@/lib/agent-wake";

const NOW = 1_700_000_000_000;
const FIVE_MINUTES = 5 * 60 * 1000;

describe("signed wakes", () => {
  let directory = "";

  afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  async function db(): Promise<Sql> {
    directory = mkdtempSync(path.join(tmpdir(), "handoff-wake-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.sqlite");
    const sql = await openHandoffDb();
    await migrate(sql);
    return sql;
  }

  async function org(sql: Sql, id: string): Promise<void> {
    await sql.run(
      `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES (?, ?, 'client', ?, ?)`,
      [id, id, NOW, NOW],
    );
  }

  it("accepts a fresh signature and rejects a changed body, a bad key, and a late replay", () => {
    const body = JSON.stringify({ organizationId: "org-1", reason: "work", sentAt: NOW });
    const signature = signWake("wake-secret", body);
    expect(verifyWake("wake-secret", body, signature, NOW)).toBe(true);
    expect(verifyWake("wake-secret", body, signature, NOW + FIVE_MINUTES)).toBe(true);
    expect(verifyWake("wake-secret", body.replace("work", "status"), signature, NOW)).toBe(false);
    expect(verifyWake("other-secret", body, signature, NOW)).toBe(false);
    expect(verifyWake("wake-secret", body, signature, NOW + FIVE_MINUTES + 1)).toBe(false);
  });

  it("wakes a client with open work and skips a paused or archived client", async () => {
    const sql = await db();
    await org(sql, "org-open");
    await org(sql, "org-paused");
    await sql.run(
      `UPDATE organizations SET agent_paused_at = ?, archived_at = NULL WHERE id = 'org-paused'`,
      [NOW],
    );
    await org(sql, "org-archived");
    await sql.run("UPDATE organizations SET archived_at = ? WHERE id = 'org-archived'", [NOW]);
    await org(sql, "org-idle");
    for (const id of ["org-open", "org-paused", "org-archived"]) {
      await sql.run(
        `INSERT INTO tasks (id, organization_id, title, status, created_at, updated_at)
         VALUES (?, ?, 'Homepage', 'todo', ?, ?)`,
        [`task-${id}`, id, NOW, NOW],
      );
    }
    await sql.run(
      `INSERT INTO activities (id, organization_id, kind, actor_kind, body, created_at)
       VALUES ('flag-1', 'org-idle', 'context_changed', 'system', 'Files landed.', ?)`,
      [NOW],
    );

    const quarter = await dueOrganizations(sql, "*/15 * * * *");
    expect(quarter.map((row) => row.organizationId).sort()).toEqual(["org-idle", "org-open"]);
    expect(quarter.find((row) => row.organizationId === "org-open")?.reason).toBe("work");
    expect(quarter.find((row) => row.organizationId === "org-idle")?.reason).toBe("context_changed");

    const hourly = await dueOrganizations(sql, "0 * * * *");
    expect(hourly).toEqual([]);
    const weekly = await dueOrganizations(sql, "0 8 * * 1");
    expect(weekly.map((row) => row.organizationId).sort()).toEqual(["org-idle", "org-open"]);
    expect(weekly.every((row) => row.reason === "status")).toBe(true);
  });

  it("records a failed wake and does not record a delivered one", async () => {
    const sql = await db();
    await org(sql, "org-open");
    await sql.run(
      `INSERT INTO tasks (id, organization_id, title, status, created_at, updated_at)
       VALUES ('task-1', 'org-open', 'Homepage', 'todo', ?, ?)`,
      [NOW, NOW],
    );
    const calls: { url: string; body: string; signature: string }[] = [];
    await wakeDueAgents(
      sql,
      { AGENT_URL: "https://agent.example", AGENT_WAKE_SECRET: "wake-secret" },
      "*/15 * * * *",
      NOW,
      async (url, init) => {
        calls.push({
          url,
          body: String(init?.body),
          signature: new Headers(init?.headers).get("x-handoff-signature") ?? "",
        });
        return new Response("no", { status: 502 });
      },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://agent.example/wake");
    expect(verifyWake("wake-secret", calls[0]?.body ?? "", calls[0]?.signature ?? "", NOW)).toBe(true);
    const failed = await sql.get<{ kind: string; actor_kind: string }>(
      "SELECT kind, actor_kind FROM activities WHERE organization_id = 'org-open' AND kind = 'agent.wake_failed'",
    );
    expect(failed).toEqual({ kind: "agent.wake_failed", actor_kind: "system" });

    await sql.run("DELETE FROM activities WHERE kind = 'agent.wake_failed'");
    await wakeDueAgents(
      sql,
      { AGENT_URL: "https://agent.example", AGENT_WAKE_SECRET: "wake-secret" },
      "*/15 * * * *",
      NOW,
      async () => new Response("ok", { status: 202 }),
    );
    const again = await sql.get<{ n: number }>(
      "SELECT count(*) AS n FROM activities WHERE kind = 'agent.wake_failed'",
    );
    expect(again?.n).toBe(0);
  });

  it("checks an open cloud run on the hour", async () => {
    const sql = await db();
    await org(sql, "org-build");
    await sql.run(
      `INSERT INTO workspaces (
        id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days,
        request_digest, status, opened_at, archived_at, purged_at, organization_id
      ) VALUES ('ws-build', 'foam-build', 'Foam', 'Foam', 'Abracadabra', 'standard', ?, ?, 0, 'active', ?, NULL, NULL, 'org-build')`,
      [LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, NOW],
    );
    await sql.run(
      `INSERT INTO tasks (id, organization_id, title, status, created_at, updated_at)
       VALUES ('task-build', 'org-build', 'Site', 'doing', ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO deliverables (
        id, organization_id, workspace_id, title, kind, status, version, actor_kind, created_at, updated_at
      ) VALUES ('del-build', 'org-build', 'ws-build', 'Site', 'website', 'draft', 1, 'agent', ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO repos (id, github_repo_id, full_name, organization_id, created_at)
       VALUES ('repo-build', 7, 'makemoney2023/foam', 'org-build', ?)`,
      [NOW],
    );
    await sql.run(
      `INSERT INTO cloud_runs (
        id, task_id, deliverable_id, repo_id, round, status, started_at, deadline_at
      ) VALUES ('bc-1', 'task-build', 'del-build', 'repo-build', 1, 'started', ?, ?)`,
      [NOW, NOW],
    );
    const hourly = await dueOrganizations(sql, "0 * * * *");
    expect(hourly).toEqual([{ organizationId: "org-build", reason: "run_check" }]);
  });
});
