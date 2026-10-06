import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { cookieValue, retagFile } from "@/lib/downloads";
import { getCaller, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string; fileId: string }> },
) {
  const { batchId, fileId } = await context.params;
  let tag = "";
  try {
    const body = (await request.json()) as { tag?: unknown };
    tag = typeof body.tag === "string" ? body.tag : "";
  } catch {
    return Response.json({ message: "You can't do that." }, { status: 400 });
  }
  const sql = await openHandoffDb();
  await migrate(sql);
  const caller = await getCaller(sql, cookieValue(request, SESSION_COOKIE), Date.now());
  const result = await retagFile({ sql, caller, batchId, fileId, tag, now: Date.now() });
  if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
  return Response.json({ tag: result.tag });
}
