import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { can, type Caller } from "@/lib/authz";
import type { Sql } from "@/db/sql";
import { cookieValue } from "@/lib/downloads";
import { recordLibraryMetric } from "@/lib/library-metrics";
import { refreshViewLink, revokeViewLink } from "@/lib/library-shares";
import { getCaller, SESSION_COOKIE } from "@/lib/session";
import { resolveWorkspaceRouteId } from "@/lib/workspace-route";

export const dynamic = "force-dynamic";

async function gate(sql: Sql, caller: Caller, workspaceId: string): Promise<Response | null> {
  if (!can(caller, "workspace.view", { workspaceId })) return Response.json({ error: "missing" }, { status: 404 });
  if (!can(caller, "view_link.manage", { workspaceId })) return Response.json({ error: "forbidden" }, { status: 403 });
  return null;
}

export async function DELETE(request: Request, context: { params: Promise<{ slug: string; shareId: string }> }) {
  const { slug, shareId } = await context.params;
  const sql = await openHandoffDb();
  await migrate(sql);
  const caller = await getCaller(sql, cookieValue(request, SESSION_COOKIE), Date.now());
  const workspaceId = await resolveWorkspaceRouteId(sql, slug);
  if (!workspaceId) return Response.json({ error: "missing" }, { status: 404 });
  const denied = await gate(sql, caller, workspaceId);
  if (denied) return denied;
  const revoked = await revokeViewLink(sql, caller, workspaceId, shareId, Date.now());
  if (!revoked.ok) return Response.json({ error: "missing" }, { status: revoked.error === "missing" ? 404 : 403 });
  await recordLibraryMetric(sql, {
    name: "view_link_revoked",
    organizationId: revoked.organizationId,
    workspaceId,
    actorKind: caller.staff ? "staff" : "system",
    actorId: caller.userId,
  });
  return Response.json({ ok: true });
}

export async function PATCH(request: Request, context: { params: Promise<{ slug: string; shareId: string }> }) {
  const { slug, shareId } = await context.params;
  const sql = await openHandoffDb();
  await migrate(sql);
  const caller = await getCaller(sql, cookieValue(request, SESSION_COOKIE), Date.now());
  const workspaceId = await resolveWorkspaceRouteId(sql, slug);
  if (!workspaceId) return Response.json({ error: "missing" }, { status: 404 });
  const denied = await gate(sql, caller, workspaceId);
  if (denied) return denied;
  const updated = await refreshViewLink(sql, caller, workspaceId, shareId, Date.now());
  if (!updated.ok) return Response.json({ error: "missing" }, { status: updated.error === "missing" ? 404 : 403 });
  if (updated.updated) {
    await recordLibraryMetric(sql, {
      name: "view_link_updated",
      organizationId: updated.organizationId,
      workspaceId,
      actorKind: caller.staff ? "staff" : "system",
      actorId: caller.userId,
    });
  }
  return Response.json({ updated: updated.updated });
}
