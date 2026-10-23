import type { Sql, SqlStatement } from "@/db/sql";
import type { SocialWriteResult } from "@/app/api/agent-social/http";
import { clientRefFrom } from "./agent-contacts";
import { AGENT_SOCIAL_LIMITS } from "./agent-social-limits";
import type { AgentPrincipal } from "./agent-work-filing";
import { libraryEligibleSql } from "./project-library";
import { pieceMedia } from "./social-plan";
import { getAutopost } from "./social-autopost";
import { evaluateSocialPolicy } from "./social-policy";
import { resolveAgentClient, socialAgentActionsEnabled } from "./social-queries";

/**
 * Agent approval of ONE social piece (POST /api/agent-social/items/<id>/approve and /unapprove).
 *
 * This is the same item-level approval a staff member or the client gives on the deliverable page (status pending ->
 * approved on the published version), made available to an authorized agent: a client lead agent (policy mode
 * schedule_approved or managed) or a hire that staff granted can_approve. It changes one deliverable_items row and
 * nothing else. It does NOT approve siblings or the deliverable, and it does NOT call autoScheduleApproved: scheduling or
 * posting stays a separate explicit plan step (POST /api/agent-social/plans).
 */

const LIVE_POST = ["sending", "scheduled", "published", "partial"];
const NOT_SOCIAL_KINDS = new Set(["brief", "design_system"]);

type Decision = "approve" | "unapprove";

type Row = {
  id: string;
  deliverable_id: string;
  version: number;
  format: string;
  title: string;
  status: string;
  media_json: string;
  removed_at: number | null;
  d_status: string;
  d_kind: string;
  d_version: number;
  published_version: number | null;
  project_id: string | null;
  workspace_id: string | null;
};

