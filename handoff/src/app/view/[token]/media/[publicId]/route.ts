import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { cookieValue } from "@/lib/downloads";
import { LIBRARY_PUBLIC_HEADERS, viewPicture } from "@/lib/library-shares";
import { openObjectStore } from "@/lib/store/objects";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ token: string; publicId: string }> }) {
  const { token, publicId } = await context.params;
  const sql = await openHandoffDb();
  await migrate(sql);
  const result = await viewPicture(sql, token, publicId, Date.now(), cookieValue(request, "library_view"));
  if (!result.ok) return new Response(null, { status: 404, headers: LIBRARY_PUBLIC_HEADERS });
  const bytes = await openObjectStore().read(result.key);
  if (!bytes) return new Response(null, { status: 404, headers: LIBRARY_PUBLIC_HEADERS });
  const headers = new Headers(LIBRARY_PUBLIC_HEADERS);
  headers.set("content-type", result.contentType);
  headers.set("content-disposition", "inline");
  headers.set("content-security-policy", "default-src 'none'; sandbox");
  return new Response(Buffer.from(bytes), { status: 200, headers });
}
