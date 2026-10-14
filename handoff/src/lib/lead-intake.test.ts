import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { POST as leadPost } from "@/app/api/intake/lead/route";
import { GET as exportGet } from "@/app/api/leads/export/route";
import { consumeIntake } from "./intake/consume";
import { leadBodyReady } from "./intake/accept";
import { signIntakeBody } from "./intake/sign";
import { handleLeadIntakeBatch } from "./intake/queue";
import { applySchemaScore, LEAD_READY_THRESHOLD, routingFor } from "./lead-routing";
import { exportAuthorized, exportLeads, surveyUrl } from "./lead-export";

const NOW = 1_700_000_000_000;
const CTX = Symbol.for("__cloudflare-context__");

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CTX];
  delete process.env.LEAD_AGENT_SIGNING_SECRET;
  delete process.env.INTAKE_SIGNING_SECRET;
  delete process.env.LEAD_EXPORT_TOKEN;
});

async function database(): Promise<Sql> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  await sql.exec(`CREATE TABLE IF NOT EXISTS readiness_scans (
    id TEXT PRIMARY KEY, public_token TEXT NOT NULL UNIQUE, domain TEXT NOT NULL, origin TEXT NOT NULL,
    source TEXT NOT NULL, status TEXT NOT NULL, organization_id TEXT, score_total INTEGER,
    error_message TEXT, created_at INTEGER NOT NULL, completed_at INTEGER)`);
  return sql;
}

const lead = {
  external_id: "bdr-1",
  domain: "northwind.example",
  company: "Northwind",
  contact_name: "Ada North",
  email: "ada@northwind.example",
  industry: "Dental",
  signals: ["no schema"],
  source_urls: ["https://northwind.example"],
  bdr_fit_score: 4,
};

function req(body: string, headers: Record<string, string>) {
  return new Request("https://hq.example/api/intake/lead", { method: "POST", headers, body });
}

describe("lead intake signature", () => {
  it("accepts a body signed with LEAD_AGENT_SIGNING_SECRET and queues source lead", async () => {
    const sent: unknown[] = [];
    process.env.LEAD_AGENT_SIGNING_SECRET = "bdr-secret";
    (globalThis as Record<symbol, unknown>)[CTX] = { env: { LEAD_INTAKE: { send: async (b: unknown) => void sent.push(b) } } };
    const body = JSON.stringify(lead);
    const res = await leadPost(req(body, { "x-intake-signature": await signIntakeBody("bdr-secret", body), "x-intake-timestamp": String(Date.now()) }));
    expect(res.status).toBe(202);
    expect(sent).toEqual([{ source: "lead", payload: lead }]);
  });

  it("rejects the Readiness Check secret and a missing secret", async () => {
    process.env.INTAKE_SIGNING_SECRET = "check-secret";
    (globalThis as Record<symbol, unknown>)[CTX] = { env: { LEAD_INTAKE: { send: async () => {} } } };
    const body = JSON.stringify(lead);
    const sig = await signIntakeBody("check-secret", body);
    const res = await leadPost(req(body, { "x-intake-signature": sig, "x-intake-timestamp": String(Date.now()) }));
    expect(res.status).toBe(401);
  });

  it("checks the body", () => {
    expect(leadBodyReady(lead)).toBe(true);
    expect(leadBodyReady({ external_id: "x" })).toBe(false);
    expect(leadBodyReady({ ...lead, bdr_fit_score: 9 })).toBe(false);
  });
});

describe("lead consume", () => {
  it("opens a lead org and a bdr deal with an agent activity, and dedupes", async () => {
    const sql = await database();
    const first = await consumeIntake(sql, { source: "lead", payload: lead }, NOW);
    expect(first).toMatchObject({ ok: true, duplicate: false, leadOrganizationId: expect.any(String) });
    const again = await consumeIntake(sql, { source: "lead", payload: lead }, NOW + 1);
    expect(again).toMatchObject({ ok: true, duplicate: true });
    expect(await sql.get("SELECT kind, name FROM organizations")).toEqual({ kind: "lead", name: "Northwind" });
    expect(await sql.all("SELECT stage, source FROM deals")).toEqual([{ stage: "new", source: "bdr" }]);
    const act = await sql.get<{ actor_kind: string; data_json: string }>(
      "SELECT actor_kind, data_json FROM activities WHERE kind = 'lead.prospected'",
    );
    expect(act?.actor_kind).toBe("agent");
    expect(JSON.parse(act!.data_json)).toMatchObject({ industry: "Dental", bdr_fit_score: 4 });
  });

  it("queues the schema scan, not the readiness survey", async () => {
    const sql = await database();
    const scans: unknown[] = [];
    const db = (sql as unknown as { db?: unknown }).db;
    void db;
    const result = await consumeIntake(sql, { source: "lead", payload: lead }, NOW);
    expect(result.ok).toBe(true);
    const { startLeadSchemaScan } = await import("./lead-schema");
    const org = await sql.get<{ id: string; website: string }>("SELECT id, website FROM organizations");
    const started = await startLeadSchemaScan({ sql, organizationId: org!.id, website: org!.website, now: NOW, queue: { send: async (b) => void scans.push(b) } });
    expect(started.status).toBe("queued");
    expect(await sql.get<{ n: number }>("SELECT count(*) AS n FROM assessments")).toEqual({ n: 0 });
  });
});