function fail(status: number, reasonCode: string, message: string, extra?: Record<string, unknown>): SocialWriteResult {
  return { ok: false, status, reasonCode, message, ...(extra ? { extra } : {}) };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** A page or link is never a social piece. A file counts only when it carries a picture or a clip to post (a PDF does not). */
function isPostablePiece(row: Pick<Row, "format" | "media_json">): boolean {
  if (row.format === "page" || row.format === "link") return false;
  if (row.format !== "file") return true;
  return pieceMedia(row.media_json).items.some((item) => item.kind === "video" || item.kind === "image" || item.kind === "gif");
}

function deliverableStatusFor(items: { status: string }[]): "changes_requested" | "approved" | "in_review" {
  if (items.some((item) => item.status === "changes_requested")) return "changes_requested";
  if (items.length > 0 && items.every((item) => item.status === "approved")) return "approved";
  return "in_review";
}

export async function agentSetSocialItemApproval(
  sql: Sql,
  agent: AgentPrincipal,
  itemId: string,
  body: Record<string, unknown>,
  decision: Decision,
  now: number,
): Promise<SocialWriteResult> {
  if (!socialAgentActionsEnabled()) return fail(403, "feature_disabled", "Agent social actions are off.");
  const externalId = text(body.external_id ?? body.externalId);
  if (!externalId) return fail(400, "external_id_required", "An external id is required.");
  const resolved = await resolveAgentClient(sql, agent, clientRefFrom(body.client));
  if (!resolved.ok) return fail(resolved.status, resolved.reasonCode, resolved.message);
  const standing = evaluateSocialPolicy(resolved.actor, "approve_piece");
  if (standing.authorization === "denied") return fail(403, standing.reasonCode, "That is not allowed for this agent on this client.");

  const hourAgo = now - 60 * 60 * 1000;
  const recent = await sql.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM activities
     WHERE organization_id = ? AND actor_kind = 'agent' AND actor_id = ? AND kind IN ('social.item.approved', 'social.item.unapproved') AND created_at > ?`,
    [resolved.organizationId, agent.agentId, hourAgo],
  );
  if ((recent?.n ?? 0) >= AGENT_SOCIAL_LIMITS.approvalsPerHour) {
    return fail(429, "rate_limited", "Too many approvals. Try again later.", { retryAfterSeconds: 3600 });
  }

  const row = await sql.get<Row>(
    `SELECT i.id, i.deliverable_id, i.version, i.format, i.title, i.status, i.media_json, i.removed_at,
            d.status AS d_status, d.kind AS d_kind, d.version AS d_version, d.published_version, d.project_id, d.workspace_id
     FROM deliverable_items i JOIN deliverables d ON d.id = i.deliverable_id
     WHERE i.id = ? AND d.organization_id = ?`,
    [itemId, resolved.organizationId],
  );
  if (!row) return fail(404, "not_found", "That piece is not on this client.");
  const claimedDeliverable = text(body.deliverable_id ?? body.deliverableId);
  if (claimedDeliverable && claimedDeliverable !== row.deliverable_id) {
    return fail(409, "deliverable_mismatch", "That piece does not belong to that deliverable.");
  }
  if (row.published_version == null || row.version !== row.published_version) {
    return fail(409, "stale_version", "Only a piece at the deliverable's published version can be approved.");
  }
  if (row.removed_at != null) return fail(409, "piece_removed", "That piece was removed from the shelf.");
  if (NOT_SOCIAL_KINDS.has(row.d_kind) || !isPostablePiece(row)) return fail(409, "not_social_piece", "That piece is not a social piece.");
  if (row.d_status !== "in_review" && row.d_status !== "approved") {
    return fail(409, "deliverable_not_reviewable", "That deliverable is not in review.");
  }
  const eligible = await sql.get<{ id: string }>(
    `SELECT d.id FROM deliverables d WHERE d.id = ? AND ${libraryEligibleSql("d.project_id", "d.workspace_id")}`,
    [row.deliverable_id],
  );
  if (!eligible) return fail(409, "project_excluded", "That project is not part of the Library.");

  const target = decision === "approve" ? "approved" : "pending";
  const view = (changed: boolean, status: string, deliverableStatus: string, warnings: string[] = []): SocialWriteResult => ({
    ok: true,
    status: 200,
    body: {
      itemId: row.id,
      deliverableId: row.deliverable_id,
      version: row.version,
      format: row.format,
      status,
      deliverableStatus,
      changed,
      approvedBy: decision === "approve" && status === "approved" ? `agent:${agent.agentId}` : undefined,
      scheduled: false,
      note: "Nothing is scheduled or posted. Prepare a schedule plan next (POST /api/agent-social/plans).",
      warnings,
    },
  });

  if (row.status === target) return view(false, row.status, row.d_status);
  if (decision === "approve" && row.status === "changes_requested") {
    return fail(409, "changes_requested", "Changes were requested on that piece. Staff or the client must clear that first.");
  }
  if (decision === "unapprove" && row.status !== "approved") return view(false, row.status, row.d_status);
  if (decision === "unapprove") {
    const live = await sql.get<{ id: string }>(
      `SELECT id FROM social_posts WHERE item_id = ? AND version = ? AND status IN (${LIVE_POST.map(() => "?").join(", ")}) LIMIT 1`,
      [row.id, row.version, ...LIVE_POST],
    );
    if (live) return fail(409, "post_scheduled", "That piece is already scheduled or posted. Ask staff to change it with a card.");
  }

  const siblings = await sql.all<{ id: string; status: string }>(
    "SELECT id, status FROM deliverable_items WHERE deliverable_id = ? AND version = ? AND removed_at IS NULL",
    [row.deliverable_id, row.version],
  );
  const nextDeliverable = deliverableStatusFor(siblings.map((item) => ({ status: item.id === row.id ? target : item.status })));
  const writes: SqlStatement[] = [
    {
      statement: "UPDATE deliverable_items SET status = ? WHERE id = ? AND deliverable_id = ? AND version = ? AND status = ? AND removed_at IS NULL",
      params: [target, row.id, row.deliverable_id, row.version, row.status],
    },
  ];
  // Same rule as a staff or client item approval: the deliverable's status follows its items. Only a newer working version is left alone.
  if (row.d_version === row.published_version && nextDeliverable !== row.d_status) {
    writes.push({ statement: "UPDATE deliverables SET status = ?, updated_at = ? WHERE id = ?", params: [nextDeliverable, now, row.deliverable_id] });
  }
  const reason = text(body.reason ?? body.note);
  writes.push({
    statement: `INSERT INTO activities (id, organization_id, project_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at)
                VALUES (?, ?, ?, ?, ?, 'agent', ?, ?, ?, ?)`,
    params: [
      crypto.randomUUID(),
      resolved.organizationId,
      row.project_id,
      row.workspace_id,
      decision === "approve" ? "social.item.approved" : "social.item.unapproved",
      agent.agentId,
      `${decision === "approve" ? "Agent approved" : "Agent un-approved"} the social piece "${row.title}"${reason ? `: ${reason.slice(0, 300)}` : "."}`,
      JSON.stringify({
        item_id: row.id,
        deliverable_id: row.deliverable_id,
        version: row.version,
        title: row.title,
        format: row.format,
        previous_status: row.status,
        status: target,
        deliverable_status: nextDeliverable,
        agent_id: agent.agentId,
        role: resolved.actor.kind === "agent" ? resolved.actor.role : null,
        external_id: externalId,
        reason,
        auto_scheduled: false,
      }),
      now,
    ],
  });
  await sql.batch(writes);

  const warnings: string[] = [];
  const autopost = await getAutopost(sql, resolved.organizationId);
  if (decision === "approve" && autopost.enabled) {
    warnings.push(
      "Auto-post is on for this client. This approval did not schedule anything, but a later whole-deliverable approval by staff or the client would place every approved piece of the deliverable in the next open slot.",
    );
  }
  return view(true, target, row.d_version === row.published_version ? nextDeliverable : row.d_status, warnings);
}
