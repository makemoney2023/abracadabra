import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { cookieValue, deleteUploadedFile } from "@/lib/downloads";
import { getCaller, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ batchId: string; fileId: string }> },
) {
  const { batchId, fileId } = await context.params;
  const sql = await openHandoffDb();
  await migrate(sql);
  const now = Date.now();
  const caller = await getCaller(sql, cookieValue(request, SESSION_COOKIE), now);
  const result = await deleteUploadedFile({ sql, caller, batchId, fileId, now });
  if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
  return Response.json({ ok: true });
}