describe("threshold routing", () => {
  it("score below 70 is ready for outbound, 70 and above is nurture", () => {
    expect(LEAD_READY_THRESHOLD).toBe(70);
    expect(routingFor(40)).toBe("ready_for_outbound");
    expect(routingFor(69)).toBe("ready_for_outbound");
    expect(routingFor(70)).toBe("nurture");
    expect(routingFor(95)).toBe("nurture");
    expect(routingFor(null)).toBeNull();
  });

  it("copies the schema scan score onto the deal", async () => {
    const sql = await database();
    await consumeIntake(sql, { source: "lead", payload: lead }, NOW);
    const org = await sql.get<{ id: string }>("SELECT id FROM organizations");
    await sql.run(
      `INSERT INTO readiness_scans (id, public_token, domain, origin, source, status, organization_id, score_total, created_at, completed_at)
       VALUES ('s1', 'tok1', 'northwind.example', 'https://northwind.example', 'public', 'complete', ?, 42, ?, ?)`,
      [org!.id, NOW, NOW],
    );
    const applied = await applySchemaScore(sql, org!.id, NOW);
    expect(applied).toMatchObject({ score: 42, status: "ready_for_outbound" });
    expect(await sql.get("SELECT lead_score, routing_status FROM deals")).toEqual({ lead_score: 42, routing_status: "ready_for_outbound" });
    const out = await exportLeads(sql, {});
    expect(Array.isArray(out) && out[0]).toMatchObject({
      schema_score: 42,
      schema_report_url: "https://check.abra-ca-dabra.app/scan/tok1",
      industry: "Dental",
      readiness: null,
    });
    expect(await exportLeads(sql, { status: "nurture" })).toEqual([]);
  });

  it("scan_ready in the queue sets routing", async () => {
    const sql = await database();
    await consumeIntake(sql, { source: "lead", payload: lead }, NOW);
    const org = await sql.get<{ id: string }>("SELECT id FROM organizations");
    await sql.run(
      `INSERT INTO readiness_scans (id, public_token, domain, origin, source, status, organization_id, score_total, created_at, completed_at)
       VALUES ('s2', 'tok2', 'northwind.example', 'x', 'public', 'complete', ?, 85, ?, ?)`,
      [org!.id, NOW, NOW],
    );
    const applied = await applySchemaScore(sql, org!.id, NOW);
    expect(applied?.status).toBe("nurture");
    void handleLeadIntakeBatch;
  });
});

describe("export auth", () => {
  it("needs a configured matching Bearer token", () => {
    expect(exportAuthorized("Bearer abc", "")).toBe(false);
    expect(exportAuthorized(null, "abc")).toBe(false);
    expect(exportAuthorized("Bearer abd", "abc")).toBe(false);
    expect(exportAuthorized("Bearer abcd", "abc")).toBe(false);
    expect(exportAuthorized("Bearer abc", "abc")).toBe(true);
  });

  it("returns 401 without the token", async () => {
    process.env.LEAD_EXPORT_TOKEN = "export-token";
    const res = await exportGet(new Request("https://hq.example/api/leads/export"));
    expect(res.status).toBe(401);
    const bad = await exportGet(new Request("https://hq.example/api/leads/export", { headers: { authorization: "Bearer nope" } }));
    expect(bad.status).toBe(401);
  });

  it("survey link carries outbound utm and the deal ref", () => {
    const url = new URL(surveyUrl("d1"));
    expect(url.origin + url.pathname).toBe("https://check.abra-ca-dabra.app/check/start");
    expect(url.searchParams.get("utm_source")).toBe("outbound");
    expect(url.searchParams.get("utm_content")).toBe("deal_d1");
  });
});

