import type { Sql } from "@/db/sql";
import type { Caller } from "./authz";
import { assignmentFor, type AgentPrincipal } from "./agent-work-filing";
import { clientRefFrom } from "./agent-contacts";
import { selectLibraryFile, revokeLibraryFile } from "./artifact-metadata";
import { setPieceShelf, SHELF_INVALID, SHELF_LIVE, SHELF_MISSING } from "./finished-shelf";
import type { LibraryArtifact } from "./library-artifacts";
import { listLibraryArtifacts } from "./library-queries";
import { createViewLink, revokeViewLink } from "./library-shares";
import { resolveAgentClient, type SocialQueryError } from "./social-queries";

export type AgentLibraryError = {
  ok: false;
  status: 400 | 403 | 404 | 409;
  reasonCode: string;
  message: string;
};

export type AgentLibraryCard = {
  type: string;
  title: string;
  status: string;
  piecePath: string | null;
  previewPath: string | null;
  publicUrl: string | null;
  itemId: string | null;
  deliverableId: string | null;
};

function fail(status: AgentLibraryError["status"], reasonCode: string, message: string): AgentLibraryError {
  return { ok: false, status, reasonCode, message };
}

function clientArg(client: unknown): unknown {
  return typeof client === "string" ? clientRefFrom(client) : client;
}

/** Sees the space as the client does. View links are allowed for an owner. */
function clientCaller(agentId: string, workspaceId: string): Caller {
  return {
    userId: agentId,
    staff: null,
    operatorOf: [],
    memberships: [{ workspaceId, role: "client_owner" }],
  };
}

/** Staff chores that require an operator: choosing a file, and the shelf actor. */
function deskCaller(agentId: string, workspaceId: string): Caller {
  return {
    userId: agentId,
    staff: null,
    operatorOf: [workspaceId],
    memberships: [{ workspaceId, role: "client_owner" }],
  };
}

function publicUrl(artifact: LibraryArtifact): string | null {
  const posted = artifact.destinations.find((destination) => destination.url)?.url;
  if (posted) return posted;
  if (artifact.canonical?.url) return artifact.canonical.url;
  const action = artifact.actions.find((item) => item.kind === "open_post" && item.href?.startsWith("http"));
  return action?.href ?? null;
}

async function spaceFor(sql: Sql, agent: AgentPrincipal, client: unknown): Promise<{ ok: true; organizationId: string; workspaceId: string; slug: string; role: "lead" | "hire" } | AgentLibraryError | SocialQueryError> {
  const resolved = await resolveAgentClient(sql, agent, clientArg(client));
  if (!resolved.ok) return resolved;
  const assignment = assignmentFor(agent, resolved.organizationId);
  const workspaceId = assignment?.workspaceId ?? null;
  if (!workspaceId) return fail(404, "not_found", "That client has no space.");
  const space = await sql.get<{ id: string; slug: string; organization_id: string | null }>(
    "SELECT id, slug, organization_id FROM workspaces WHERE id = ? AND status = 'active'",
    [workspaceId],
  );
  if (!space || space.organization_id !== resolved.organizationId) return fail(404, "not_found", "That client has no space.");
  return { ok: true, organizationId: resolved.organizationId, workspaceId: space.id, slug: space.slug, role: assignment?.role ?? "hire" };
}

/** The same Library the client sees, for the assignment's space. */
export async function listAgentLibrary(
  sql: Sql,
  agent: AgentPrincipal,
  input: { client: unknown; removed: boolean },
): Promise<{ ok: true; artifacts: AgentLibraryCard[] } | AgentLibraryError | SocialQueryError> {
  const space = await spaceFor(sql, agent, input.client);
  if (!space.ok) return space;
  const page = await listLibraryArtifacts(sql, clientCaller(agent.agentId, space.workspaceId), {
    workspaceId: space.workspaceId,
    slug: space.slug,
    removed: input.removed,
  });
  if (!page.ok) return fail(404, "not_found", "That Library is not here.");
  const itemIds = page.page.artifacts.filter((artifact) => artifact.sourceKind === "deliverable_item").map((artifact) => artifact.sourceId);
  const parents = itemIds.length
    ? await sql.all<{ id: string; deliverable_id: string }>(
        `SELECT id, deliverable_id FROM deliverable_items WHERE id IN (${itemIds.map(() => "?").join(", ")})`,
        itemIds,
      )
    : [];
  const deliverableByItem = new Map(parents.map((row) => [row.id, row.deliverable_id]));
  return {
    ok: true,
    artifacts: page.page.artifacts.map((artifact) => ({
      type: artifact.artifactType,
      title: artifact.title,
      status: artifact.primaryStatus,
      piecePath: artifact.actions.find((action) => action.href?.includes("?item="))?.href ?? null,
      previewPath: artifact.previewSrc,
      publicUrl: publicUrl(artifact),
      itemId: artifact.sourceKind === "deliverable_item" ? artifact.sourceId : null,
      deliverableId: artifact.sourceKind === "deliverable_item" ? deliverableByItem.get(artifact.sourceId) ?? null : null,
    })),
  };
}

async function pieceInClient(sql: Sql, organizationId: string, itemId: string, version: number) {
  return sql.get<{ deliverable_id: string; workspace_id: string; removed_at: number | null }>(
    `SELECT i.deliverable_id, d.workspace_id, i.removed_at
     FROM deliverable_items i JOIN deliverables d ON d.id = i.deliverable_id
     WHERE i.id = ? AND i.version = ? AND d.organization_id = ?`,
    [itemId, version, organizationId],
  );
}

