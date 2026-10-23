import type { Sql } from "@/db/sql";
import { assignmentFor, resolveClientRef, type AgentPrincipal } from "./agent-work-filing";
import { clientRefFrom } from "./agent-contacts";
import { getAutopost, nextSlots } from "./social-autopost";
import { agentActor } from "./social-actor";
import { evaluateSocialPolicy, type AgentPublishMode, type SocialActor, type SocialCapability } from "./social-policy";
import { defaultPostType, pieceMedia, type MediaKind } from "./social-plan";
import { libraryHref } from "@/components/library/library-view";
import { shelfNote } from "./finished-shelf";
import { isEligibleSocialPlatform } from "./zernio";
import type { ItemFormat } from "./deliverable-manifest";
import { libraryEligibleSql } from "./project-library";

const LIVE = ["sending", "scheduled", "published", "partial"];

export type SocialQueryError = {
  ok: false;
  status: 400 | 403 | 404;
  reasonCode: string;
  message: string;
};

export type AccountHealth = {
  id: string;
  platform: string;
  username: string | null;
  displayName: string | null;
  active: boolean;
};

export type PieceView = {
  deliverableId: string;
  itemId: string;
  version: number;
  title: string;
  format: string;
  approved: boolean;
  postType: string;
  state: string;
  media: { count: number; kinds: MediaKind[]; keys: string[] };
};

type PolicyRow = { mode: string; capabilities_json: string };

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

/** Agent writes stay off until SOCIAL_AGENT_ACTIONS is 1, true, or on. Reads stay available. */
export function socialAgentActionsEnabled(): boolean {
  const fromProcess = (process.env.SOCIAL_AGENT_ACTIONS ?? "").trim();
  const holder = globalThis as typeof globalThis & {
    [CLOUDFLARE_CONTEXT]?: { env?: { SOCIAL_AGENT_ACTIONS?: unknown } };
  };
  const bound = holder[CLOUDFLARE_CONTEXT]?.env?.SOCIAL_AGENT_ACTIONS;
  const value = (fromProcess || (typeof bound === "string" ? bound.trim() : "")).toLowerCase();
  return value === "1" || value === "true" || value === "on";
}

function fail(status: SocialQueryError["status"], reasonCode: string, message: string): SocialQueryError {
  return { ok: false, status, reasonCode, message };
}

async function loadPolicy(sql: Sql, organizationId: string): Promise<{ mode: AgentPublishMode; grant: SocialCapability[]; revoke: SocialCapability[] }> {
  const row = await sql.get<PolicyRow>("SELECT mode, capabilities_json FROM social_agent_policies WHERE organization_id = ?", [
    organizationId,
  ]);
  const mode = row?.mode === "observe" || row?.mode === "draft" || row?.mode === "schedule_approved" || row?.mode === "managed" ? row.mode : "draft";
  let grant: SocialCapability[] = [];
  let revoke: SocialCapability[] = [];
  try {
    const parsed = JSON.parse(row?.capabilities_json ?? "{}") as { grant?: unknown; revoke?: unknown };
    if (Array.isArray(parsed.grant)) grant = parsed.grant.filter((item): item is SocialCapability => typeof item === "string");
    if (Array.isArray(parsed.revoke)) revoke = parsed.revoke.filter((item): item is SocialCapability => typeof item === "string");
  } catch {
    grant = [];
    revoke = [];
  }
  return { mode, grant, revoke };
}

export async function resolveAgentClient(
  sql: Sql,
  agent: AgentPrincipal,
  client: unknown,
): Promise<{ ok: true; organizationId: string; actor: SocialActor } | SocialQueryError> {
  let organizationId: string;
  if (client) {
    const ref = await resolveClientRef(sql, client);
    if (!ref.ok) return fail(ref.status === 404 ? 404 : 400, "unknown_client", ref.message);
    organizationId = ref.organizationId;
  } else if (agent.assignments.length === 1) {
    organizationId = agent.assignments[0].organizationId;
  } else {
    return fail(400, "client_required", "Name the client (org id, domain, or space slug).");
  }
  const assignment = assignmentFor(agent, organizationId);
  if (!assignment) return fail(403, "not_assigned", "This agent is not assigned to that client.");
  const policy = await loadPolicy(sql, organizationId);
  return {
    ok: true,
    organizationId,
    actor: agentActor({ agentId: agent.agentId, assignment, mode: policy.mode, grant: policy.grant, revoke: policy.revoke }),
  };
}

