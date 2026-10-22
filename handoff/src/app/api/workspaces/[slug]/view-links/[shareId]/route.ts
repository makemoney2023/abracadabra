import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { can, type Caller } from "@/lib/authz";
import type { Sql } from "@/db/sql";
import { cookieValue } from "@/lib/downloads";
import { revokeViewLink } from "@/lib/library-shares";
import { getCaller, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

async function gate(sql: Sql, caller: Caller, workspaceId: string): Promise<Response | null> {
  const workspace = await sql.get<{ id: string }>("SELECT id FROM workspaces WHERE id = ?", [workspaceId]);
  if (!workspace || !can(caller, "workspace.view", { workspaceId })) return Response.json({ error: "missing" }, { status: 404 });
  if (!can(caller, "view_link.manage", { workspaceId })) return Response.json({ error: "forbidden" }, { status: 403 });
  return null;
}

export async function DELETE(request: Request, context: { params: Promise<{ slug: string; shareId: string }> }) {
  const { slug: workspaceId, shareId } = await context.params;
  const sql = await openHandoffDb();
  await migrate(sql);
  const caller = await getCaller(sql, cookieValue(request, SESSION_COOKIE), Date.now());
  const denied = await gate(sql, caller, workspaceId);
  if (denied) return denied;
  const revoked = await revokeViewLink(sql, caller, workspaceId, shareId, Date.now());
  if (!revoked.ok) return Response.json({ error: "missing" }, { status: revoked.error === "missing" ? 404 : 403 });
  return Response.json({ ok: true });
}
