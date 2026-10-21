import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHtmlForSchema, probeUrl, SCANNER_USER_AGENT } from "@/lib/fetch-html";

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

describe("probeUrl", () => {
  const res = (status: number, url = "") => ({ status, url, body: { cancel: async () => {} } }) as unknown as Response;

  it("uses HEAD with the scanner user agent and treats 2xx/3xx as existing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200, "https://example.com/start/"));
    const result = await probeUrl("https://example.com/contact", fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ exists: true, status: 200, finalUrl: "https://example.com/start/" });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("HEAD");
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe(SCANNER_USER_AGENT);
    expect((await probeUrl("https://example.com/x", vi.fn().mockResolvedValue(res(301)) as unknown as typeof fetch)).exists).toBe(true);
  });

  it("treats 404 and 410 as missing", async () => {
    for (const status of [404, 410]) {
      const result = await probeUrl("https://example.com/faq", vi.fn().mockResolvedValue(res(status)) as unknown as typeof fetch);
      expect(result.exists).toBe(false);
      expect(result.status).toBe(status);
    }
  });

  it("falls back to GET when HEAD is refused", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(res(405)).mockResolvedValueOnce(res(200));
    const result = await probeUrl("https://example.com/pricing", fetchImpl as unknown as typeof fetch);
    expect(result.exists).toBe(true);
    expect((fetchImpl.mock.calls[1][1] as RequestInit).method).toBe("GET");
  });

  it("treats network errors and timeouts as missing", async () => {
    const result = await probeUrl("https://example.com/book", vi.fn().mockRejectedValue(new Error("timeout")) as unknown as typeof fetch);
    expect(result).toEqual({ exists: false, status: null, finalUrl: null });
  });
});
