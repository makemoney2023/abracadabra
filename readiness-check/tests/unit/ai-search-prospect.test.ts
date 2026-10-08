import { describe, expect, it } from "vitest";
import { createAiSearchProspectFinder, domainsFromObjective, needsFollowUp } from "@/lib/ai-search/prospect";

describe("domainsFromObjective", () => {
  it("reads sites from urls and bare domains", () => {
    expect(
      domainsFromObjective("Check https://acme.example/pricing and noemail.example today."),
    ).toEqual(["acme.example", "noemail.example"]);
  });

  it("skips email addresses and duplicate hosts", () => {
    expect(domainsFromObjective("Write ada@acme.example about https://www.acme.example")).toEqual([
      "acme.example",
    ]);
  });
});

describe("needsFollowUp", () => {
  it("follows up when the answer says they need us", () => {
    expect(needsFollowUp("NEEDS_US\nThe homepage has no answer-engine markup.")).toBe(true);
  });

  it("skips a site that is already covered", () => {
    expect(needsFollowUp("COVERED\nThe site already publishes structured answers.")).toBe(false);
    expect(needsFollowUp("")).toBe(false);
  });
});

describe("createAiSearchProspectFinder", () => {
  it("turns only a needs-us answer into a lead", async () => {
    const finder = createAiSearchProspectFinder({
      env: { accountId: "acct", apiToken: "token" },
      fetchImpl: async (input, init) => {
        const href = String(input);
        const method = init?.method ?? "GET";
        if (href === "https://needs.example/") {
          return new Response("<html><title>Needs Co</title><p>No schema.</p></html>", { status: 200 });
        }
        if (href === "https://covered.example/") {
          return new Response("<html><title>Covered Co</title></html>", { status: 200 });
        }
        if (method === "GET" && href.includes("/instances/schema-")) {
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        if (method === "POST" && href.endsWith("/items")) {
          return new Response(JSON.stringify({ success: true, result: { status: "completed" } }), { status: 200 });
        }
        if (method === "POST" && href.endsWith("/chat/completions")) {
          const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
          const covered = href.includes("schema-covered-example");
          expect(body.messages[0]?.content).toContain("shops that cannot be quoted");
          const answer = covered ? "COVERED\nAlready answerable." : "NEEDS_US\nNothing for an answer engine to quote.";
          return new Response(
            JSON.stringify({
              success: true,
              result: { choices: [{ message: { role: "assistant", content: answer } }] },
            }),
            { status: 200 },
          );
        }
        return new Response("no", { status: 404 });
      },
    });

    const leads = await finder.findProspects(
      "Check https://needs.example and covered.example for shops that cannot be quoted.",
    );
    expect(leads).toEqual([
      {
        name: "Needs Co",
        domain: "needs.example",
        website: "https://needs.example",
        contacts: [],
        raw: { source: "ai_search", answer: "NEEDS_US\nNothing for an answer engine to quote." },
      },
    ]);
  });

  it("returns no leads when Cloudflare credentials are missing", async () => {
    const finder = createAiSearchProspectFinder({
      env: {},
      fetchImpl: async () => new Response("no", { status: 200 }),
    });
    expect(await finder.findProspects("Check https://needs.example now.")).toEqual([]);
  });
});
