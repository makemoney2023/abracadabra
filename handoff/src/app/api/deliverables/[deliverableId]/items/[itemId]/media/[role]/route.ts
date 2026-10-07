import { migrate } from "@/db/migrate";
import { visibleMedia } from "@/db/deliverables";
import { openHandoffDb } from "@/db/open";
import { MEDIA_ROLES } from "@/lib/deliverable-manifest";
import { cookieValue } from "@/lib/downloads";
import { openObjectStore } from "@/lib/store/objects";
import { getCaller, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

const ROLES = new Set<string>(MEDIA_ROLES);

export async function GET(
  request: Request,
  context: { params: Promise<{ deliverableId: string; itemId: string; role: string }> },
) {
  const { deliverableId, itemId, role } = await context.params;
  if (!ROLES.has(role)) return new Response(null, { status: 404 });
  const sql = await openHandoffDb();
  await migrate(sql);
  const caller = await getCaller(sql, cookieValue(request, SESSION_COOKIE), Date.now());
  const media = await visibleMedia(sql, caller, deliverableId, itemId, role);
  if (!media) return new Response(null, { status: 404 });
  const bytes = await openObjectStore().read(media.key);
  if (!bytes) return new Response(null, { status: 404 });
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "content-type": media.contentType,
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, no-store",
    },
  });
}
