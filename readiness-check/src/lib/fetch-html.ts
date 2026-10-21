import { PAGE_MAX_BYTES, readTextCapped } from "@/lib/read-capped";
/** Keep short — many pages may be attempted; long hangs freeze the scan UI. */
const HTML_FETCH_TIMEOUT_MS = 5_000;
/** Existence checks on guessed paths are cheaper still. */
export const PROBE_TIMEOUT_MS = 3_000;
export const SCANNER_USER_AGENT = "SchemaAEOScanner/1.0 (+https://localhost)";

export type ProbeResult = { exists: boolean; status: number | null; finalUrl: string | null };

/**
 * Cheap existence check for a guessed URL: HEAD, or GET when the server refuses HEAD (403, 405, 501).
 * Redirects are followed; 2xx and 3xx count as existing. Errors and timeouts count as missing.
 */
export async function probeUrl(url: string, fetchImpl: typeof fetch = fetch): Promise<ProbeResult> {
  const attempt = (method: "HEAD" | "GET") =>
    fetchImpl(url, {
      method,
      redirect: "follow",
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": SCANNER_USER_AGENT },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  try {
    let response = await attempt("HEAD");
    if ([403, 405, 501].includes(response.status)) {
      response = await attempt("GET");
      try {
        await response.body?.cancel();
      } catch {
        // The status is all we need.
      }
    }
    return {
      exists: response.status >= 200 && response.status < 400,
      status: response.status,
      finalUrl: response.url || url,
    };
  } catch {
    return { exists: false, status: null, finalUrl: null };
  }
}

/**
 * Direct HTML GET for JSON-LD detection.
 *
 * Indexed page text drops `<script type="application/ld+json">` blocks, so schema
 * detection reads the raw HTML after the scan has the page URL.
 */
export async function fetchHtmlForSchema(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": SCANNER_USER_AGENT,
      },
      signal: AbortSignal.timeout(HTML_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) {
      return null;
    }

    return await readTextCapped(response, PAGE_MAX_BYTES);
  } catch {
    return null;
  }
}
