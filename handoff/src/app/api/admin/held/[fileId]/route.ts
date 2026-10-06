import { z } from "zod";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { cookieValue } from "@/lib/downloads";
import { reviewHeldFile } from "@/lib/review";
import { getCaller, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    action: z.enum(["release", "reject"]),
    reason: z.string(),
  })
  .strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await context.params;
  const sql = await openHandoffDb();
  await migrate(sql);
  const caller = await getCaller(sql, cookieValue(request, SESSION_COOKIE), Date.now());
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "You can't do that." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ message: "You can't do that." }, { status: 400 });
  const result = await reviewHeldFile({
    sql,
    caller,
    fileId,
    action: parsed.data.action,
    reason: parsed.data.reason,
    now: Date.now(),
  });
  if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
  return Response.json({ status: result.status });
}
