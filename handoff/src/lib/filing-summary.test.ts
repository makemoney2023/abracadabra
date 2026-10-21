import { describe, expect, it } from "vitest";
import { parseWorkPayload, summaryMarkdown, type AgentPrincipal } from "./agent-work-filing";
import { cleanAgentLabel, clientDetails, clientLead, deliveredLabel, parseFilingSummary } from "./filing-summary";

const AGENT: AgentPrincipal = {
  agentId: "abracadabra-client",
  label: "Abracadabra Client (Grok Bot teammate 3cd07aef-46af-47da-ad75-dd733168e495)",
  assignments: [],
};

function payload(extra: Record<string, unknown> = {}) {
  const parsed = parseWorkPayload({
    external_id: "abracadabra-client-2026-10-20-social-media-v3-one-filing",
    title: "Social media v2 (corrected), one filing",
    kind: "document",
    task_id: "b3643f97-11ba-4b6d-9126-0f21b2d61793",
    finished_at: "2026-10-21T00:48:33.083Z",
    summary: "Final drafts, nothing posted. **6 Facebook posts** and 2 banners.",
    links: [{ label: "Schema (post CTA)", url: "https://abra-ca-dabra.app/products/schema/" }],
    attachments: [{ name: "facebook-posts.md", body: "# Posts" }, { name: "schema-1.png", body: "x" }],
    content: "This replaces the earlier filing.\n\n---\n\n# Facebook posts\n\n## Schema 1\n\n**Hook:** Can AI read your site?\n\n- one\n- two",
    ...extra,
  });
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.payload;
}

describe("parseFilingSummary", () => {
  it("reads back what a filing writes", () => {
    const text = summaryMarkdown(AGENT, payload(), 0);
    const summary = parseFilingSummary(text)!;
    expect(summary).not.toBeNull();
    expect(summary.title).toBe("Social media v2 (corrected), one filing");
    expect(summary.agentName).toBe("Abracadabra Client");
    expect(summary.finishedAt?.toISOString()).toBe("2026-10-21T00:48:33.083Z");
    expect(summary.summary).toBe("Final drafts, nothing posted. **6 Facebook posts** and 2 banners.");
    expect(summary.links).toEqual([{ label: "Schema (post CTA)", url: "https://abra-ca-dabra.app/products/schema/" }]);
    expect(summary.files).toEqual(["facebook-posts.md", "schema-1.png"]);
    // The content keeps its own rules and headings.
    expect(summary.body).toContain("This replaces the earlier filing.");
    expect(summary.body).toContain("---\n\n# Facebook posts");
    expect(summary.body).toContain("**Hook:** Can AI read your site?");
    expect(summary.meta.map((entry) => entry.key)).toEqual(["Kind", "Agent", "Finished", "Task", "Ref"]);
    expect(summary.clientSummary).toBeNull();
    expect(clientLead(summary)).toBe(summary.summary);
    expect(clientDetails(summary)).toBe(summary.body);
  });

  it("puts client_summary first and keeps the agent summary in the details", () => {
    const text = summaryMarkdown(AGENT, payload({ client_summary: "Your October posts are ready to look at." }), 0);
    expect(text).toContain("## For the client\n\nYour October posts are ready to look at.");
    const summary = parseFilingSummary(text)!;
    expect(summary.clientSummary).toBe("Your October posts are ready to look at.");
    expect(clientLead(summary)).toBe("Your October posts are ready to look at.");
    expect(clientDetails(summary)).toContain("Final drafts, nothing posted.");
    expect(clientDetails(summary)).toContain("This replaces the earlier filing.");
  });

  it("keeps a handoff note out of the client text", () => {
    const summary = parseFilingSummary(summaryMarkdown(AGENT, payload({ handoff: { to: "designer", note: "Use the teal." } }), 0))!;
    expect(summary.handoff).toBe("Use the teal.");
    expect(`${clientLead(summary)} ${clientDetails(summary)}`).not.toContain("Use the teal.");
  });

  it("falls back to the receive time and skips a bad finished_at", () => {
    const summary = parseFilingSummary(summaryMarkdown(AGENT, payload({ finished_at: "yesterday-ish" }), 0))!;
    expect(summary.finishedAt).toBeNull();
    const received = parseFilingSummary(summaryMarkdown(AGENT, payload({ finished_at: undefined }), Date.UTC(2026, 9, 21, 0, 48)))!;
    expect(received.finishedAt?.toISOString()).toBe("2026-10-21T00:48:00.000Z");
  });

  it("leaves other pages alone", () => {
    expect(parseFilingSummary(null)).toBeNull();
    expect(parseFilingSummary("")).toBeNull();
    expect(parseFilingSummary("# Brief\n\nBuild a pricing page.")).toBeNull();
    expect(parseFilingSummary("#hashtag post copy\n- Kind: of")).toBeNull();
    // A hand-written list under a heading is not a filing: no Ref or Agent line.
    expect(parseFilingSummary("# Menu\n\n- Bread: sourdough\n- Cake: carrot")).toBeNull();
    // Unknown metadata keys mean it is not ours.
    expect(parseFilingSummary("# Menu\n\n- Ref: 12\n- Bread: sourdough")).toBeNull();
  });
});

describe("cleanAgentLabel", () => {
  it("drops trailing ids and slugs", () => {
    expect(cleanAgentLabel("Abracadabra Client (Grok Bot teammate 3cd07aef-46af-47da-ad75-dd733168e495) (abracadabra-client)")).toBe("Abracadabra Client");
    expect(cleanAgentLabel("Strong Foam lead")).toBe("Strong Foam lead");
    expect(cleanAgentLabel("(abracadabra-client)")).toBe("(abracadabra-client)");
  });
});

describe("deliveredLabel", () => {
  it("formats in Toronto time with the zone", () => {
    expect(deliveredLabel(new Date("2026-10-21T00:48:33.083Z"))).toBe("Oct 20, 2026 · 8:48 PM EDT");
    expect(deliveredLabel(new Date("2026-12-01T15:05:00Z"))).toBe("Dec 1, 2026 · 10:05 AM EST");
  });
});
