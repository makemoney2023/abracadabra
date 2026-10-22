import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { can, type Caller } from "@/lib/authz";
import type { Sql } from "@/db/sql";
import { cookieValue } from "@/lib/downloads";
import { recordLibraryMetric, type LibraryMetricName } from "@/lib/library-metrics";
import { getCaller, SESSION_COOKIE } from "@/lib/session";
import { resolveWorkspaceRouteId } from "@/lib/workspace-route";

export const dynamic = "force-dynamic";

const ALLOWED = new Set<LibraryMetricName>(["library_link_copied"]);

async function session(request: Request): Promise<{ sql: Sql; caller: Caller }> {
  const sql = await openHandoffDb();
  await migrate(sql);
  const caller = await getCaller(sql, cookieValue(request, SESSION_COOKIE), Date.now());
  return { sql, caller };
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const { sql, caller } = await session(request);
  const workspaceId = await resolveWorkspaceRouteId(sql, slug);
  if (!workspaceId) return Response.json({ error: "missing" }, { status: 404 });
  if (!can(caller, "workspace.view", { workspaceId })) return Response.json({ error: "missing" }, { status: 404 });
  let name: string;
  try {
    name = String(((await request.json()) as { name?: unknown }).name ?? "");
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  if (!ALLOWED.has(name as LibraryMetricName)) return Response.json({ error: "invalid" }, { status: 400 });
  const space = await sql.get<{ organization_id: string | null }>("SELECT organization_id FROM workspaces WHERE id = ?", [workspaceId]);
  if (!space?.organization_id) return Response.json({ error: "missing" }, { status: 404 });
  await recordLibraryMetric(sql, {
    name: name as LibraryMetricName,
    organizationId: space.organization_id,
    workspaceId,
    actorKind: caller.staff ? "staff" : "system",
    actorId: caller.userId,
    artifactType: "article",
  });
  return Response.json({ ok: true });
}
