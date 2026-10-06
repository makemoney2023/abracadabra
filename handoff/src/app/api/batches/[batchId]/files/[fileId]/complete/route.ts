import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { getCaller, SESSION_COOKIE } from "@/lib/session";
import { openObjectStore } from "@/lib/store/objects";
import { completeUpload } from "@/lib/store/uploads";

export const dynamic = "force-dynamic";

function cookieValue(request: Request, name: string): string {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string; fileId: string }> },
) {
  const { batchId, fileId } = await context.params;
  const sql = await openHandoffDb();
  await migrate(sql);
  const caller = await getCaller(sql, cookieValue(request, SESSION_COOKIE), Date.now());
  const result = await completeUpload({
    sql,
    caller,
    store: openObjectStore(),
    batchId,
    fileId,
    now: Date.now(),
  });
  if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
  return Response.json({ file: result.file }, { status: 200 });
}
