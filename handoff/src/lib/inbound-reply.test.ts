import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { d1Sql, sqliteSql, type D1Like, type Sql } from "@/db/sql";
import { POST as inquiryPost } from "@/app/api/intake/project-inquiry/route";
import { consumeIntake } from "./intake/consume";
import { projectInquiryBodyReady } from "./intake/accept";
import { signIntakeBody } from "./intake/sign";
import { handleLeadIntakeBatch } from "./intake/queue";
import { applySchemaScore } from "./lead-routing";
import { exportLeads, type ExportedLead } from "./lead-export";

const NOW = 1_700_000_000_000;
const ISO = new Date(NOW).toISOString();
const CTX = Symbol.for("__cloudflare-context__");

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CTX];
  delete process.env.PROJECT_INQUIRY_SIGNING_SECRET;
  delete process.env.INTAKE_SIGNING_SECRET;
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

/** D1-shaped wrapper so writes inside BEGIN/COMMIT are buffered like production. */
function d1Over(db: DatabaseSync): D1Like {
  const prepare = (statement: string) => ({
    bind: (...params: unknown[]) => {
      const stmt = db.prepare(statement);
      const args = params as never[];
      return {
        run: async () => stmt.run(...args),
        all: async <T>() => ({ results: stmt.all(...args) as T[] }),
        first: async <T>() => (stmt.get(...args) as T | undefined) ?? null,
        stmt,
        args,
      };
    },
  });
  return {
    prepare,
    exec: async (statement: string) => db.exec(statement),
    batch: async (statements: unknown[]) => {
      db.exec("BEGIN");
      try {
        for (const entry of statements as { stmt: { run: (...a: never[]) => unknown }; args: never[] }[]) entry.stmt.run(...entry.args);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Like;
}

async function bareDatabase(): Promise<Sql> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  return sql;
}

const assessment = {
  assessment_id: "asm-1",
  email: "ada@northwind.example",
  name: "Ada North",
  domain: "northwind.example",
  answers: { q1: "yes", q2: "no" },
  scores: { overall: { total: 42 } },
  total_score: 42,
  utm: {},
  report_url: "https://check.example/r/tok-1",
  completed_at: NOW - 1000,
};

const bdrLead = {
  external_id: "bdr-1",
  domain: "northwind.example",
  company: "Northwind",
  contact_name: "Ada North",
  email: "ada@northwind.example",
};

const inquiry = {
  external_id: "inq-1",
  name: "Bea Quill",
  email: "bea@quillworks.example",
  company: "Quillworks",
  need: "Website",
  budget: "$15–40k",
  timeline: "This month",
  message: "A site that books the work.",
  page: "/start/",
  submitted_at: ISO,
};

async function leads(sql: Sql, status: string, since?: string): Promise<ExportedLead[]> {
  const out = await exportLeads(sql, { status, since });
  if (!Array.isArray(out)) throw new Error(out.error);
  return out;
}

async function deal(sql: Sql) {
  return sql.get<{ stage: string; source: string; routing_status: string | null; scored_at: string | null; lead_score: number | null }>(
    "SELECT stage, source, routing_status, scored_at, lead_score FROM deals ORDER BY created_at LIMIT 1",
  );
}

async function scan(sql: Sql, score: number) {
  const org = await sql.get<{ id: string }>("SELECT id FROM organizations LIMIT 1");
  await sql.run(
    `INSERT INTO readiness_scans (id, public_token, domain, origin, source, status, organization_id, score_total, created_at, completed_at)
     VALUES (?, ?, 'northwind.example', 'x', 'public', 'complete', ?, ?, ?, ?)`,
    [`s-${score}`, `tok-${score}`, org!.id, score, NOW, NOW],
  );
  return org!.id;
}

describe("readiness check submissions need a reply", () => {
  it("a new readiness_check deal is reply_needed and exported with the submitter and answers", async () => {
    const sql = await database();
    await consumeIntake(sql, { source: "assessment", payload: assessment }, NOW);
    expect(await deal(sql)).toEqual({ stage: "new", source: "readiness_check", routing_status: "reply_needed", scored_at: ISO, lead_score: null });
    const out = await leads(sql, "reply_needed");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      name: "Ada North",
      domain: "northwind.example",
      source: "readiness_check",
      routing_status: "reply_needed",
      scored_at: ISO,
      reply_to: { name: "Ada North", email: "ada@northwind.example" },
      inquiry: null,
      readiness: {
        assessment_id: "asm-1",
        total_score: 42,
        report_url: "https://check.example/r/tok-1",
        scores_json: { overall: { total: 42 } },
        answers: { q1: "yes", q2: "no" },
        completed_at: new Date(NOW - 1000).toISOString(),
      },
    });
    expect(await leads(sql, "reply_needed", new Date(NOW - 1).toISOString())).toHaveLength(1);
    expect(await leads(sql, "reply_needed", new Date(NOW + 1).toISOString())).toHaveLength(0);
    expect(await leads(sql, "ready_for_outbound")).toHaveLength(0);
  });

  it("works under D1's buffered transactions", async () => {
    const db = new DatabaseSync(":memory:");
    const sql = d1Sql(d1Over(db));
    await migrate(sql);
    await consumeIntake(sql, { source: "assessment", payload: assessment }, NOW);
    await consumeIntake(sql, { source: "project_inquiry", payload: inquiry }, NOW);
    const rows = await sql.all<{ source: string; routing_status: string }>("SELECT source, routing_status FROM deals ORDER BY source");
    expect(rows).toEqual([
      { source: "readiness_check", routing_status: "reply_needed" },
      { source: "start_form", routing_status: "reply_needed" },
    ]);
  });

  it("schema scoring records the score but never clobbers reply_needed or replied", async () => {
    const sql = await database();
    await consumeIntake(sql, { source: "assessment", payload: assessment }, NOW);
    const orgId = await scan(sql, 42);
    const applied = await applySchemaScore(sql, orgId, NOW + 5000);
    expect(applied).toMatchObject({ score: 42, status: "reply_needed" });
    expect(await deal(sql)).toMatchObject({ routing_status: "reply_needed", scored_at: ISO, lead_score: 42 });
    await sql.run("UPDATE deals SET routing_status = 'replied'");
    await scan(sql, 90);
    await applySchemaScore(sql, orgId, NOW + 9000);
    expect(await deal(sql)).toMatchObject({ routing_status: "replied", scored_at: ISO });
  });

  it("a missing readiness_scans table does not mark an inbound deal scoring_error", async () => {
    const sql = await bareDatabase();
    await consumeIntake(sql, { source: "assessment", payload: assessment }, NOW);
    const org = await sql.get<{ id: string }>("SELECT id FROM organizations");
    await expect(applySchemaScore(sql, org!.id, NOW)).rejects.toThrow(/readiness_scans/);
    expect((await deal(sql))?.routing_status).toBe("reply_needed");
  });

  it("leaves a BDR deal already in outbound flow alone", async () => {
    for (const status of ["ready_for_outbound", "enriched"]) {
      const sql = await database();
      await consumeIntake(sql, { source: "lead", payload: bdrLead }, NOW - 10_000);
      await sql.run("UPDATE deals SET routing_status = ?, scored_at = 'x'", [status]);
      await consumeIntake(sql, { source: "assessment", payload: assessment }, NOW);
      expect(await deal(sql)).toMatchObject({ source: "bdr", routing_status: status, scored_at: "x" });
      expect(await leads(sql, "reply_needed")).toHaveLength(0);
    }
  });

  it("takes an unscored or nurture BDR deal, but not one past contacted", async () => {
    for (const status of [null, "nurture", "scoring_error"]) {
      const sql = await database();
      await consumeIntake(sql, { source: "lead", payload: bdrLead }, NOW - 10_000);
      await sql.run("UPDATE deals SET routing_status = ?", [status]);
      await consumeIntake(sql, { source: "assessment", payload: assessment }, NOW);
      expect((await deal(sql))?.routing_status).toBe("reply_needed");
    }
    const sql = await database();
    await consumeIntake(sql, { source: "lead", payload: bdrLead }, NOW - 10_000);
    await sql.run("UPDATE deals SET stage = 'call_booked'");
    await consumeIntake(sql, { source: "assessment", payload: assessment }, NOW);
    expect((await deal(sql))?.routing_status).toBeNull();
  });

  it("an assessment with no email waits, and queues when the email arrives", async () => {
    const sql = await database();
    await consumeIntake(sql, { source: "assessment", payload: { ...assessment, email: undefined } }, NOW);
    expect((await deal(sql))?.routing_status).toBeNull();
    await consumeIntake(sql, { source: "assessment", payload: assessment }, NOW + 1000);
    expect(await deal(sql)).toMatchObject({ routing_status: "reply_needed", scored_at: new Date(NOW + 1000).toISOString() });
  });

  it("outreach marks the reply sent, and a new submission queues again", async () => {
    const sql = await database();
    await consumeIntake(sql, { source: "assessment", payload: assessment }, NOW);
    const [lead] = await leads(sql, "reply_needed");
    const sent = await consumeIntake(
      sql,
      { source: "outreach", payload: { external_id: "reply-asm-1", deal_id: lead.deal_id, channel: "email", summary: "Replied." } },
      NOW + 1000,
    );
    expect(sent).toMatchObject({ ok: true, duplicate: false });
    expect(await deal(sql)).toMatchObject({ stage: "contacted", routing_status: "replied" });
    expect(await leads(sql, "reply_needed")).toHaveLength(0);
    const replied = await leads(sql, "replied");
    expect(replied[0].outreach).toEqual([expect.objectContaining({ external_id: "reply-asm-1", channel: "email" })]);
    await consumeIntake(sql, { source: "assessment", payload: { ...assessment, assessment_id: "asm-2" } }, NOW + 2000);
    expect(await deal(sql)).toMatchObject({ stage: "contacted", routing_status: "reply_needed" });
    expect((await leads(sql, "reply_needed"))[0].readiness?.assessment_id).toBe("asm-2");
  });

  it("outreach on a BDR deal does not touch its routing", async () => {
    const sql = await database();
    await consumeIntake(sql, { source: "lead", payload: bdrLead }, NOW);
    await sql.run("UPDATE deals SET routing_status = 'enriched'");
    await consumeIntake(sql, { source: "outreach", payload: { external_id: "o1", domain: "northwind.example", channel: "email" } }, NOW);
    expect(await deal(sql)).toMatchObject({ stage: "contacted", routing_status: "enriched" });
  });
});