function clientArg(client: unknown): unknown {
  return typeof client === "string" ? clientRefFrom(client) : client;
}

function mediaSummary(mediaJson: string): PieceView["media"] {
  const media = pieceMedia(mediaJson);
  const keys = media.items.map((item) => item.key);
  if (media.poster && !keys.includes(media.poster.key)) keys.push(media.poster.key);
  const kinds = [...new Set(media.items.map((item) => item.kind))];
  return { count: media.items.length, kinds, keys };
}

type ItemRow = {
  id: string;
  deliverable_id: string;
  version: number;
  title: string;
  format: ItemFormat;
  status: string;
  media_json: string;
  published_version: number | null;
  removed_at: number | null;
};

type PostRow = {
  id: string;
  deliverable_id: string;
  item_id: string;
  version: number;
  status: string;
  post_type: string;
  mode: string;
  scheduled_for: number | null;
  created_at: number;
  account_ids: string;
};

async function currentPieces(sql: Sql, organizationId: string): Promise<ItemRow[]> {
  return sql.all<ItemRow>(
    `SELECT i.id, i.deliverable_id, i.version, i.title, i.format, i.status, i.media_json,
            d.published_version AS published_version, i.removed_at AS removed_at
     FROM deliverable_items i
     JOIN deliverables d ON d.id = i.deliverable_id
     WHERE d.organization_id = ? AND i.version = COALESCE(d.published_version, d.version)
       AND i.format NOT IN ('page', 'link', 'file')
       AND ${libraryEligibleSql("d.project_id", "d.workspace_id")}
     ORDER BY i.sort, i.id`,
    [organizationId],
  );
}

async function orgPosts(sql: Sql, organizationId: string): Promise<PostRow[]> {
  return sql.all<PostRow>(
    `SELECT id, deliverable_id, item_id, version, status, post_type, mode, scheduled_for, created_at, account_ids
     FROM social_posts WHERE organization_id = ?`,
    [organizationId],
  );
}

function pieceState(item: ItemRow, posts: PostRow[], attentionIds: Set<string>): string {
  if (item.published_version == null) return "held";
  if (item.removed_at != null) return "removed";
  if (attentionIds.has(item.id) || attentionIds.has(`${item.id}:${item.version}`)) return "attention";
  if (item.status === "changes_requested") return "changes";
  if (item.status !== "approved") return "review";
  const live = posts.filter((post) => post.item_id === item.id && post.version === item.version);
  if (live.some((post) => post.status === "failed")) return "attention";
  if (live.some((post) => post.status === "published" || post.status === "partial")) return "published";
  if (live.some((post) => post.status === "scheduled" || post.status === "sending")) return "scheduled";
  return "ready";
}

