import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { consumeIntake } from "./consume";

const NOW = 1_700_000_000_000;

async function database(): Promise<Sql> {
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
  answers: { q1: "yes" },
  scores: { overall: { total: 42 } },
  total_score: 42,
  utm: { source: "site" },
  report_url: "https://check.example/r/asm-1",
  completed_at: NOW - 1000,
};

describe("intake consumer", () => {
  it("makes a lead, a person, a deal, and an assessment", async () => {
    const sql = await database();
    const result = await consumeIntake(sql, { source: "assessment", payload: assessment }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.duplicate).toBe(false);
    expect(result.leadOrganizationId).toEqual(expect.any(String));

    const org = await sql.get<{ kind: string; domain: string; name: string }>(
      "SELECT kind, domain, name FROM organizations",
    );
    expect(org).toEqual({ kind: "lead", domain: "northwind.example", name: "Ada North" });

    const contact = await sql.get<{ email: string; is_primary: number }>(
      "SELECT email, is_primary FROM contacts",
    );
    expect(contact).toEqual({ email: "ada@northwind.example", is_primary: 1 });

    const deal = await sql.get<{ stage: string; source: string }>("SELECT stage, source FROM deals");
    expect(deal).toEqual({ stage: "new", source: "readiness_check" });

    const row = await sql.get<{ id: string; total_score: number }>(
      "SELECT id, total_score FROM assessments",
    );
    expect(row).toEqual({ id: "asm-1", total_score: 42 });

    const activity = await sql.get<{ kind: string; actor_kind: string }>(
      "SELECT kind, actor_kind FROM activities",
    );
    expect(activity).toEqual({ kind: "assessment", actor_kind: "system" });
  });

  it("does nothing the second time the same assessment arrives", async () => {
    const sql = await database();
    await consumeIntake(sql, { source: "assessment", payload: assessment }, NOW);
    const again = await consumeIntake(sql, { source: "assessment", payload: assessment }, NOW + 1);
    expect(again).toMatchObject({ ok: true, duplicate: true });
    expect(again).not.toHaveProperty("leadOrganizationId");
    const rows = await sql.all<{ id: string }>("SELECT id FROM assessments");
    expect(rows).toHaveLength(1);
    const orgs = await sql.all<{ id: string }>("SELECT id FROM organizations");
    expect(orgs).toHaveLength(1);
  });

  it("fills a missing email when the same assessment arrives again", async () => {
    const sql = await database();
    await consumeIntake(
      sql,
      {
        source: "assessment",
        payload: { ...assessment, email: null, name: null },
      },
      NOW,
    );
    const filled = await consumeIntake(sql, { source: "assessment", payload: assessment }, NOW + 1);
    expect(filled).toMatchObject({ ok: true, duplicate: true, filled_email: true });
    const contact = await sql.get<{ email: string; name: string }>("SELECT email, name FROM contacts");
    expect(contact).toEqual({ email: "ada@northwind.example", name: "Ada North" });
    const rows = await sql.all<{ id: string }>("SELECT id FROM assessments");
    expect(rows).toHaveLength(1);
  });

  it("adds the assessment to the lead that already has that email", async () => {
    const sql = await database();
    await consumeIntake(sql, { source: "assessment", payload: assessment }, NOW);
    const result = await consumeIntake(
      sql,
      {
        source: "assessment",
        payload: {
          ...assessment,
          assessment_id: "asm-2",
          domain: "other.example",
        },
      },
      NOW + 1,
    );
    expect(result).toMatchObject({ ok: true, duplicate: false });
    const orgs = await sql.all<{ domain: string }>("SELECT domain FROM organizations");
    expect(orgs).toEqual([{ domain: "northwind.example" }]);
    const rows = await sql.all<{ id: string }>("SELECT id FROM assessments ORDER BY id");
    expect(rows.map((row) => row.id)).toEqual(["asm-1", "asm-2"]);
  });

  it("adds the assessment to the lead that already has that domain", async () => {
    const sql = await database();
    await consumeIntake(sql, { source: "assessment", payload: assessment }, NOW);
    const result = await consumeIntake(
      sql,
      {
        source: "assessment",
        payload: {
          ...assessment,
          assessment_id: "asm-3",
          email: "new@northwind.example",
          name: "New Person",
        },
      },
      NOW + 1,
    );
    expect(result).toMatchObject({ ok: true, duplicate: false });
    const orgs = await sql.all<{ id: string }>("SELECT id FROM organizations");
    expect(orgs).toHaveLength(1);
    const contacts = await sql.all<{ email: string }>("SELECT email FROM contacts ORDER BY email");
    expect(contacts.map((row) => row.email)).toEqual([
      "ada@northwind.example",
      "new@northwind.example",
    ]);
  });

  it("books a call on the lead and ignores a repeat of the same booking", async () => {
    const sql = await database();
    await consumeIntake(sql, { source: "assessment", payload: assessment }, NOW);
    const booked = await consumeIntake(
      sql,
      {
        source: "booking",
        payload: {
          external_id: "cal-1",
          email: "ada@northwind.example",
          name: "Ada North",
          domain: "northwind.example",
          starts_at: NOW + 86_400_000,
          kind: "created",
        },
      },
      NOW + 2,
    );
    expect(booked).toMatchObject({ ok: true, duplicate: false });
    const deal = await sql.get<{ stage: string }>("SELECT stage FROM deals");
    expect(deal).toEqual({ stage: "call_booked" });
    const appointment = await sql.get<{ provider: string; status: string }>(
      "SELECT provider, status FROM appointments",
    );
    expect(appointment).toEqual({ provider: "calcom", status: "booked" });

    const again = await consumeIntake(
      sql,
      {
        source: "booking",
        payload: {
          external_id: "cal-1",
          email: "ada@northwind.example",
          starts_at: NOW + 86_400_000,
          kind: "created",
        },
      },
      NOW + 3,
    );
    expect(again).toMatchObject({ ok: true, duplicate: true });
    const appointments = await sql.all<{ id: string }>("SELECT id FROM appointments");
    expect(appointments).toHaveLength(1);

    const moved = await consumeIntake(
      sql,
      {
        source: "booking",
        payload: {
          external_id: "cal-1",
          email: "ada@northwind.example",
          starts_at: NOW + 172_800_000,
          kind: "rescheduled",
        },
      },
      NOW + 4,
    );
    expect(moved).toMatchObject({ ok: true, duplicate: false });
    const updated = await sql.get<{ status: string; starts_at: number }>(
      "SELECT status, starts_at FROM appointments",
    );
    expect(updated).toEqual({ status: "rescheduled", starts_at: NOW + 172_800_000 });
  });

  it("refuses an assessment with no id and no way to match a lead", async () => {
    const sql = await database();
    const missingId = await consumeIntake(
      sql,
      { source: "assessment", payload: { email: "ada@northwind.example", domain: "northwind.example" } },
      NOW,
    );
    expect(missingId).toEqual({ ok: false, error: "invalid", retry: false });
    const missingMatch = await consumeIntake(
      sql,
      { source: "assessment", payload: { assessment_id: "asm-x" } },
      NOW,
    );
    expect(missingMatch).toEqual({ ok: false, error: "invalid", retry: false });
    const orgs = await sql.all<{ id: string }>("SELECT id FROM organizations");
    expect(orgs).toHaveLength(0);
  });
});
