import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { cookieValue, issueDownload } from "@/lib/downloads";
import { getCaller, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ batchId: string; fileId: string }> },
) {
  const { batchId, fileId } = await context.params;
  const sql = await openHandoffDb();
  await migrate(sql);
  const caller = await getCaller(sql, cookieValue(request, SESSION_COOKIE), Date.now());
  const result = await issueDownload({
    sql,
    caller,
    batchId,
    fileId,
    origin: new URL(request.url).origin,
    now: Date.now(),
  });
  if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
  return Response.json({ url: result.url });
}
