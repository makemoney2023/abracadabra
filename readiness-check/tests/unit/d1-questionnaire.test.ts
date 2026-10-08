import { describe, expect, it } from "vitest";
import { completeAssessment, createAssessment, optInAssessment, patchAssessmentAnswer } from "@/lib/assessment/actions";
import { createD1AssessmentAdmin } from "@/lib/assessment/d1-admin";
import { memoryCheckDb } from "../helpers/memory-sql";

describe("readiness questionnaire on D1", () => {
  it("saves answers, scores the check, and files an email on the client record", async () => {
    const db = memoryCheckDb();
    const admin = createD1AssessmentAdmin(db);
    const created = await createAssessment(admin, { utm: { utm_source: "test" } });
    expect(created.token.length).toBeGreaterThan(8);

    const saved = await patchAssessmentAnswer(admin, created.token, "pressure", ["P01"]);
    expect(saved.status).toBe(200);

    const scored = await completeAssessment(admin, created.token);
    expect(scored.status).toBe(200);
    expect(scored.body.ok).toBe(true);

    const opted = await optInAssessment(admin, created.token, {
      email: "Ada@Acme.example",
      name: "Ada",
    });
    expect(opted.status).toBe(200);

    const contact = await db
      .prepare("SELECT email, opted_in FROM contacts WHERE email = ?")
      .bind("ada@acme.example")
      .first<{ email: string; opted_in: number }>();
    expect(contact).toEqual({ email: "ada@acme.example", opted_in: 1 });

    const filed = await db
      .prepare("SELECT domain, answers_json FROM assessments")
      .bind()
      .first<{ domain: string | null; answers_json: string }>();
    expect(filed?.answers_json).toContain("P01");
  });
});
