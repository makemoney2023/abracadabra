import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHtmlForSchema } from "@/lib/fetch-html";

describe("fetchHtmlForSchema", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns HTML body for successful responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => "text/html; charset=utf-8" },
        text: async () => "<html><script type=\"application/ld+json\">{}</script></html>",
      }),
    );

    const html = await fetchHtmlForSchema("https://example.com/");
    expect(html).toContain("application/ld+json");
  });

  it("returns null when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: () => "text/html" },
        text: async () => "missing",
      }),
    );

    await expect(fetchHtmlForSchema("https://example.com/missing")).resolves.toBeNull();
  });

  it("uses a short AbortSignal timeout so scans cannot hang per page", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "text/html" },
      text: async () => "<html></html>",
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchHtmlForSchema("https://example.com/");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
