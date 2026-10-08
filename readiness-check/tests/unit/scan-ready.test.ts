import { describe, expect, it } from "vitest";
import { notifyLeadScan } from "@/lib/jobs/scan-ready";
import { createD1ScanRepository, insertScan } from "@/lib/scan/d1-store";
import { memoryCheckDb } from "../helpers/memory-sql";

describe("scan ready notice", () => {
  it("tells the lead queue when a finished scan belongs to a lead", async () => {
    const db = memoryCheckDb();
    const created = await insertScan(db, {
      domain: "acme.example",
      origin: "https://acme.example",
      source: "public",
      organizationId: "org-1",
    });
    await createD1ScanRepository(db).markComplete(created.id, 28, { structuredData: 10 });
    const sent: unknown[] = [];
    await notifyLeadScan(db, { send: async (body) => { sent.push(body); } }, created.id);
    expect(sent).toEqual([{ source: "scan_ready", organizationId: "org-1", scanId: created.id, status: "complete" }]);
  });

  it("stays quiet when the scan has no lead or the queue is missing", async () => {
    const db = memoryCheckDb();
    const created = await insertScan(db, {
      domain: "acme.example",
      origin: "https://acme.example",
      source: "public",
    });
    await createD1ScanRepository(db).markComplete(created.id, 28, { structuredData: 10 });
    const sent: unknown[] = [];
    await notifyLeadScan(db, { send: async (body) => { sent.push(body); } }, created.id);
    await notifyLeadScan(db, undefined, created.id);
    expect(sent).toEqual([]);
  });
});
