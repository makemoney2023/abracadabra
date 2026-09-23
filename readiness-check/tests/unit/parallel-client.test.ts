import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createParallelClient } from "@/lib/parallel/client";
import { createMockParallel } from "@/lib/parallel/mock";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("createParallelClient", () => {
  const originalKey = process.env.PARALLEL_API_KEY;

  beforeEach(() => {
    process.env.PARALLEL_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    process.env.PARALLEL_API_KEY = originalKey;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("throws if PARALLEL_API_KEY is missing", () => {
    delete process.env.PARALLEL_API_KEY;
    expect(() => createParallelClient()).toThrow(/PARALLEL_API_KEY/);
  });

  it("sends x-api-key header and urls on extract", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        results: [
          {
            url: "https://example.com",
            title: "Example",
            full_content: "hello from full_content",
            excerpts: ["ignored when full_content present"],
          },
        ],
        errors: [],
      })
    );

    const client = createParallelClient();
    const results = await client.extract(["https://example.com"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.parallel.ai/v1beta/extract");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("test-key");

    const body = JSON.parse(init.body as string);
    expect(body.urls).toEqual(["https://example.com"]);
    expect(body.excerpts).toBe(true);
    expect(body.full_content).toBe(true);

    expect(results).toEqual([
      { url: "https://example.com", title: "Example", content: "hello from full_content" },
    ]);
  });

  it("maps Parallel excerpts into content when full_content is absent", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        results: [
          {
            url: "https://example.com",
            title: "Example",
            full_content: null,
            excerpts: ["part one", "part two"],
          },
        ],
        errors: [],
      })
    );

    const client = createParallelClient();
    const results = await client.extract(["https://example.com"]);

    expect(results).toEqual([
      { url: "https://example.com", title: "Example", content: "part one\n\npart two" },
    ]);
  });

  it("maps the errors array into results with an error field", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        results: [],
        errors: [{ url: "https://example.com/bad", message: "timeout" }],
      })
    );

    const client = createParallelClient();
    const results = await client.extract(["https://example.com/bad"]);

    expect(results).toEqual([{ url: "https://example.com/bad", content: "", error: "timeout" }]);
  });

  it("retries once on a 500 response and then succeeds", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500, { message: "server error" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          results: [{ url: "https://example.com", content: "ok" }],
          errors: [],
        })
      );

    const client = createParallelClient();
    const results = await client.extract(["https://example.com"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results).toEqual([{ url: "https://example.com", title: undefined, content: "ok" }]);
  });

  it("throws after exhausting retries on a persistent 500", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(500, { message: "server error" }));

    const client = createParallelClient();

    await expect(client.extract(["https://example.com"])).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("sends objective and include_domains on search", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        results: [{ url: "https://example.com/page", title: "T", excerpt: "E" }],
      })
    );

    const client = createParallelClient();
    const results = await client.search("pricing pages", { includeDomains: ["example.com"] });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.parallel.ai/v1beta/search");
    const body = JSON.parse(init.body as string);
    expect(body.objective).toBe("pricing pages");
    expect(body.include_domains).toEqual(["example.com"]);

    expect(results).toEqual([{ url: "https://example.com/page", title: "T", excerpt: "E" }]);
  });

  it("posts to findall ingest and parses leads on findAllAndEnrich", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        results: [
          {
            domain: "example.com",
            name: "Example Co",
            website: "https://example.com",
            contacts: [{ name: "Jane Doe", email: "jane@example.com" }],
          },
        ],
      })
    );

    const client = createParallelClient();
    const leads = await client.findAllAndEnrich("chiropractors in Austin");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.parallel.ai/v1beta/findall/ingest");
    const body = JSON.parse(init.body as string);
    expect(body.query).toBe("chiropractors in Austin");

    expect(leads).toHaveLength(1);
    expect(leads[0].domain).toBe("example.com");
    expect(leads[0].contacts[0].email).toBe("jane@example.com");
  });
});

describe("createMockParallel", () => {
  it("returns stubbed extracts from a provided handler", async () => {
    const mock = createMockParallel({
      extract: async (urls) => urls.map((url) => ({ url, content: "stub" })),
    });

    const result = await mock.extract(["https://a.com"]);
    expect(result).toEqual([{ url: "https://a.com", content: "stub" }]);
  });

  it("defaults search and findAllAndEnrich to empty arrays when no handler is given", async () => {
    const mock = createMockParallel({});
    expect(await mock.search("x", { includeDomains: [] })).toEqual([]);
    expect(await mock.findAllAndEnrich("x")).toEqual([]);
  });

  it("defaults extract to echoing urls with empty content when no handler is given", async () => {
    const mock = createMockParallel({});
    expect(await mock.extract(["https://a.com"])).toEqual([{ url: "https://a.com", content: "" }]);
  });
});
