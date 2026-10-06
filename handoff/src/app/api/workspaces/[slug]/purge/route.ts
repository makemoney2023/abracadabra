import { z } from "zod";
import { workspacesFor } from "@/db/records";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { cookieValue } from "@/lib/downloads";
import { purgeWorkspace } from "@/lib/retention";
import { getCaller, SESSION_COOKIE } from "@/lib/session";
import { openObjectStore } from "@/lib/store/objects";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ reason: z.string().optional() }).strict();

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ message: "You cannot do that." }, { status: 400 });
  }
  const sql = await openHandoffDb();
  await migrate(sql);
  const now = Date.now();
  const caller = await getCaller(sql, cookieValue(request, SESSION_COOKIE), now);
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace) return Response.json({ message: "Not found." }, { status: 404 });
  const result = await purgeWorkspace({
    sql,
    caller,
    store: openObjectStore(),
    workspaceId: workspace.id,
    reason: parsed.reason ?? null,
    now,
  });
  if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
  return Response.json({ status: "purged" });
}
