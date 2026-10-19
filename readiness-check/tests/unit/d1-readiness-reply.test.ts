import { describe, expect, it } from "vitest";
import { completeAssessment, createAssessment, optInAssessment, patchAssessmentAnswer } from "@/lib/assessment/actions";
import { copyCompletedCheckToCrm, createD1AssessmentAdmin } from "@/lib/assessment/d1-admin";
import { memoryCheckDb } from "../helpers/memory-sql";

type Db = ReturnType<typeof memoryCheckDb>;

async function finishCheck(db: Db) {
  const admin = createD1AssessmentAdmin(db);
  const created = await createAssessment(admin, {});
  await patchAssessmentAnswer(admin, created.token, "pressure", ["P01"]);
  await patchAssessmentAnswer(admin, created.token, "G04", "https://acme.example");
  await completeAssessment(admin, created.token);
  return { admin, token: created.token };
}

async function deals(db: Db) {
  const rows = await db
    .prepare("SELECT stage, source, routing_status, scored_at FROM deals ORDER BY created_at")
    .bind()
    .all<{ stage: string; source: string; routing_status: string | null; scored_at: string | null }>();
  return rows.results;
}

describe("Readiness Check queues Sales Outbound's reply in HQ", () => {
  it("a finished check is not queued until it has an email, then is reply_needed once", async () => {
    const db = memoryCheckDb();
    const { admin, token } = await finishCheck(db);
    expect(await deals(db)).toEqual([]);
    await optInAssessment(admin, token, { email: "ada@acme.example", name: "Ada" });
    const [deal] = await deals(db);
    expect(deal).toMatchObject({ stage: "new", source: "readiness_check", routing_status: "reply_needed" });
    expect(deal.scored_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    await db.prepare("UPDATE deals SET routing_status = 'replied', stage = 'contacted'").bind().run();
    const row = await db.prepare("SELECT id FROM check_assessments").bind().first<{ id: string }>();
    await copyCompletedCheckToCrm(db, row!.id);
    expect((await deals(db))[0].routing_status).toBe("replied");
  });

  it("a second check from the same person reopens the reply on the same deal", async () => {
    const db = memoryCheckDb();
    const first = await finishCheck(db);
    await optInAssessment(first.admin, first.token, { email: "ada@acme.example" });
    await db.prepare("UPDATE deals SET routing_status = 'replied', stage = 'contacted'").bind().run();
    const second = await finishCheck(db);
    await optInAssessment(second.admin, second.token, { email: "ada@acme.example" });
    expect(await deals(db)).toEqual([expect.objectContaining({ stage: "contacted", routing_status: "reply_needed" })]);
  });

  it("leaves a deal in the BDR outbound flow or past contacted alone", async () => {
    for (const [stage, status] of [["new", "ready_for_outbound"], ["new", "enriched"], ["call_booked", null]] as const) {
      const db = memoryCheckDb();
      const now = Date.now();
      await db
        .prepare("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES ('o1', 'Acme', 'acme.example', 'lead', ?, ?)")
        .bind(now, now)
        .run();
      await db
        .prepare("INSERT INTO contacts (id, organization_id, email, is_primary, created_at, updated_at) VALUES ('c1', 'o1', 'ada@acme.example', 1, ?, ?)")
        .bind(now, now)
        .run();
      await db
        .prepare("INSERT INTO deals (id, organization_id, title, stage, source, routing_status, created_at, updated_at) VALUES ('d1', 'o1', 'Acme', ?, 'bdr', ?, ?, ?)")
        .bind(stage, status, now, now)
        .run();
      const { admin, token } = await finishCheck(db);
      await optInAssessment(admin, token, { email: "ada@acme.example" });
      expect(await deals(db)).toEqual([expect.objectContaining({ stage, source: "bdr", routing_status: status })]);
    }
  });
});
