import { describe, expect, it } from "vitest";
import { runSchemaCheck } from "@/lib/ops/schema-check";
import { memoryCheckDb } from "../helpers/memory-sql";

describe("runSchemaCheck", () => {
  it("keeps a covered site on the result list and files a lead only when the site needs us", async () => {
    const db = memoryCheckDb();
    const queued: string[] = [];
    const result = await runSchemaCheck(
      db,
      { objective: "Check https://needs.example and covered.example", checkId: "check-1" },
      {
        reviewer: {
          async reviewSites() {
            return [
              {
                name: "Needs Co",
                domain: "needs.example",
                website: "https://needs.example",
                needsUs: true,
                answer: "NEEDS_US. No schema.",
                contacts: [{ name: "Ada", email: "ada@needs.example", phone: "+15551212" }],
              },
              {
                name: "Covered Co",
                domain: "covered.example",
                website: "https://covered.example",
                needsUs: false,
                answer: "COVERED. Already quotable.",
                contacts: [{ email: "hi@covered.example" }],
              },
            ];
          },
        },
        enqueueScan: async (scanId) => {
          queued.push(scanId);
        },
      },
    );

    expect(result.leadIds).toHaveLength(1);
    expect(queued).toHaveLength(1);
    const sites = await db
      .prepare("SELECT domain, verdict, organization_id, contacts_json FROM schema_check_sites WHERE check_id = ? ORDER BY domain")
      .bind("check-1")
      .all<{ domain: string; verdict: string; organization_id: string | null; contacts_json: string }>();
    expect(sites.results.map((site) => site.domain)).toEqual(["covered.example", "needs.example"]);
    const covered = sites.results.find((site) => site.domain === "covered.example");
    const needs = sites.results.find((site) => site.domain === "needs.example");
    expect(covered?.verdict).toBe("covered");
    expect(covered?.organization_id).toBeNull();
    expect(needs?.verdict).toBe("needs_us");
    expect(needs?.organization_id).toBe(result.leadIds[0]);
    const contact = await db
      .prepare("SELECT name, email, phone FROM contacts WHERE organization_id = ?")
      .bind(result.leadIds[0])
      .first<{ name: string; email: string; phone: string }>();
    expect(contact).toEqual({ name: "Ada", email: "ada@needs.example", phone: "+15551212" });
  });
});
