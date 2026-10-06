import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { cookieValue, discardBatch } from "@/lib/downloads";
import { getCaller, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await context.params;
  const sql = await openHandoffDb();
  await migrate(sql);
  const caller = await getCaller(sql, cookieValue(request, SESSION_COOKIE), Date.now());
  const result = await discardBatch({ sql, caller, batchId, now: Date.now() });
  if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
  return Response.json({ ok: true });
}
