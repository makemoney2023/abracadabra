/**
 * Read at most `maxBytes` of a response body as text, then stop the download. A Worker has 128 MB, and some sites
 * serve huge files (developers.cloudflare.com's llms-full.txt is 69 MB), so `response.text()` on an unknown body
 * can take the whole scan down. Everything the scanner reads is decided by the start of a file.
 */
export const SITE_FILE_MAX_BYTES = 5_000_000;
export const PAGE_MAX_BYTES = 2_000_000;

export async function readTextCapped(response: Response, maxBytes: number): Promise<string> {
  const body = response.body;
  // No stream (an empty body, or a stand-in object): text() is then empty or already in memory.
  if (!body) return typeof response.text === "function" ? (await response.text()).slice(0, maxBytes) : "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let read = 0;
  try {
    while (read < maxBytes) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      const room = maxBytes - read;
      const part = value.byteLength > room ? value.subarray(0, room) : value;
      read += part.byteLength;
      text += decoder.decode(part, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    // Drop the rest of the body instead of downloading it.
    reader.cancel().catch(() => undefined);
  }
}
