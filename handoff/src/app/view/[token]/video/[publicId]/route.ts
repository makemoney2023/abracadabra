import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { cookieValue } from "@/lib/downloads";
import { LIBRARY_PUBLIC_HEADERS, viewVideo } from "@/lib/library-shares";
import { objectResponse } from "@/lib/range-response";
import { openObjectStore } from "@/lib/store/objects";

export const dynamic = "force-dynamic";

/**
 * A clip on a read-only view link, for the player on the view page. Same token, passcode, expiry and pinned-item checks as
 * the picture route; an unavailable link answers the same generic 404. Range requests are supported so it plays and seeks.
 * Streaming for looking is not a download: the Download link still follows the share's downloads setting.
 */
export async function GET(request: Request, context: { params: Promise<{ token: string; publicId: string }> }) {
  const { token, publicId } = await context.params;
  const sql = await openHandoffDb();
  await migrate(sql);
  const result = await viewVideo(sql, token, publicId, Date.now(), cookieValue(request, "library_view"));
  if (!result.ok) return new Response(null, { status: 404, headers: LIBRARY_PUBLIC_HEADERS });
  // objectResponse sets a private, no-cache policy for clips (not no-store, so Safari can seek).
  return objectResponse({
    store: openObjectStore(),
    key: result.key,
    contentType: result.contentType,
    request,
    headers: { ...LIBRARY_PUBLIC_HEADERS, "content-security-policy": "default-src 'none'; media-src 'self'; frame-ancestors 'none'; sandbox" },
  });
}
