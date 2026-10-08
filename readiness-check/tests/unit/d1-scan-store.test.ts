import { describe, expect, it } from "vitest";
import { createD1ProspectStore } from "@/lib/ops/d1-prospect-store";
import { processProspectLeads } from "@/lib/ops/prospect";
import {
  countRecentPublicScansOnD1,
  createD1ScanRepository,
  insertScan,
  loadScanByPublicToken,
} from "@/lib/scan/d1-store";
import { memoryCheckDb } from "../helpers/memory-sql";

describe("D1 readiness scans", () => {
  it("stores a public URL scan and refuses a fourth scan the same day", async () => {
    const db = memoryCheckDb();
    const now = Date.parse("2026-10-07T12:00:00Z");
    for (let i = 0; i < 3; i += 1) {
      await insertScan(db, {
        domain: "acme.example",
        origin: "https://acme.example",
        source: "public",
        now: now + i,
      });
    }
    const limit = await countRecentPublicScansOnD1(db, "acme.example", now + 10);
    expect(limit).toEqual({ allowed: false, count: 3 });
  });

  it("saves pages, findings, and a score that the public token can load", async () => {
    const db = memoryCheckDb();
    const created = await insertScan(db, {
      domain: "acme.example",
      origin: "https://acme.example",
      source: "public",
    });
    const repo = createD1ScanRepository(db);
    await repo.markRunning(created.id);
    await repo.savePages(created.id, [
      {
        url: "https://acme.example/",
        pageType: "home",
        fetchStatus: "ok",
        hasJsonLd: false,
        schemaTypes: [],
        evidence: { businessName: "Acme" },
      },
    ]);
    await repo.saveFindings(created.id, [
      {
        code: "NO_ORG_SCHEMA",
        severity: "critical",
        passed: false,
        message: "Missing Organization",
        pageUrl: "https://acme.example/",
      },
    ]);
    await repo.markComplete(created.id, 40, { structuredData: 0 });

    const loaded = await loadScanByPublicToken(db, created.token);
    expect(loaded?.scan.status).toBe("complete");
    expect(loaded?.scan.score_total).toBe(40);
    expect(loaded?.pages[0]?.evidence).toEqual({ businessName: "Acme" });
    expect(loaded?.findings[0]?.pageUrl).toBe("https://acme.example/");
  });
});

describe("D1 prospect leads", () => {
  it("turns a site that needs us into a CRM lead and a queued scan", async () => {
    const db = memoryCheckDb();
    const queued: string[] = [];
    const result = await processProspectLeads(
      [
        {
          name: "Acme",
          domain: "acme.example",
          website: "https://acme.example",
          contacts: [{ name: "Ada", email: "Ada@Acme.example" }],
          raw: { source: "ai_search", answer: "NEEDS_US. The homepage has no schema." },
        },
      ],
      {
        store: createD1ProspectStore(db),
        enqueueScan: async (scanId) => {
          queued.push(scanId);
        },
      },
    );

    expect(result.leadCount).toBe(1);
    expect(queued).toEqual(result.scanIds);
    const org = await db
      .prepare("SELECT kind, notes FROM organizations WHERE domain = ?")
      .bind("acme.example")
      .first<{ kind: string; notes: string }>();
    expect(org?.kind).toBe("lead");
    expect(org?.notes).toContain("NEEDS_US");
    const contact = await db
      .prepare("SELECT email FROM contacts WHERE organization_id = ?")
      .bind(result.leadIds[0])
      .first<{ email: string }>();
    expect(contact?.email).toBe("ada@acme.example");
    const deal = await db
      .prepare("SELECT stage, next_step FROM deals WHERE organization_id = ?")
      .bind(result.leadIds[0])
      .first<{ stage: string; next_step: string }>();
    expect(deal?.stage).toBe("new");
    expect(deal?.next_step).toContain(result.scanIds[0]);
  });
});
