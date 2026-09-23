import { describe, expect, it } from "vitest";
import {
  applyQueueFilters,
  mapQueueRow,
  parseQueueFilters,
  type OpsQueueItem,
} from "@/lib/ops/queue";

function item(partial: Partial<OpsQueueItem> & { id: string }): OpsQueueItem {
  return {
    leadId: "lead-1",
    status: "new",
    priorityScore: 50,
    missingContact: false,
    notes: null,
    statusChangedAt: "2026-08-11T00:00:00Z",
    lead: {
      id: "lead-1",
      name: "Acme",
      domain: "acme.example",
      website: "https://acme.example",
      industry: null,
    },
    contacts: [{ id: "c1", name: "A", title: null, email: "a@acme.example", phone: null }],
    latestScan: {
      id: "s1",
      scoreTotal: 40,
      status: "complete",
      publicToken: "tok",
      scoreBreakdown: {},
    },
    topGaps: [],
    check: null,
    ...partial,
  };
}

describe("ops queue filters", () => {
  it("parses query filters", () => {
    const filters = parseQueueFilters(
      new URLSearchParams("status=new&hasEmail=true&minScore=10&maxScore=50"),
    );
    expect(filters).toEqual({
      status: "new",
      hasEmail: true,
      minScore: 10,
      maxScore: 50,
    });
  });

  it("filters by hasEmail and score range", () => {
    const items = [
      item({
        id: "1",
        contacts: [{ id: "c1", name: null, title: null, email: "a@x.com", phone: null }],
        latestScan: {
          id: "s1",
          scoreTotal: 20,
          status: "complete",
          publicToken: "t",
          scoreBreakdown: {},
        },
      }),
      item({
        id: "2",
        contacts: [],
        missingContact: true,
        latestScan: {
          id: "s2",
          scoreTotal: 20,
          status: "complete",
          publicToken: "t2",
          scoreBreakdown: {},
        },
      }),
      item({
        id: "3",
        contacts: [{ id: "c3", name: null, title: null, email: "b@x.com", phone: null }],
        latestScan: {
          id: "s3",
          scoreTotal: 80,
          status: "complete",
          publicToken: "t3",
          scoreBreakdown: {},
        },
      }),
    ];

    const filtered = applyQueueFilters(items, {
      hasEmail: true,
      maxScore: 50,
    });
    expect(filtered.map((i) => i.id)).toEqual(["1"]);
  });

  it("maps db row with top gaps from failed findings", () => {
    const mapped = mapQueueRow({
      id: "q1",
      lead_id: "lead-1",
      status: "new",
      priority_score: 85,
      missing_contact: false,
      notes: null,
      status_changed_at: "2026-08-11T00:00:00Z",
      leads: {
        id: "lead-1",
        name: "Acme",
        domain: "acme.example",
        website: "https://acme.example",
        industry: null,
        contacts: [],
      },
      scans: {
        id: "s1",
        score_total: 20,
        status: "complete",
        public_token: "tok",
        score_breakdown: {},
        scan_findings: [
          {
            code: "MISSING_LLMS_TXT",
            severity: "critical",
            passed: false,
            message: "Missing llms.txt",
          },
          {
            code: "NO_ORG_SCHEMA",
            severity: "info",
            passed: true,
            message: "ok",
          },
        ],
      },
    });

    expect(mapped.priorityScore).toBe(85);
    expect(mapped.topGaps).toEqual([
      {
        code: "MISSING_LLMS_TXT",
        severity: "critical",
        message: "Missing llms.txt",
      },
    ]);
  });
});
