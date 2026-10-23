import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { cookieValue } from "@/lib/downloads";
import { openPreviewAccess } from "@/lib/preview";
import { objectResponse } from "@/lib/range-response";
import { openObjectStore } from "@/lib/store/objects";
import { getCaller, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await context.params;
  const sql = await openHandoffDb();
  await migrate(sql);
  const caller = await getCaller(sql, cookieValue(request, SESSION_COOKIE), Date.now());
  const access = await openPreviewAccess({ sql, caller, fileId });
  if (!access.ok) return new Response(null, { status: access.status });
  const { file } = access;
  if (file.kind === "video") {
    // A clip: the same checks as a picture, then streamed with Range support so it plays and seeks.
    const response = await objectResponse({
      store: openObjectStore(),
      key: file.key,
      contentType: file.contentType,
      request,
      headers: { "content-security-policy": "default-src 'none'; media-src 'self'; sandbox" },
    });
    response.headers.set("content-disposition", file.disposition);
    return response;
  }
  const bytes = await openObjectStore().read(file.key);
  if (!bytes) return new Response(null, { status: 404 });
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "content-type": file.contentType,
      "content-disposition": file.disposition,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, no-store",
    },
  });
}