export async function socialOverview(sql: Sql, agent: AgentPrincipal, client: unknown, now: number) {
  const resolved = await resolveAgentClient(sql, agent, clientArg(client));
  if (!resolved.ok) return resolved;
  const [accounts, pieces, posts, attention, cadence] = await Promise.all([
    sql.all<{ id: string; platform: string; username: string | null; display_name: string | null; is_active: number }>(
      `SELECT id, platform, username, display_name, is_active FROM social_accounts
       WHERE organization_id = ? ORDER BY platform, username`,
      [resolved.organizationId],
    ),
    currentPieces(sql, resolved.organizationId),
    orgPosts(sql, resolved.organizationId),
    sql.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM social_attention_items WHERE organization_id = ? AND status = 'open'",
      [resolved.organizationId],
    ),
    getAutopost(sql, resolved.organizationId),
  ]);
  const taken = posts.flatMap((post) => (post.scheduled_for == null ? [] : [post.scheduled_for]));
  const liveIds = new Set(
    posts.filter((post) => LIVE.includes(post.status)).map((post) => post.item_id),
  );
  const onShelf = pieces.filter((item) => item.published_version != null && item.removed_at == null);
  const needsALook = onShelf.filter((item) => item.status === "pending" || item.status === "changes_requested").length;
  const approvedNotScheduled = onShelf.filter((item) => item.status === "approved" && !liveIds.has(item.id)).length;
  const readyCount = approvedNotScheduled;
  const policy = evaluateSocialPolicy(resolved.actor, "read");
  const mode = resolved.actor.kind === "agent" ? resolved.actor.mode : "draft";
  const assignment = assignmentFor(agent, resolved.organizationId);
  const space = assignment?.workspaceId
    ? await sql.get<{ slug: string }>("SELECT slug FROM workspaces WHERE id = ?", [assignment.workspaceId])
    : await sql.get<{ slug: string }>("SELECT slug FROM workspaces WHERE organization_id = ? ORDER BY opened_at LIMIT 1", [resolved.organizationId]);
  const slug = space?.slug ?? "";
  const look = shelfNote("waiting", needsALook);
  const approved = shelfNote("ready", approvedNotScheduled);
  return {
    ok: true as const,
    organizationId: resolved.organizationId,
    policy: { mode, authorization: policy.authorization, reasonCode: policy.reasonCode, capabilities: policy.capabilities },
    needsALook,
    approvedNotScheduled,
    needsALookText: look.text,
    approvedNotScheduledText: approved.text,
    library: {
      needsALook: slug ? libraryHref(slug, { status: look.status }) : null,
      approvedNotScheduled: slug ? libraryHref(slug, { status: approved.status }) : null,
    },
    accountHealth: accounts
      .filter((row) => isEligibleSocialPlatform(row.platform))
      .map((row) => ({
        id: row.id,
        platform: row.platform,
        username: row.username,
        displayName: row.display_name,
        active: row.is_active === 1,
      })),
    readyCount,
    scheduledCount: posts.filter((post) => post.status === "scheduled").length,
    attentionCount: attention?.count ?? 0,
    nextSlots: nextSlots(cadence, taken, now, 3),
  };
}

export async function listAgentSocialAccounts(sql: Sql, agent: AgentPrincipal, client: unknown) {
  const resolved = await resolveAgentClient(sql, agent, clientArg(client));
  if (!resolved.ok) return resolved;
  const rows = await sql.all<{ id: string; platform: string; username: string | null; display_name: string | null; is_active: number }>(
    `SELECT id, platform, username, display_name, is_active FROM social_accounts
     WHERE organization_id = ? AND is_active = 1 ORDER BY platform, username`,
    [resolved.organizationId],
  );
  return {
    ok: true as const,
    accounts: rows
      .filter((row) => isEligibleSocialPlatform(row.platform))
      .map((row) => ({
        id: row.id,
        platform: row.platform,
        username: row.username,
        displayName: row.display_name,
        active: true,
      })),
  };
}

export async function listAgentSocialPieces(
  sql: Sql,
  agent: AgentPrincipal,
  filter: { client: unknown; deliverableId?: string | null; state?: string | null },
  now: number,
) {
  void now;
  const resolved = await resolveAgentClient(sql, agent, clientArg(filter.client));
  if (!resolved.ok) return resolved;
  const [items, posts, attention] = await Promise.all([
    currentPieces(sql, resolved.organizationId),
    orgPosts(sql, resolved.organizationId),
    sql.all<{ source_id: string; target: string }>(
      "SELECT source_id, target FROM social_attention_items WHERE organization_id = ? AND status = 'open'",
      [resolved.organizationId],
    ),
  ]);
  const attentionIds = new Set(attention.flatMap((row) => [row.source_id, row.target]));
  let pieces: PieceView[] = items.map((item) => ({
    deliverableId: item.deliverable_id,
    itemId: item.id,
    version: item.version,
    title: item.title,
    format: item.format,
    approved: item.status === "approved",
    postType: defaultPostType(item.format, pieceMedia(item.media_json)),
    state: pieceState(item, posts, attentionIds),
    media: mediaSummary(item.media_json),
  }));
  const wantRemoved = filter.state === "removed";
  pieces = pieces.filter((piece) => (piece.state === "removed") === wantRemoved);
  if (filter.deliverableId) pieces = pieces.filter((piece) => piece.deliverableId === filter.deliverableId);
  if (filter.state && filter.state !== "removed") pieces = pieces.filter((piece) => piece.state === filter.state);
  return { ok: true as const, pieces };
}

