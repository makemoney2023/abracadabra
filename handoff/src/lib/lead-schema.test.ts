import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { beginDirectClient, finishManualLead, leadScanTarget, startLeadSchemaScan } from "./lead-schema";

const NOW = 1_700_000_000_000;

async function database(): Promise<Sql> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  await sql.exec(`
    CREATE TABLE readiness_scans (
      id TEXT PRIMARY KEY,
      public_token TEXT NOT NULL UNIQUE,
      domain TEXT NOT NULL,
      origin TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      organization_id TEXT,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );
  `);
  await sql.run(
    `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-1', 'Foam', 'lead', ?, ?)`,
    [NOW, NOW],
  );
  return sql;
}

describe("lead schema scan", () => {
  it("reads a website into a domain", () => {
    expect(leadScanTarget("https://www.Foam.example/about")).toEqual({
      domain: "foam.example",
      origin: "https://foam.example",
    });
    expect(leadScanTarget("")).toBeNull();
    expect(leadScanTarget("not a site")).toBeNull();
  });

  it("queues a scan and records that it started", async () => {
    const sql = await database();
    const sent: { type: string; scanId: string }[] = [];
    const started = await startLeadSchemaScan({
      sql,
      organizationId: "org-1",
      website: "https://foam.example",
      now: NOW,
      queue: {
        send: async (body) => {
          sent.push(body);
        },
      },
    });
    expect(started.status).toBe("queued");
    expect(sent).toEqual([{ type: "scan", scanId: started.scanId }]);
    const scan = await sql.get<{ status: string; organization_id: string; domain: string }>(
      "SELECT status, organization_id, domain FROM readiness_scans WHERE id = ?",
      [started.scanId],
    );
    expect(scan).toEqual({ status: "queued", organization_id: "org-1", domain: "foam.example" });
    const activity = await sql.get<{ body: string; kind: string; data_json: string }>(
      "SELECT kind, body, data_json FROM activities WHERE organization_id = 'org-1'",
    );
    expect(activity?.kind).toBe("schema.scan");
    expect(activity?.body).toBe("Schema scan started for foam.example.");
    const data = JSON.parse(activity?.data_json ?? "{}") as { publicToken?: string };
    expect(typeof data.publicToken).toBe("string");
    expect((data.publicToken ?? "").length).toBeGreaterThan(8);
  });

  it("records that a lead with no website did not start a scan", async () => {
    const sql = await database();
    const started = await startLeadSchemaScan({ sql, organizationId: "org-1", website: "", now: NOW });
    expect(started).toEqual({ scanId: null, domain: null, status: "not_started" });
    const activity = await sql.get<{ body: string }>("SELECT body FROM activities WHERE organization_id = 'org-1'");
    expect(activity?.body).toBe("Schema scan did not start. This lead has no website.");
  });

  it("waits for the finished scan before waking a website lead", async () => {
    const sql = await database();
    const calls: string[] = [];
    await finishManualLead({
      sql,
      organizationId: "org-1",
      website: "https://foam.example",
      now: NOW,
      queue: { send: async () => {} },
      env: { AGENT_URL: "https://agent.example", AGENT_WAKE_SECRET: "wake-secret" },
      fetchImpl: async () => {
        calls.push("wake");
        return new Response("ok");
      },
    });
    expect(calls).toEqual([]);
  });

  it("wakes immediately when the lead has no website", async () => {
    const sql = await database();
    const reasons: string[] = [];
    await finishManualLead({
      sql,
      organizationId: "org-1",
      website: "",
      now: NOW,
      env: { AGENT_URL: "https://agent.example", AGENT_WAKE_SECRET: "wake-secret" },
      fetchImpl: async (_url, init) => {
        reasons.push(String(JSON.parse(String(init?.body ?? "{}")).reason));
        return new Response("ok");
      },
    });
    expect(reasons).toEqual(["lead_created"]);
  });

  it("records a missed wake when the secret is missing", async () => {
    const sql = await database();
    await finishManualLead({
      sql,
      organizationId: "org-1",
      website: "",
      now: NOW,
      env: { AGENT_URL: "https://agent.example" },
    });
    const miss = await sql.get<{ kind: string }>(
      "SELECT kind FROM activities WHERE organization_id = 'org-1' AND kind = 'agent.wake_failed'",
    );
    expect(miss?.kind).toBe("agent.wake_failed");
  });

  it("opens a file space and queues a schema scan for a client who was not a lead", async () => {
    const sql = await database();
    await sql.run("UPDATE organizations SET kind = 'client', website = 'https://foam.example', domain = 'foam.example' WHERE id = 'org-1'");
    const sent: { type: string; scanId: string }[] = [];
    const calls: string[] = [];
    await beginDirectClient({
      sql,
      organizationId: "org-1",
      website: "https://foam.example",
      now: NOW,
      queue: {
        send: async (body) => {
          sent.push(body);
        },
      },
      env: { AGENT_URL: "https://agent.example", AGENT_WAKE_SECRET: "wake-secret" },
      fetchImpl: async () => {
        calls.push("wake");
        return new Response("ok");
      },
    });
    expect(calls).toEqual([]);
    expect(sent).toHaveLength(1);
    const space = await sql.get<{ organization_id: string; slug: string }>(
      "SELECT organization_id, slug FROM workspaces WHERE organization_id = 'org-1'",
    );
    expect(space).toEqual({ organization_id: "org-1", slug: "foam-example" });
    const request = await sql.get<{ title: string }>(
      "SELECT title FROM requests WHERE workspace_id = (SELECT id FROM workspaces WHERE organization_id = 'org-1')",
    );
    expect(request?.title).toBe("Files");
    const activity = await sql.get<{ body: string }>(
      "SELECT body FROM activities WHERE organization_id = 'org-1' AND kind = 'schema.scan'",
    );
    expect(activity?.body).toBe("Schema scan started for foam.example.");
  });

  it("opens a file space and wakes now when the client has no website", async () => {
    const sql = await database();
    await sql.run("UPDATE organizations SET kind = 'client' WHERE id = 'org-1'");
    const reasons: string[] = [];
    await beginDirectClient({
      sql,
      organizationId: "org-1",
      website: "",
      now: NOW,
      env: { AGENT_URL: "https://agent.example", AGENT_WAKE_SECRET: "wake-secret" },
      fetchImpl: async (_url, init) => {
        reasons.push(String(JSON.parse(String(init?.body ?? "{}")).reason));
        return new Response("ok");
      },
    });
    expect(reasons).toEqual(["lead_created"]);
    const space = await sql.get<{ id: string }>("SELECT id FROM workspaces WHERE organization_id = 'org-1'");
    expect(space?.id).toBeTruthy();
    const activity = await sql.get<{ body: string }>(
      "SELECT body FROM activities WHERE organization_id = 'org-1' AND kind = 'schema.scan'",
    );
    expect(activity?.body).toBe("Schema scan did not start. This client has no website.");
  });
});