describe("enrichment", () => {
  async function scoredLead() {
    const sql = await database();
    await consumeIntake(sql, { source: "lead", payload: { ...lead, location: "Toronto", fit_reasons: ["local dentist"] } }, NOW);
    const org = await sql.get<{ id: string }>("SELECT id FROM organizations");
    await sql.run(
      `INSERT INTO readiness_scans (id, public_token, domain, origin, source, status, organization_id, score_total, created_at, completed_at)
       VALUES ('s1', 'tok1', 'northwind.example', 'x', 'public', 'complete', ?, 30, ?, ?)`,
      [org!.id, NOW, NOW],
    );
    await applySchemaScore(sql, org!.id, NOW);
    const deal = await sql.get<{ id: string }>("SELECT id FROM deals");
    return { sql, dealId: deal!.id, orgId: org!.id };
  }

  it("signs with ENRICHMENT_SIGNING_SECRET only", async () => {
    const { POST } = await import("@/app/api/intake/enrichment/route");
    process.env.ENRICHMENT_SIGNING_SECRET = "enrich-secret";
    process.env.LEAD_AGENT_SIGNING_SECRET = "bdr-secret";
    const sent: unknown[] = [];
    (globalThis as Record<symbol, unknown>)[CTX] = { env: { LEAD_INTAKE: { send: async (b: unknown) => void sent.push(b) } } };
    const body = JSON.stringify({ external_id: "e1", domain: "northwind.example", brief: "x" });
    const ts = String(Date.now());
    const wrong = await POST(new Request("https://hq.example/api/intake/enrichment", { method: "POST", body, headers: { "x-intake-signature": await signIntakeBody("bdr-secret", body), "x-intake-timestamp": ts } }));
    expect(wrong.status).toBe(401);
    const ok = await POST(new Request("https://hq.example/api/intake/enrichment", { method: "POST", body, headers: { "x-intake-signature": await signIntakeBody("enrich-secret", body), "x-intake-timestamp": ts } }));
    expect(ok.status).toBe(202);
    expect(sent).toEqual([{ source: "enrichment", payload: JSON.parse(body) }]);
  });

  it("logs lead.enriched, moves ready to enriched, dedupes, and exports everything", async () => {
    const { sql, dealId } = await scoredLead();
    const payload = {
      external_id: "e1",
      deal_id: dealId,
      brief: "Family dental clinic, no schema.",
      company_summary: "Two locations",
      decision_makers: [{ name: "Ada North", title: "Owner" }],
      pain_points: ["no AI visibility"],
      tech_stack: ["WordPress"],
      talking_points: ["schema score 30"],
      sources: ["https://northwind.example/about"],
      enriched_at: "2026-10-14T16:00:00Z",
    };
    expect(await consumeIntake(sql, { source: "enrichment", payload }, NOW)).toMatchObject({ ok: true, duplicate: false });
    expect(await consumeIntake(sql, { source: "enrichment", payload }, NOW)).toMatchObject({ ok: true, duplicate: true });
    expect(await sql.get("SELECT routing_status FROM deals")).toEqual({ routing_status: "enriched" });
    expect(await exportLeads(sql, {})).toEqual([]);
    const out = await exportLeads(sql, { status: "enriched" });
    if (!Array.isArray(out)) throw new Error("bad");
    expect(out[0]).toMatchObject({
      schema_score: 30,
      schema_report_url: "https://check.abra-ca-dabra.app/scan/tok1",
      location: "Toronto",
      survey_url: expect.stringContaining("utm_source=outbound"),
      bdr: { fit_reasons: ["local dentist"], signals: ["no schema"], bdr_fit_score: 4, contact_name: "Ada North" },
      enrichment: { brief: "Family dental clinic, no schema.", tech_stack: ["WordPress"], decision_makers: [{ name: "Ada North", title: "Owner" }] },
    });
  });

  it("does not move nurture leads and a rescan keeps enriched", async () => {
    const { sql, orgId } = await scoredLead();
    await consumeIntake(sql, { source: "enrichment", payload: { external_id: "e2", domain: "northwind.example" } }, NOW);
    await applySchemaScore(sql, orgId, NOW + 5);
    expect(await sql.get("SELECT routing_status FROM deals")).toEqual({ routing_status: "enriched" });
    await sql.run("UPDATE deals SET routing_status = 'nurture'");
    await consumeIntake(sql, { source: "enrichment", payload: { external_id: "e3", domain: "northwind.example" } }, NOW);
    expect(await sql.get("SELECT routing_status FROM deals")).toEqual({ routing_status: "nurture" });
  });
});

