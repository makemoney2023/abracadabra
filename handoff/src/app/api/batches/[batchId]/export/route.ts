import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { cookieValue } from "@/lib/downloads";
import { exportBatch } from "@/lib/export";
import { getCaller, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await context.params;
  const sql = await openHandoffDb();
  await migrate(sql);
  const caller = await getCaller(sql, cookieValue(request, SESSION_COOKIE), Date.now());
  const result = await exportBatch({
    sql,
    caller,
    batchId,
    origin: new URL(request.url).origin,
    now: Date.now(),
  });
  if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
  return Response.json(result.document);
}
