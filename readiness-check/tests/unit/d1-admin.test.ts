import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { d1Admin, type D1Like } from "@/lib/d1/admin";

function memoryDb(): D1Like {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(path.join(process.cwd(), "migrations/0006_readiness.sql"), "utf8"));
  return {
    prepare(sql: string) {
      const stmt = db.prepare(sql);
      return {
        bind(...values: unknown[]) {
          const args = values as never[];
          return {
            async all() {
              return { results: stmt.all(...args) as Record<string, unknown>[] };
            },
            async first<T>() {
              return (stmt.get(...args) as T | undefined) ?? null;
            },
            async run() {
              stmt.run(...args);
              return { success: true };
            },
          };
        },
      };
    },
  };
}

describe("d1 admin", () => {
  it("inserts an assessment and reads it back by token", async () => {
    const admin = d1Admin(memoryDb());
    const inserted = await admin
      .from("assessments")
      .insert({
        public_token: "tok-1",
        config_version: "v1",
        utm: { source: "ad" },
        current_step: "start",
        status: "in_progress",
      })
      .select("*")
      .single();

    expect(inserted.error).toBeNull();
    expect(inserted.data?.public_token).toBe("tok-1");
    expect(inserted.data?.utm).toEqual({ source: "ad" });

    const loaded = await admin.from("assessments").select("*").eq("public_token", "tok-1").maybeSingle();
    expect(loaded.data?.id).toBe(inserted.data?.id);
    expect(loaded.data?.answers).toEqual({});
  });

  it("maps a duplicate unlock to postgres unique code 23505", async () => {
    const admin = d1Admin(memoryDb());
    const first = await admin.from("scan_unlocks").insert({ scan_id: "scan-1", email: "a@example.com" });
    expect(first.error).toBeNull();
    const second = await admin.from("scan_unlocks").insert({ scan_id: "scan-1", email: "a@example.com" });
    expect(second.error?.code).toBe("23505");
  });

  it("refuses tables outside the readiness prefix", () => {
    const admin = d1Admin(memoryDb());
    expect(() => admin.from("organizations")).toThrow(/not available/);
  });

  it("counts with head and filters by gte and lt", async () => {
    const admin = d1Admin(memoryDb());
    await admin.from("scans").insert({
      domain: "acme.example",
      origin: "https://acme.example",
      source: "public",
      status: "queued",
      public_token: "old",
      created_at: "2020-01-01T00:00:00.000Z",
    });
    await admin.from("scans").insert({
      domain: "acme.example",
      origin: "https://acme.example",
      source: "public",
      status: "queued",
      public_token: "new",
      created_at: "2026-01-02T00:00:00.000Z",
    });

    const recent = await admin
      .from("scans")
      .select("*", { count: "exact", head: true })
      .eq("domain", "acme.example")
      .eq("source", "public")
      .gte("created_at", "2026-01-01T00:00:00.000Z");
    expect(recent.count).toBe(1);

    const older = await admin
      .from("assessments")
      .insert({
        public_token: "stale",
        config_version: "v1",
        status: "in_progress",
        updated_at: "2020-01-01T00:00:00.000Z",
      })
      .select("id")
      .single();
    const stale = await admin
      .from("assessments")
      .select("id")
      .eq("status", "in_progress")
      .lt("updated_at", "2024-01-01T00:00:00.000Z");
    expect(stale.error).toBeNull();
    expect(Array.isArray(stale.data) ? stale.data : []).toEqual([{ id: older.data?.id }]);
  });

  it("bumps updated_at when a patch omits it", async () => {
    const admin = d1Admin(memoryDb());
    const created = await admin
      .from("leads")
      .insert({
        domain: "acme.example",
        source: "findall",
        updated_at: "2000-01-01T00:00:00.000Z",
      })
      .select("id")
      .single();
    await admin.from("leads").update({ name: "Acme" }).eq("id", created.data?.id);
    const loaded = await admin.from("leads").select("name, updated_at").eq("id", created.data?.id).single();
    expect(loaded.data?.name).toBe("Acme");
    expect(loaded.data?.updated_at).not.toBe("2000-01-01T00:00:00.000Z");
  });

  it("hydrates the ops queue as nested objects", async () => {
    const admin = d1Admin(memoryDb());
    const lead = await admin
      .from("leads")
      .insert({ domain: "acme.example", name: "Acme", source: "findall" })
      .select("id")
      .single();
    await admin.from("contacts").insert({ lead_id: lead.data?.id, email: "a@acme.example", name: "Ada" });
    const scan = await admin
      .from("scans")
      .insert({
        domain: "acme.example",
        origin: "https://acme.example",
        source: "ops",
        public_token: "scan-tok",
        lead_id: lead.data?.id,
        score_total: 40,
        score_breakdown: { schema: 1 },
      })
      .select("id")
      .single();
    await admin.from("scan_findings").insert({
      scan_id: scan.data?.id,
      code: "missing_org",
      severity: "critical",
      passed: false,
      message: "No organization",
    });
    const assessment = await admin
      .from("assessments")
      .insert({
        public_token: "check-tok",
        config_version: "v1",
        status: "completed",
        lead_id: lead.data?.id,
        scores: { overall: { total: 40, band: "fog" } },
      })
      .select("id")
      .single();
    await admin.from("appointments").insert({
      assessment_id: assessment.data?.id,
      lead_id: lead.data?.id,
      provider: "cal.com",
      external_id: "cal-1",
      starts_at: "2026-02-01T15:00:00.000Z",
      status: "scheduled",
    });
    await admin.from("ops_queue").insert({
      lead_id: lead.data?.id,
      latest_scan_id: scan.data?.id,
      assessment_id: assessment.data?.id,
      status: "booked",
      priority_score: 9,
      missing_contact: false,
    });

    const queue = await admin
      .from("ops_queue")
      .select(
        `id, leads ( id, contacts ( email ) ), scans:latest_scan_id ( id, scan_findings ( code ) ), assessments:assessment_id ( public_token, appointments ( starts_at ) )`,
      )
      .order("priority_score", { ascending: false });

    const rows = queue.data as Array<Record<string, unknown>>;
    const item = rows[0];
    expect(item.missing_contact).toBe(false);
    const nestedLead = item.leads as { name: string; contacts: { email: string }[] };
    expect(nestedLead.name).toBe("Acme");
    expect(nestedLead.contacts[0]?.email).toBe("a@acme.example");
    const nestedScan = item.scans as { score_breakdown: { schema: number }; scan_findings: { code: string }[] };
    expect(nestedScan.score_breakdown).toEqual({ schema: 1 });
    expect(nestedScan.scan_findings[0]?.code).toBe("missing_org");
    const nestedAssessment = item.assessments as { public_token: string; appointments: { starts_at: string }[] };
    expect(nestedAssessment.public_token).toBe("check-tok");
    expect(nestedAssessment.appointments[0]?.starts_at).toBe("2026-02-01T15:00:00.000Z");
  });

  it("updates through a returned row and matches a json email", async () => {
    const admin = d1Admin(memoryDb());
    const lead = await admin
      .from("leads")
      .insert({ domain: "acme.example", source: "findall", raw: { email: "a@acme.example" } })
      .select("id")
      .single();
    const updated = await admin
      .from("leads")
      .update({ name: "Acme" })
      .eq("id", lead.data?.id)
      .select("id, name")
      .single();
    expect(updated.data).toEqual({ id: lead.data?.id, name: "Acme" });

    const found = await admin.from("leads").select("id").filter("raw->>email", "eq", "a@acme.example").maybeSingle();
    expect(found.data?.id).toBe(lead.data?.id);
  });
});