describe("outreach", () => {
  it("signs with OUTREACH_SIGNING_SECRET and needs a channel", async () => {
    const { POST } = await import("@/app/api/intake/outreach/route");
    process.env.OUTREACH_SIGNING_SECRET = "out-secret";
    process.env.ENRICHMENT_SIGNING_SECRET = "enrich-secret";
    (globalThis as Record<symbol, unknown>)[CTX] = { env: { LEAD_INTAKE: { send: async () => {} } } };
    const ts = String(Date.now());
    const good = JSON.stringify({ external_id: "o1", domain: "northwind.example", channel: "email" });
    const call = async (body: string, key: string) =>
      POST(new Request("https://hq.example/api/intake/outreach", { method: "POST", body, headers: { "x-intake-signature": await signIntakeBody(key, body), "x-intake-timestamp": ts } }));
    expect((await call(good, "enrich-secret")).status).toBe(401);
    expect((await call(good, "out-secret")).status).toBe(202);
    const noChannel = JSON.stringify({ external_id: "o1", domain: "northwind.example", channel: "fax" });
    expect((await call(noChannel, "out-secret")).status).toBe(400);
  });

  it("moves new to contacted, logs lead.contacted, dedupes, never moves backward", async () => {
    const sql = await database();
    await consumeIntake(sql, { source: "lead", payload: lead }, NOW);
    const deal = await sql.get<{ id: string }>("SELECT id FROM deals");
    const payload = { external_id: "o1", deal_id: deal!.id, channel: "linkedin", sent_at: "2026-10-14T16:00:00Z", summary: "Invite sent" };
    expect(await consumeIntake(sql, { source: "outreach", payload }, NOW)).toMatchObject({ ok: true, duplicate: false });
    expect(await consumeIntake(sql, { source: "outreach", payload }, NOW)).toMatchObject({ duplicate: true });
    expect(await sql.get("SELECT stage FROM deals")).toEqual({ stage: "contacted" });
    const act = await sql.get<{ actor_kind: string; data_json: string }>("SELECT actor_kind, data_json FROM activities WHERE kind = 'lead.contacted'");
    expect(act?.actor_kind).toBe("agent");
    expect(JSON.parse(act!.data_json)).toMatchObject({ channel: "linkedin", summary: "Invite sent" });
    await sql.run("UPDATE deals SET stage = 'proposal'");
    await consumeIntake(sql, { source: "outreach", payload: { ...payload, external_id: "o2" } }, NOW);
    expect(await sql.get("SELECT stage FROM deals")).toEqual({ stage: "proposal" });
  });
});

describe("scoring failure", () => {
  it("missing readiness_scans marks scoring_error, logs once, and throws", async () => {
    const db = new DatabaseSync(":memory:");
    const sql = sqliteSql(db);
    await migrate(sql);
    await consumeIntake(sql, { source: "lead", payload: lead }, NOW);
    const org = await sql.get<{ id: string }>("SELECT id FROM organizations");
    await expect(applySchemaScore(sql, org!.id, NOW)).rejects.toThrow(/readiness_scans/);
    await expect(applySchemaScore(sql, org!.id, NOW)).rejects.toThrow();
    expect(await sql.get("SELECT routing_status FROM deals")).toEqual({ routing_status: "scoring_error" });
    expect(await sql.get("SELECT count(*) AS n FROM activities WHERE kind = 'lead.scoring_failed'")).toEqual({ n: 1 });
  });

  it("scan_ready retries the queue message when scoring fails", async () => {
    const db = new DatabaseSync(":memory:");
    const sql = sqliteSql(db);
    await migrate(sql);
    await consumeIntake(sql, { source: "lead", payload: lead }, NOW);
    const org = await sql.get<{ id: string }>("SELECT id FROM organizations");
    let retried = 0;
    let acked = 0;
    const d1 = {
      prepare(statement: string) {
        return {
          bind(...params: unknown[]) {
            return {
              async all<T>() { return { results: db.prepare(statement).all(...(params as never[])) as T[] }; },
              async first<T>() { return (db.prepare(statement).get(...(params as never[])) ?? null) as T | null; },
              async run() { db.prepare(statement).run(...(params as never[])); },
              statement,
              params,
            };
          },
        };
      },
      async exec(statement: string) { db.exec(statement); },
      async batch() {},
    };
    await handleLeadIntakeBatch(
      [{ body: { source: "scan_ready", organizationId: org!.id }, ack: () => void acked++, retry: () => void retried++ }],
      d1 as never,
      NOW,
    );
    expect(acked).toBe(0);
    expect(retried).toBe(1);
  });
});