async function filingHeld(sql: Sql, itemId: string, version: number): Promise<boolean> {
  const row = await sql.get<{ held: number }>(
    `SELECT 1 AS held FROM deliverable_items i
     JOIN agent_work_items w ON w.id = i.work_item_id
     JOIN batches b ON b.id = w.batch_id
     WHERE i.id = ? AND i.version = ?
       AND w.state = 'filed' AND w.released_at IS NULL AND w.retracted_at IS NULL AND w.superseded_by IS NULL
       AND b.held_at IS NOT NULL AND b.released_at IS NULL AND b.discarded_at IS NULL AND b.deleted_at IS NULL`,
    [itemId, version],
  );
  return Boolean(row);
}

/** The same remove and restore the button uses. A hire may do it only while the filing is held. */
export async function setAgentShelf(
  sql: Sql,
  agent: AgentPrincipal,
  input: { client: unknown; itemId: string; version: number; removed: boolean },
  now: number,
): Promise<{ ok: true } | AgentLibraryError | SocialQueryError> {
  const space = await spaceFor(sql, agent, input.client);
  if (!space.ok) return space;
  const piece = await pieceInClient(sql, space.organizationId, input.itemId, input.version);
  if (!piece || piece.workspace_id !== space.workspaceId) return fail(404, "not_found", "That piece is not here.");
  if (space.role !== "lead" && !(await filingHeld(sql, input.itemId, input.version))) {
    return fail(403, "forbidden", "A hire can remove a piece only while the filing is still held.");
  }
  const done = await setPieceShelf(
    sql,
    deskCaller(agent.agentId, space.workspaceId),
    { deliverableId: piece.deliverable_id, itemId: input.itemId, version: input.version, removed: input.removed },
    now,
    { kind: "agent", id: agent.agentId, workspaceId: space.workspaceId },
  );
  if (done.ok) return { ok: true };
  if (done.error.startsWith(SHELF_LIVE)) return fail(409, "SHELF_LIVE", done.error);
  if (done.error === SHELF_INVALID) return fail(400, "invalid", done.error);
  if (done.error === SHELF_MISSING) return fail(404, "not_found", done.error);
  return fail(400, "invalid", done.error);
}

/** Show or hide a clean file on the Library. The bytes stay. */
export async function setAgentFile(
  sql: Sql,
  agent: AgentPrincipal,
  input: { client: unknown; fileId: string; selected: boolean },
  now: number,
): Promise<{ ok: true } | AgentLibraryError | SocialQueryError> {
  const space = await spaceFor(sql, agent, input.client);
  if (!space.ok) return space;
  const file = await sql.get<{ id: string; workspace_id: string; organization_id: string | null }>(
    `SELECT f.id, f.workspace_id, w.organization_id
     FROM files f JOIN workspaces w ON w.id = f.workspace_id WHERE f.id = ?`,
    [input.fileId],
  );
  if (!file || file.organization_id !== space.organizationId || file.workspace_id !== space.workspaceId) {
    return fail(404, "not_found", "That file is not here.");
  }
  const caller = deskCaller(agent.agentId, space.workspaceId);
  const done = input.selected
    ? await selectLibraryFile(sql, caller, input.fileId, now)
    : await revokeLibraryFile(sql, caller, input.fileId, now);
  if (done.ok) return { ok: true };
  if (done.error === "invalid") return fail(400, "invalid", "That file is not ready for the Library.");
  return fail(404, "not_found", "That file is not here.");
}

/** A lead can open or close a read-only view link for published pieces. */
export async function setAgentShare(
  sql: Sql,
  agent: AgentPrincipal,
  input: { client: unknown; action: "create" | "revoke"; itemIds: string[]; shareId: string | null },
  now: number,
  origin: string,
): Promise<{ ok: true; id?: string; url?: string } | AgentLibraryError | SocialQueryError> {
  const space = await spaceFor(sql, agent, input.client);
  if (!space.ok) return space;
  if (space.role !== "lead") return fail(403, "forbidden", "Only the lead can share the Library.");
  const caller = clientCaller(agent.agentId, space.workspaceId);
  if (input.action === "revoke") {
    if (!input.shareId) return fail(400, "invalid_body", "Name the view link.");
    const share = await sql.get<{ id: string }>(
      "SELECT id FROM library_shares WHERE id = ? AND workspace_id = ?",
      [input.shareId, space.workspaceId],
    );
    if (!share) return fail(404, "not_found", "That view link is not here.");
    const revoked = await revokeViewLink(sql, caller, space.workspaceId, input.shareId, now);
    if (!revoked.ok) return fail(404, "not_found", "That view link is not here.");
    return { ok: true, id: input.shareId };
  }
  if (input.itemIds.length === 0) return fail(400, "invalid_body", "Name the pieces to share.");
  const rows = await sql.all<{ id: string; version: number }>(
    `SELECT i.id, i.version
     FROM deliverable_items i JOIN deliverables d ON d.id = i.deliverable_id
     WHERE d.organization_id = ? AND d.workspace_id = ? AND d.published_version IS NOT NULL
       AND i.version = d.published_version AND i.removed_at IS NULL
       AND i.id IN (${input.itemIds.map(() => "?").join(", ")})`,
    [space.organizationId, space.workspaceId, ...input.itemIds],
  );
  if (rows.length !== input.itemIds.length) return fail(404, "not_found", "That piece is not here.");
  const created = await createViewLink(sql, caller, {
    workspaceId: space.workspaceId,
    items: rows.map((row) => ({ resourceKind: "deliverable_item" as const, resourceId: row.id, resourceVersion: row.version })),
  }, now, origin);
  if (!created.ok) {
    if (created.error === "disabled") return fail(403, "disabled", "View links are off.");
    return fail(404, "not_found", "That piece is not here.");
  }
  return { ok: true, id: created.id, url: created.url };
}
