import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { lookupEmailSender } from "./client-channel-store";
import { noteProspectTurn, openEmailProspect } from "./prospect-lead";

const NOW = 1_700_000_000_000;

async function database(): Promise<Sql> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  return sql;
}

describe("email prospect", () => {
  it("opens one lead, one person, and one deal from a company address", async () => {
    const sql = await database();
    const first = await openEmailProspect(sql, { email: "Ada@Northwind.example", name: "Ada North", now: NOW });
    const second = await openEmailProspect(sql, { email: "ada@northwind.example", name: "Ada North", now: NOW + 1 });
    expect(second).toEqual({ organizationId: first.organizationId, name: "Ada North", created: false });

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
      organizationId: opened.organizationId,
      brief: "They want a site so buyers can book a call.",
      dueText: null,
      bookingOffered: true,
      now: NOW + 2,
    });
    const booked = await sql.get<{ next_step: string }>("SELECT next_step FROM deals");
    expect(booked?.next_step).toBe("Book a working session");

    await noteProspectTurn(sql, {
      organizationId: opened.organizationId,
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
});
