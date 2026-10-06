import { workspacesFor } from "@/db/records";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { cookieValue } from "@/lib/downloads";
import { exportWorkspace } from "@/lib/retention";
import { getCaller, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const sql = await openHandoffDb();
  await migrate(sql);
  const now = Date.now();
  const caller = await getCaller(sql, cookieValue(request, SESSION_COOKIE), now);
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace) return Response.json({ message: "We couldn't find that." }, { status: 404 });
  const result = await exportWorkspace({
    sql,
    caller,
    workspaceId: workspace.id,
    origin: new URL(request.url).origin,
    now,
  });
  if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
  return Response.json(result.document);
}
