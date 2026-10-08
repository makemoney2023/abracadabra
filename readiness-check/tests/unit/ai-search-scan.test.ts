import { describe, expect, it } from "vitest";
import { createAiSearchScanClient, sameSiteLinks } from "@/lib/ai-search/scan-client";

const HOME = `<html><body>
  <a href="/pricing">Pricing</a>
  <a href="https://example.com/about">About</a>
  <a href="https://other.test/nope">Elsewhere</a>
  <a href="mailto:ada@example.com">Mail</a>
</body></html>`;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("sameSiteLinks", () => {
  it("keeps pages on the scanned host", () => {
    expect(sameSiteLinks(HOME, "https://example.com", 10)).toEqual([
      "https://example.com/pricing",
      "https://example.com/about",
    ]);
  });

  it("returns nothing when the page has no links", () => {
    expect(sameSiteLinks("<html></html>", "https://example.com", 10)).toEqual([]);
  });
});

describe("createAiSearchScanClient", () => {
  it("reads a page body directly", async () => {
    const client = createAiSearchScanClient({
      env: {},
      fetchImpl: async () => new Response("User-agent: *\nAllow: /\n", { status: 200 }),
    });
    const [row] = await client.extract(["https://example.com/robots.txt"], { fullContent: true });
    expect(row).toEqual({
      url: "https://example.com/robots.txt",
      content: "User-agent: *\nAllow: /\n",
    });
  });

  it("records a failed fetch", async () => {
    const client = createAiSearchScanClient({
      env: {},
      fetchImpl: async () => new Response("missing", { status: 404 }),
    });
    const [row] = await client.extract(["https://example.com/llms-full.txt"]);
    expect(row).toEqual({ url: "https://example.com/llms-full.txt", content: "", error: "404" });
  });

  it("asks AI Search for pages and keeps homepage links when the index is empty", async () => {
    const seen: string[] = [];
    const client = createAiSearchScanClient({
      env: { accountId: "acct", apiToken: "token" },
      fetchImpl: async (input, init) => {
        const href = String(input);
        const method = init?.method ?? "GET";
        if (href === "https://example.com/") {
          return new Response(HOME, { status: 200, headers: { "content-type": "text/html" } });
        }
        seen.push(`${method} ${href}`);
        expect(init?.headers).toMatchObject({ Authorization: "Bearer token" });
        if (method === "GET" && href.endsWith("/instances/schema-example-com")) {
          return jsonResponse(404, { success: false });
        }
        if (method === "POST" && href.endsWith("/instances")) {
          const body = JSON.parse(String(init?.body));
          expect(body).toEqual({ id: "schema-example-com" });
          return jsonResponse(200, { success: true, result: { id: "schema-example-com" } });
        }
        if (method === "POST" && href.endsWith("/items")) {
          const form = init?.body;
          expect(form).toBeInstanceOf(FormData);
          const file = (form as FormData).get("file");
          expect(file).toBeInstanceOf(File);
          expect((file as File).name).toBe("home.html");
          expect((form as FormData).get("metadata")).toBe(
            JSON.stringify({ url: "https://example.com/", domain: "example.com" }),
          );
          expect((form as FormData).get("wait_for_completion")).toBe("true");
          return jsonResponse(200, { success: true, result: { status: "completed", key: "home.html" } });
        }
        if (method === "POST" && href.endsWith("/search")) {
          const body = JSON.parse(String(init?.body));
          expect(body.messages[0].content).toBe("Find important pages on example.com");
          return jsonResponse(200, {
            success: true,
            result: {
              chunks: [
                {
                  text: "Frequently asked questions",
                  item: { key: "home.html", metadata: { url: "https://example.com/faq" } },
                },
              ],
            },
          });
        }
        return jsonResponse(500, { success: false });
      },
    });

    const results = await client.search("Find important pages on example.com", {
      includeDomains: ["example.com"],
      maxResults: 10,
    });
    expect(seen).toEqual([
      "GET https://api.cloudflare.com/client/v4/accounts/acct/ai-search/namespaces/default/instances/schema-example-com",
      "POST https://api.cloudflare.com/client/v4/accounts/acct/ai-search/namespaces/default/instances",
      "POST https://api.cloudflare.com/client/v4/accounts/acct/ai-search/namespaces/default/instances/schema-example-com/items",
      "POST https://api.cloudflare.com/client/v4/accounts/acct/ai-search/namespaces/default/instances/schema-example-com/search",
    ]);
    expect(results.map((row) => row.url)).toEqual([
      "https://example.com/pricing",
      "https://example.com/about",
      "https://example.com/faq",
    ]);
    expect(results[2]?.excerpt).toBe("Frequently asked questions");
  });

  it("returns homepage links when Cloudflare credentials are missing", async () => {
    const client = createAiSearchScanClient({
      env: {},
      fetchImpl: async () => new Response(HOME, { status: 200 }),
    });
    const results = await client.search("Find important pages", {
      includeDomains: ["example.com"],
      maxResults: 10,
    });
    expect(results.map((row) => row.url)).toEqual([
      "https://example.com/pricing",
      "https://example.com/about",
    ]);
  });
});
