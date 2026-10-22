import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { can, type Caller } from "@/lib/authz";
import type { Sql } from "@/db/sql";
import { cookieValue } from "@/lib/downloads";
import { recordLibraryMetric } from "@/lib/library-metrics";
import { createViewLink, libraryViewLinksEnabled, listViewLinks } from "@/lib/library-shares";
import { getCaller, SESSION_COOKIE } from "@/lib/session";
import { resolveWorkspaceRouteId } from "@/lib/workspace-route";

export const dynamic = "force-dynamic";

type ItemBody = { resourceKind?: string; resourceId?: string; resourceVersion?: number };
type ViewKind = "deliverable_item" | "built_work" | "file";

function viewKind(value: string | undefined): value is ViewKind {
  return value === "deliverable_item" || value === "built_work" || value === "file";
}

async function session(request: Request): Promise<{ sql: Sql; caller: Caller }> {
  const sql = await openHandoffDb();
  await migrate(sql);
  const caller = await getCaller(sql, cookieValue(request, SESSION_COOKIE), Date.now());
  return { sql, caller };
}

async function gate(sql: Sql, caller: Caller, workspaceId: string): Promise<Response | null> {
  if (!can(caller, "workspace.view", { workspaceId })) return Response.json({ error: "missing" }, { status: 404 });
  if (!can(caller, "view_link.manage", { workspaceId })) return Response.json({ error: "forbidden" }, { status: 403 });
  return null;
}

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const { sql, caller } = await session(request);
  const workspaceId = await resolveWorkspaceRouteId(sql, slug);
  if (!workspaceId) return Response.json({ error: "missing" }, { status: 404 });
  const denied = await gate(sql, caller, workspaceId);
  if (denied) return denied;
  const listed = await listViewLinks(sql, caller, workspaceId);
  if (!listed.ok) return Response.json({ error: "forbidden" }, { status: 403 });
  return Response.json({ shares: listed.shares });
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const { sql, caller } = await session(request);
  const workspaceId = await resolveWorkspaceRouteId(sql, slug);
  if (!workspaceId) return Response.json({ error: "missing" }, { status: 404 });
  const denied = await gate(sql, caller, workspaceId);
  if (denied) return denied;
  if (!libraryViewLinksEnabled()) return Response.json({ error: "disabled" }, { status: 404 });
  let body: {
    title?: unknown;
    expiresAt?: unknown;
    passcode?: unknown;
    allowDownloads?: unknown;
    showExternalLinks?: unknown;
    items?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const items: { resourceKind: "deliverable_item" | "built_work" | "file"; resourceId: string; resourceVersion: number }[] = [];
  if (Array.isArray(body.items)) {
    for (const item of body.items) {
      const row = item as ItemBody;
      if (!viewKind(row.resourceKind) || typeof row.resourceId !== "string" || typeof row.resourceVersion !== "number") continue;
      items.push({ resourceKind: row.resourceKind, resourceId: row.resourceId, resourceVersion: row.resourceVersion });
    }
  }
  const created = await createViewLink(sql, caller, {
    workspaceId,
    title: typeof body.title === "string" ? body.title : null,
    expiresAt: typeof body.expiresAt === "number" ? body.expiresAt : null,
    passcode: typeof body.passcode === "string" ? body.passcode : null,
    allowDownloads: body.allowDownloads === true,
    showExternalLinks: body.showExternalLinks !== false,
    items,
  }, Date.now(), new URL(request.url).origin);
  if (!created.ok) return Response.json({ error: "missing" }, { status: created.error === "invalid" || created.error === "missing" ? 404 : 403 });
  const organization = await sql.get<{ organization_id: string }>("SELECT organization_id FROM workspaces WHERE id = ?", [workspaceId]);
  if (organization?.organization_id) {
    await recordLibraryMetric(sql, {
      name: "view_link_created",
      workspaceId,
      organizationId: organization.organization_id,
      actorKind: caller.staff ? "staff" : "system",
      actorId: caller.userId,
    });
  }
  return Response.json({ url: created.url, id: created.id }, { status: 201 });
}