export type LocalTargetState = {
  outcome: string;
  url?: string | null;
  postStatus?: string | null;
};

/** Publication state from local post and target rows. This does not call the social provider. */
export function localPublication(targets: LocalTargetState[], postStatus: string | null = null): "not_published" | "ready" | "scheduled" | "publishing" | "published" | "partially_published" | "needs_attention" {
  const outcomes = targets.map((target) => target.outcome);
  const success = outcomes.filter((outcome) => outcome === "succeeded" || outcome === "published").length;
  const failed = outcomes.filter((outcome) => outcome === "failed" || outcome === "uncertain").length;
  if (success > 0 && failed > 0) return "partially_published";
  if (failed > 0) return "needs_attention";
  if (outcomes.some((outcome) => outcome === "publishing" || outcome === "sending")) return "publishing";
  if (outcomes.some((outcome) => outcome === "scheduled")) return "scheduled";
  if (outcomes.length > 0 && success === outcomes.length) return "published";
  if (postStatus === "partial" || postStatus === "failed") return success > 0 ? "partially_published" : "needs_attention";
  if (postStatus === "sending") return "publishing";
  if (postStatus === "scheduled") return "scheduled";
  if (postStatus === "published") return "published";
  return "not_published";
}

export function parseSocialInstant(value: string | null): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function listAgentSocialPosts(
  sql: Sql,
  agent: AgentPrincipal,
  filter: { client: unknown; status?: string | null; from?: number | null; to?: number | null; limit?: number; offset?: number },
) {
  const resolved = await resolveAgentClient(sql, agent, clientArg(filter.client));
  if (!resolved.ok) return resolved;
  const limit = Math.min(Math.max(filter.limit ?? 20, 1), 50);
  const offset = Math.max(filter.offset ?? 0, 0);
  const rows = await sql.all<PostRow>(
    `SELECT id, deliverable_id, item_id, version, status, post_type, mode, scheduled_for, created_at, account_ids
     FROM social_posts
     WHERE organization_id = ?
       AND (? IS NULL OR status = ?)
       AND (? IS NULL OR COALESCE(scheduled_for, created_at) >= ?)
       AND (? IS NULL OR COALESCE(scheduled_for, created_at) <= ?)
     ORDER BY COALESCE(scheduled_for, created_at) DESC, created_at DESC
     LIMIT ? OFFSET ?`,
    [
      resolved.organizationId,
      filter.status ?? null,
      filter.status ?? null,
      filter.from ?? null,
      filter.from ?? null,
      filter.to ?? null,
      filter.to ?? null,
      limit + 1,
      offset,
    ],
  );
  const page = rows.slice(0, limit);
  return {
    ok: true as const,
    posts: page.map((row) => ({
      id: row.id,
      deliverableId: row.deliverable_id,
      itemId: row.item_id,
      version: row.version,
      status: row.status,
      postType: row.post_type,
      mode: row.mode,
      scheduledFor: row.scheduled_for,
      createdAt: row.created_at,
    })),
    nextOffset: rows.length > limit ? offset + limit : null,
  };
}

