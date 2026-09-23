/** Keep short — many pages may be attempted; long hangs freeze the scan UI. */
const HTML_FETCH_TIMEOUT_MS = 5_000;

/**
 * Direct HTML GET for JSON-LD detection.
 *
 * Parallel Extract returns markdown and strips `<script type="application/ld+json">`
 * blocks, so schema detection needs a raw HTML fetch after Parallel confirms the URL
 * is reachable.
 */
export async function fetchHtmlForSchema(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "SchemaAEOScanner/1.0 (+https://localhost)",
      },
      signal: AbortSignal.timeout(HTML_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  }
}
