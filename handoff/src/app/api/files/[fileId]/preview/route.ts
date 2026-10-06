import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { cookieValue } from "@/lib/downloads";
import { readPreviewFile } from "@/lib/preview";
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
  const result = await readPreviewFile({ sql, caller, fileId });
  if (!result.ok) return new Response(null, { status: result.status });
  return new Response(Buffer.from(result.file.bytes), {
    status: 200,
    headers: {
      "content-type": result.file.contentType,
      "content-disposition": result.file.disposition,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, no-store",
    },
  });
}