describe("project inquiries from the /start/ form", () => {
  it("checks the body", () => {
    expect(projectInquiryBodyReady(inquiry)).toBe(true);
    expect(projectInquiryBodyReady({ ...inquiry, external_id: "" })).toBe(false);
    expect(projectInquiryBodyReady({ ...inquiry, email: "nope" })).toBe(false);
    expect(projectInquiryBodyReady([inquiry])).toBe(false);
  });

  it("accepts PROJECT_INQUIRY_SIGNING_SECRET only and queues source project_inquiry", async () => {
    const sent: unknown[] = [];
    process.env.PROJECT_INQUIRY_SIGNING_SECRET = "form-secret";
    process.env.INTAKE_SIGNING_SECRET = "check-secret";
    (globalThis as Record<symbol, unknown>)[CTX] = { env: { LEAD_INTAKE: { send: async (b: unknown) => void sent.push(b) } } };
    const body = JSON.stringify(inquiry);
    const post = async (secret: string) =>
      inquiryPost(
        new Request("https://handoff.example/api/intake/project-inquiry", {
          method: "POST",
          headers: { "x-intake-signature": await signIntakeBody(secret, body), "x-intake-timestamp": String(Date.now()) },
          body,
        }),
      );
    expect((await post("check-secret")).status).toBe(401);
    expect((await post("form-secret")).status).toBe(202);
    expect(sent).toEqual([{ source: "project_inquiry", payload: inquiry }]);
  });

  it("opens a start_form deal that needs a reply, exports the form fields, and dedupes", async () => {
    const sql = await database();
    const first = await consumeIntake(sql, { source: "project_inquiry", payload: inquiry }, NOW);
    expect(first).toMatchObject({ ok: true, duplicate: false, leadOrganizationId: expect.any(String) });
    expect(await deal(sql)).toMatchObject({ stage: "new", source: "start_form", routing_status: "reply_needed", scored_at: ISO });
    expect(await sql.get("SELECT name, domain, website FROM organizations")).toEqual({
      name: "Quillworks",
      domain: "quillworks.example",
      website: "https://quillworks.example",
    });
    const [lead] = await leads(sql, "reply_needed");
    expect(lead).toMatchObject({
      name: "Quillworks",
      source: "start_form",
      reply_to: { name: "Bea Quill", email: "bea@quillworks.example" },
      readiness: null,
      inquiry: {
        external_id: "inq-1",
        company: "Quillworks",
        need: "Website",
        budget: "$15–40k",
        timeline: "This month",
        message: "A site that books the work.",
        page: "/start/",
        submitted_at: ISO,
      },
    });
    expect(await consumeIntake(sql, { source: "project_inquiry", payload: inquiry }, NOW + 1)).toMatchObject({ ok: true, duplicate: true });
    expect(await sql.all("SELECT id FROM activities WHERE kind = 'project_inquiry'")).toHaveLength(1);
    expect(await consumeIntake(sql, { source: "project_inquiry", payload: { ...inquiry, email: "" } }, NOW)).toMatchObject({ ok: false });
  });

  it("a freemail sender gets an org named for the company and no domain", async () => {
    const sql = await database();
    await consumeIntake(sql, { source: "project_inquiry", payload: { ...inquiry, email: "bea@gmail.com" } }, NOW);
    expect(await sql.get("SELECT name, domain FROM organizations")).toEqual({ name: "Quillworks", domain: null });
  });

  it("takes over an enriched BDR deal, so the cold sequence stops and the inquiry gets answered", async () => {
    const sql = await database();
    await consumeIntake(sql, { source: "lead", payload: bdrLead }, NOW - 10_000);
    await sql.run("UPDATE deals SET routing_status = 'enriched'");
    await consumeIntake(sql, { source: "project_inquiry", payload: { ...inquiry, email: "ada@northwind.example", company: "Northwind" } }, NOW);
    expect(await sql.all("SELECT id FROM deals")).toHaveLength(1);
    expect(await deal(sql)).toMatchObject({ source: "bdr", routing_status: "reply_needed" });
    expect((await leads(sql, "reply_needed"))[0].inquiry?.need).toBe("Website");
    expect(await leads(sql, "enriched")).toHaveLength(0);
  });

  it("the queue consumer does not drop project_inquiry messages", async () => {
    const db = new DatabaseSync(":memory:");
    let acked = 0;
    await handleLeadIntakeBatch(
      [{ body: { source: "project_inquiry", payload: inquiry }, ack: () => void acked++, retry: () => {} }],
      d1Over(db),
      NOW,
    );
    expect(acked).toBe(1);
    const sql = sqliteSql(db);
    expect(await sql.get("SELECT source, routing_status FROM deals")).toEqual({ source: "start_form", routing_status: "reply_needed" });
  });

  it("rejects an unknown export status with the full list", async () => {
    const sql = await database();
    expect(await exportLeads(sql, { status: "bogus" })).toEqual({
      error: "status must be ready_for_outbound, enriched, nurture, scoring_error, reply_needed, replied, or won.",
    });
  });
});