export async function socialCadenceView(sql: Sql, agent: AgentPrincipal, client: unknown, now: number) {
  const resolved = await resolveAgentClient(sql, agent, clientArg(client));
  if (!resolved.ok) return resolved;
  const cadence = await getAutopost(sql, resolved.organizationId);
  const taken = await sql.all<{ scheduled_for: number }>(
    "SELECT scheduled_for FROM social_posts WHERE organization_id = ? AND scheduled_for IS NOT NULL AND status = 'scheduled'",
    [resolved.organizationId],
  );
  return {
    ok: true as const,
    enabled: cadence.enabled,
    accountIds: cadence.accountIds,
    weekdays: cadence.weekdays,
    times: cadence.times,
    timezone: cadence.timezone,
    nextSlots: nextSlots(cadence, taken.map((row) => row.scheduled_for), now, 5),
  };
}

export async function listAgentAttention(sql: Sql, agent: AgentPrincipal, client: unknown) {
  const resolved = await resolveAgentClient(sql, agent, clientArg(client));
  if (!resolved.ok) return resolved;
  const rows = await sql.all<{
    id: string;
    kind: string;
    status: string;
    source_kind: string;
    source_id: string;
    target: string;
    recovery_action: string | null;
  }>(
    `SELECT id, kind, status, source_kind, source_id, target, recovery_action
     FROM social_attention_items WHERE organization_id = ? AND status = 'open'
     ORDER BY created_at`,
    [resolved.organizationId],
  );
  return {
    ok: true as const,
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      sourceKind: row.source_kind,
      sourceId: row.source_id,
      target: row.target,
      recoveryAction: row.recovery_action,
    })),
  };
}

export async function getAgentSocialPlan(sql: Sql, agent: AgentPrincipal, planId: string) {
  const row = await sql.get<{
    id: string;
    organization_id: string;
    action: string;
    rows_json: string;
    blocked_json: string;
    warnings_json: string;
    plan_hash: string;
    authorization: string;
    expires_at: number;
    executed_at: number | null;
    result_json: string | null;
  }>(
    `SELECT id, organization_id, action, rows_json, blocked_json, warnings_json, plan_hash, authorization,
            expires_at, executed_at, result_json
     FROM social_publish_plans WHERE id = ?`,
    [planId],
  );
  if (!row) return fail(404, "not_found", "That plan is not on this client.");
  const resolved = await resolveAgentClient(sql, agent, { organization_id: row.organization_id });
  if (!resolved.ok) return fail(404, "not_found", "That plan is not on this client.");
  const rows = safeRows(row.rows_json);
  const blocked = safeRows(row.blocked_json);
  let outcomes: { itemId: string; accountId: string; outcome: string; postId?: string }[] = [];
  if (row.result_json) {
    try {
      const parsed = JSON.parse(row.result_json) as { outcomes?: { itemId?: string; accountId?: string; outcome?: string; postId?: string }[] };
      outcomes = (parsed.outcomes ?? []).flatMap((item) =>
        item.itemId && item.accountId && item.outcome
          ? [{ itemId: item.itemId, accountId: item.accountId, outcome: item.outcome, ...(item.postId ? { postId: item.postId } : {}) }]
          : [],
      );
    } catch {
      outcomes = [];
    }
  }
  return {
    ok: true as const,
    planId: row.id,
    planHash: row.plan_hash,
    action: row.action,
    authorization: row.authorization,
    expiresAt: new Date(row.expires_at).toISOString(),
    executedAt: row.executed_at == null ? null : new Date(row.executed_at).toISOString(),
    rows,
    blocked,
    warnings: safeRows(row.warnings_json),
    outcomes,
  };
}

function safeRows(json: string): unknown[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function collectionCounts(pieces: { state: string }[]): { approved: number; needsChanges: number; unscheduled: number } {
  return {
    approved: pieces.filter((piece) => piece.state === "ready" || piece.state === "scheduled" || piece.state === "published").length,
    needsChanges: pieces.filter((piece) => piece.state === "changes").length,
    unscheduled: pieces.filter((piece) => piece.state === "ready").length,
  };
}
