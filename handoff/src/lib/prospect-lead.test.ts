import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { markOptedOut, lookupEmailSender } from "./client-channel-store";
import { captureProspectWebsite, hostInMessage, noteProspectBudget, noteProspectTurn, openEmailProspect, type OpenedProspect } from "./prospect-lead";

const NOW = 1_700_000_000_000;

async function database(): Promise<Sql> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  return sql;
}

function orgId(opened: OpenedProspect): string {
  if (!opened.organizationId) throw new Error("expected an organization");
  return opened.organizationId;
}

async function scans(sql: Sql): Promise<void> {
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
}

describe("email prospect", () => {
  it("opens one lead, one person, and one deal from a company address", async () => {
    const sql = await database();
    const first = await openEmailProspect(sql, { email: "Ada@Northwind.example", name: "Ada North", now: NOW });
    const second = await openEmailProspect(sql, { email: "ada@northwind.example", name: "Ada North", now: NOW + 1 });
    expect(second).toEqual({
      organizationId: first.organizationId,
      name: "Ada North",
      created: false,
      kind: "lead",
      pending: false,
    });

    const org = await sql.get<{ kind: string; domain: string; name: string; website: string }>(
      "SELECT kind, domain, name, website FROM organizations",
    );
    expect(org).toEqual({
      kind: "lead",
      domain: "northwind.example",
      name: "Ada North",
      website: "https://northwind.example",
    });
    const deals = await sql.all<{ source: string; stage: string; title: string }>(
      "SELECT source, stage, title FROM deals",
    );
    expect(deals).toEqual([{ source: "email", stage: "new", title: "Ada North from email" }]);
    const contacts = await sql.all<{ email: string; is_primary: number }>("SELECT email, is_primary FROM contacts");
    expect(contacts).toEqual([{ email: "ada@northwind.example", is_primary: 1 }]);

    const found = await lookupEmailSender(
      sql,
      "ada@northwind.example",
      "mx.cloudflare.net; dmarc=pass header.from=northwind.example",
    );
    expect(found.authenticated).toBe(true);
    expect(found.organizations).toEqual([{ id: first.organizationId, name: "Ada North", kind: "lead" }]);
  });

  it("does not treat a freemail host as the company", async () => {
    const sql = await database();
    const opened = await openEmailProspect(sql, { email: "ada@gmail.com", name: null, now: NOW });
    expect(opened.created).toBe(true);
    const org = await sql.get<{ domain: string | null; website: string | null; name: string }>(
      "SELECT domain, website, name FROM organizations",
    );
    expect(org).toEqual({ domain: null, website: null, name: "ada" });
    const note = await sql.get<{ body: string | null }>(
      "SELECT body FROM activities WHERE kind = 'agent.note'",
    );
    expect(note?.body).toBe("ada@gmail.com");
    const scan = await sql.get<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE name = 'readiness_scans'",
    );
    expect(scan).toBeUndefined();
  });

  it("adds a second person at the same company without a second lead", async () => {
    const sql = await database();
    const first = await openEmailProspect(sql, { email: "ada@northwind.example", name: "Ada", now: NOW });
    const second = await openEmailProspect(sql, { email: "bob@northwind.example", name: "Bob", now: NOW + 1 });
    expect(second.organizationId).toBe(first.organizationId);
    expect(second.created).toBe(false);
    const count = await sql.get<{ n: number }>("SELECT count(*) AS n FROM organizations");
    expect(count?.n).toBe(1);
    const people = await sql.get<{ n: number }>("SELECT count(*) AS n FROM contacts");
    expect(people?.n).toBe(2);
  });

  it("records the next step from the clarified outcome or the named time", async () => {
    const sql = await database();
    const opened = await openEmailProspect(sql, { email: "ada@northwind.example", name: "Ada", now: NOW });
    await noteProspectTurn(sql, {
      organizationId: orgId(opened),
      brief: "They want a site so buyers can book a call.",
      dueText: null,
      bookingOffered: true,
      now: NOW + 2,
    });
    const booked = await sql.get<{ next_step: string }>("SELECT next_step FROM deals");
    expect(booked?.next_step).toBe("Book a working session");

    await noteProspectTurn(sql, {
      organizationId: orgId(opened),
      brief: "They want a site so buyers can book a call.",
      dueText: "Thursday",
      bookingOffered: false,
      now: NOW + 3,
    });
    const timed = await sql.get<{ next_step: string; next_step_at: number | null }>(
      "SELECT next_step, next_step_at FROM deals",
    );
    expect(timed?.next_step).toBe("Call Thursday");
    expect(timed?.next_step_at).toEqual(expect.any(Number));
  });

  it("asks a new address on a client domain to confirm before attaching", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO organizations (id, name, domain, kind, created_at, updated_at)
       VALUES ('org-acme', 'Acme', 'acme.example', 'client', ?, ?)`,
      [NOW, NOW],
    );
    const opened = await openEmailProspect(sql, {
      email: "bob@acme.example",
      name: "Bob",
      now: NOW,
      text: "Hello",
      threadId: "<t-1>",
    });
    expect(opened.pending).toBe(true);
    expect(opened.organizationId).toBeNull();
    expect(opened.kind).toBe("client");
    const contacts = await sql.get<{ n: number }>("SELECT count(*) AS n FROM contacts");
    expect(contacts?.n).toBe(0);
    const orgs = await sql.get<{ n: number }>("SELECT count(*) AS n FROM organizations");
    expect(orgs?.n).toBe(1);

    const yesFirst = await openEmailProspect(sql, {
      email: "erin@acme.example",
      name: "Erin",
      now: NOW,
      text: "yes",
      threadId: "<erin>",
    });
    expect(yesFirst.pending).toBe(true);
    expect(yesFirst.organizationId).toBeNull();
    const stillNone = await sql.get<{ n: number }>("SELECT count(*) AS n FROM contacts");
    expect(stillNone?.n).toBe(0);

    const confirmed = await openEmailProspect(sql, {
      email: "bob@acme.example",
      name: "Bob",
      now: NOW + 1,
      text: "yes",
      threadId: "<t-1>",
    });
    expect(confirmed).toMatchObject({ organizationId: "org-acme", kind: "client", pending: false, created: false });
    const found = await lookupEmailSender(sql, "bob@acme.example", "mx; dmarc=pass header.from=acme.example");
    expect(found.organizations).toEqual([{ id: "org-acme", name: "Acme", kind: "client" }]);
    expect(found.optedOut).toBe(false);
  });

  it("does not attach a freemail address to an existing client", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO organizations (id, name, domain, kind, created_at, updated_at)
       VALUES ('org-acme', 'Acme', 'acme.example', 'client', ?, ?)`,
      [NOW, NOW],
    );
    const opened = await openEmailProspect(sql, { email: "ada@gmail.com", name: null, now: NOW, text: "Hello" });
    expect(opened.organizationId).not.toBe("org-acme");
    expect(opened.pending).toBe(false);
    const org = await sql.get<{ website: string | null; kind: string }>(
      "SELECT website, kind FROM organizations WHERE id = ?",
      [opened.organizationId],
    );
    expect(org).toEqual({ website: null, kind: "lead" });
  });

  it("leaves a decline note and does not attach on a later yes", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO organizations (id, name, domain, kind, created_at, updated_at)
       VALUES ('org-acme', 'Acme', 'acme.example', 'client', ?, ?)`,
      [NOW, NOW],
    );
    await openEmailProspect(sql, {
      email: "bob@acme.example",
      name: "Bob",
      now: NOW,
      text: "Hello",
      threadId: "<t-1>",
    });
    const declined = await openEmailProspect(sql, {
      email: "bob@acme.example",
      name: "Bob",
      now: NOW + 1,
      text: "no",
      threadId: "<t-1>",
    });
    expect(declined.declined).toBe(true);
    expect(declined.organizationId).toBeNull();
    const later = await openEmailProspect(sql, {
      email: "bob@acme.example",
      name: "Bob",
      now: NOW + 2,
      text: "yes",
      threadId: "<t-1>",
    });
    expect(later.declined).toBe(true);
    const contacts = await sql.get<{ n: number }>("SELECT count(*) AS n FROM contacts");
    expect(contacts?.n).toBe(0);
  });

  it("stores a budget in their words and does not store a dollar amount", async () => {
    const sql = await database();
    const opened = await openEmailProspect(sql, { email: "ada@northwind.example", name: "Ada", now: NOW });
    await noteProspectBudget(sql, {
      organizationId: orgId(opened),
      text: "Our budget is a few thousand for the first pass.",
      now: NOW + 1,
    });
    await noteProspectBudget(sql, {
      organizationId: orgId(opened),
      text: "Our budget is $500.",
      now: NOW + 2,
    });
    const notes = await sql.all<{ body: string | null; kind: string }>(
      "SELECT body, kind FROM activities WHERE kind = 'email' AND body LIKE '%budget%'",
    );
    expect(notes).toEqual([{ body: "Our budget is a few thousand for the first pass.", kind: "email" }]);
    const invoices = await sql.get<{ n: number }>("SELECT count(*) AS n FROM invoices");
    expect(invoices?.n).toBe(0);
  });

  it("captures one website for a freemail lead and does not scan a company lead", async () => {
    const sql = await database();
    await scans(sql);
    const freemail = await openEmailProspect(sql, { email: "ada@gmail.com", name: null, now: NOW });
    const blank = await sql.get<{ n: number }>("SELECT count(*) AS n FROM readiness_scans");
    expect(blank?.n).toBe(0);
    expect(hostInMessage("not a site")).toBeNull();
    await captureProspectWebsite(sql, {
      organizationId: orgId(freemail),
      text: "not a site",
      now: NOW + 1,
      queue: { send: async () => undefined },
    });
    const still = await sql.get<{ website: string | null }>("SELECT website FROM organizations WHERE id = ?", [
      freemail.organizationId,
    ]);
    expect(still?.website).toBeNull();

    const sent: { scanId: string }[] = [];
    await captureProspectWebsite(sql, {
      organizationId: orgId(freemail),
      text: "The site is https://northwind.example.",
      now: NOW + 2,
      queue: { send: async (body) => void sent.push(body) },
    });
    const site = await sql.get<{ website: string }>("SELECT website FROM organizations WHERE id = ?", [
      freemail.organizationId,
    ]);
    expect(site?.website).toBe("https://northwind.example");
    const queued = await sql.all<{ status: string }>("SELECT status FROM readiness_scans");
    expect(queued).toEqual([{ status: "queued" }]);
    expect(sent).toHaveLength(1);

    await captureProspectWebsite(sql, {
      organizationId: orgId(freemail),
      text: "Also see https://other.example",
      now: NOW + 3,
      queue: { send: async (body) => void sent.push(body) },
    });
    expect(sent).toHaveLength(1);

    const company = await openEmailProspect(sql, { email: "ada@northwind.example", name: "Ada", now: NOW });
    await captureProspectWebsite(sql, {
      organizationId: orgId(company),
      text: "https://other.example",
      now: NOW + 4,
      queue: { send: async () => undefined },
    });
    const companyScans = await sql.get<{ n: number }>(
      "SELECT count(*) AS n FROM readiness_scans WHERE organization_id = ?",
      [company.organizationId],
    );
    expect(companyScans?.n).toBe(0);
  });

  it("records a failed scan when the queue is missing and does not wake", async () => {
    const sql = await database();
    await scans(sql);
    const opened = await openEmailProspect(sql, { email: "ada@gmail.com", name: null, now: NOW });
    await captureProspectWebsite(sql, {
      organizationId: orgId(opened),
      text: "https://northwind.example",
      now: NOW + 1,
      queue: null,
    });
    const scan = await sql.get<{ status: string; error_message: string | null }>(
      "SELECT status, error_message FROM readiness_scans",
    );
    expect(scan).toEqual({ status: "failed", error_message: "The scan queue is not connected." });
  });

  it("opts out one address and leaves the other person at the company", async () => {
    const sql = await database();
    const ada = await openEmailProspect(sql, { email: "ada@northwind.example", name: "Ada", now: NOW });
    await openEmailProspect(sql, { email: "bob@northwind.example", name: "Bob", now: NOW + 1 });
    await markOptedOut(sql, "ada@northwind.example", NOW + 2);
    const adaFound = await lookupEmailSender(sql, "ada@northwind.example", "mx; dmarc=pass header.from=northwind.example");
    const bobFound = await lookupEmailSender(sql, "bob@northwind.example", "mx; dmarc=pass header.from=northwind.example");
    expect(adaFound.optedOut).toBe(true);
    expect(bobFound.optedOut).toBe(false);
    expect(bobFound.organizationId).toBe(ada.organizationId);
    const org = await sql.get<{ kind: string }>("SELECT kind FROM organizations");
    expect(org?.kind).toBe("lead");
  });
});
