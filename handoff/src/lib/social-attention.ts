import type { Sql } from "@/db/sql";
import type { Caller } from "./authz";
import type { SocialActor } from "./social-policy";
import type { PostType } from "./social-plan";
import type { ObjectStore } from "./store/objects";
import type { ZernioClient } from "./zernio";

const COMMAND_GATE = Symbol.for("handoff.social.command");
const DETAIL_KEYS = ["reason", "outcome", "platform"] as const;
const SECRET = /sk_|token|bearer|http/i;
const LIVE_POST = new Set(["sending", "scheduled", "published", "partial"]);
const POST_TYPES = new Set<PostType>(["feed", "carousel", "reel", "story", "short"]);

export type AttentionKind =
  | "disconnected_account"
  | "upload_failure"
  | "rejected_target"
  | "missing_requirement"
  | "stale_plan"
  | "uncertain_outcome";

export type RaiseAttentionInput = {
  organizationId: string;
  sourceKind: string;
  sourceId: string;
  target?: string;
  kind: string;
  now: number;
  detail?: Record<string, unknown>;
};

export type RetryAssessment = {
  found: boolean;
  recoverable: boolean;
  reason: "live_post" | "not_recoverable" | "stale_plan" | "not_open" | "ok";
  accountId: string;
  postId: string;
  itemId: string;
};

export type AttentionOutcome = {
  itemId: string;
  accountId: string;
  outcome: "succeeded" | "failed" | "uncertain" | "not_attempted" | "scheduled";
  postId?: string;
  error?: string;
};

type AttentionRow = {
  id: string;
  organization_id: string;
  source_kind: string;
  source_id: string;
  target: string;
  kind: string;
  status: string;
  recovery_action: string | null;
};

function recoveryFor(kind: string): string | null {
  if (kind === "disconnected_account") return "connect";
  if (kind === "upload_failure") return "retry";
  if (kind === "uncertain_outcome") return "reconcile";
  return null;
}

function cleanDetail(detail: Record<string, unknown> | undefined): Record<string, string> {
  const clean: Record<string, string> = {};
  if (!detail) return clean;
  for (const key of DETAIL_KEYS) {
    const value = detail[key];
    if (typeof value !== "string" || value.length > 64 || SECRET.test(value)) continue;
    clean[key] = value;
  }
  return clean;
}

function storedKind(actor: SocialActor): "staff" | "client" | "agent" | "system" {
  if (actor.kind === "client_owner" || actor.kind === "client_member") return "client";
  return actor.kind;
}

/** Staff keep a staff caller. Agents pass the command gate so sendPiece accepts them. */
function retryCaller(actor: SocialActor): Caller {
  const kind = storedKind(actor);
  const caller: Caller =
    actor.kind === "staff"
      ? { userId: actor.id, staff: { superAdmin: false }, operatorOf: [], memberships: [] }
      : { userId: null, staff: null, operatorOf: [], memberships: [] };
  (caller as Caller & { [COMMAND_GATE]?: { kind: string; id: string } })[COMMAND_GATE] = { kind, id: actor.id };
  return caller;
}

/** One open issue per source. Provider text, tokens, and links never land in the record. */
export async function raiseSocialAttention(sql: Sql, input: RaiseAttentionInput): Promise<{ id: string }> {
  const target = input.target ?? "";
  const detail = JSON.stringify(cleanDetail(input.detail));
  const recovery = recoveryFor(input.kind);
  const existing = await sql.get<{ id: string }>(
    `SELECT id FROM social_attention_items
     WHERE organization_id = ? AND source_kind = ? AND source_id = ? AND target = ?`,
    [input.organizationId, input.sourceKind, input.sourceId, target],
  );
  if (existing) {
    await sql.run(
      `UPDATE social_attention_items
       SET kind = ?, status = 'open', recovery_action = ?, detail_json = ?, updated_at = ?, resolved_at = NULL
       WHERE id = ?`,
      [input.kind, recovery, detail, input.now, existing.id],
    );
    return { id: existing.id };
  }
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO social_attention_items (
       id, organization_id, source_kind, source_id, target, kind, status, recovery_action, detail_json, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
    [id, input.organizationId, input.sourceKind, input.sourceId, target, input.kind, recovery, detail, input.now, input.now],
  );
  return { id };
}

/** Open attention for one client. Platform comes from the stored detail allowlist. */
export async function listOpenSocialAttention(
  sql: Sql,
  organizationId: string,
): Promise<{ id: string; kind: string; platform: string }[]> {
  const rows = await sql.all<{ id: string; kind: string; detail_json: string }>(
    `SELECT id, kind, detail_json FROM social_attention_items
     WHERE organization_id = ? AND status = 'open' ORDER BY created_at ASC`,
    [organizationId],
  );
  return rows.map((row) => {
    let platform = "";
    try {
      const detail = JSON.parse(row.detail_json) as { platform?: unknown };
      if (typeof detail.platform === "string") platform = detail.platform;
    } catch {
      platform = "";
    }
    return { id: row.id, kind: row.kind, platform };
  });
}

export async function noteDisconnectedAccount(sql: Sql, accountId: string, now: number): Promise<{ id: string }> {
  const account = await sql.get<{ organization_id: string }>("SELECT organization_id FROM social_accounts WHERE id = ?", [accountId]);
  if (!account) return { id: "" };
  return raiseSocialAttention(sql, {
    organizationId: account.organization_id,
    sourceKind: "account",
    sourceId: accountId,
    target: "",
    kind: "disconnected_account",
    now,
  });
}

export async function notePreflightAttention(
  sql: Sql,
  organizationId: string,
  blocked: { itemId: string; accountId: string; reason: string | null }[],
  now: number,
): Promise<void> {
  for (const row of blocked) {
    if (row.reason === "missing_title") {
      await raiseSocialAttention(sql, {
        organizationId,
        sourceKind: "item",
        sourceId: row.itemId,
        target: row.accountId,
        kind: "missing_requirement",
        now,
        detail: { reason: "missing_title" },
      });
    } else if (row.reason === "disconnected") {
      await raiseSocialAttention(sql, {
        organizationId,
        sourceKind: "account",
        sourceId: row.accountId,
        target: "",
        kind: "disconnected_account",
        now,
      });
    } else if (row.reason === "stale_version") {
      await raiseSocialAttention(sql, {
        organizationId,
        sourceKind: "item",
        sourceId: row.itemId,
        target: "",
        kind: "stale_plan",
        now,
      });
    }
  }
}

export async function noteStalePlan(sql: Sql, organizationId: string, planId: string, now: number): Promise<{ id: string }> {
  return raiseSocialAttention(sql, {
    organizationId,
    sourceKind: "plan",
    sourceId: planId,
    target: "",
    kind: "stale_plan",
    now,
  });
}

async function resolveAttention(sql: Sql, attentionId: string, now: number): Promise<void> {
  const row = await sql.get<AttentionRow>(
    `SELECT id, organization_id, source_kind, source_id, target, kind, status, recovery_action
     FROM social_attention_items WHERE id = ?`,
    [attentionId],
  );
  if (!row || (row.status !== "open" && row.status !== "in_progress")) return;
  await sql.run(
    "UPDATE social_attention_items SET status = 'resolved', resolved_at = ?, updated_at = ? WHERE id = ? AND status IN ('open', 'in_progress')",
    [now, now, attentionId],
  );
  await sql.run(
    `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, ?, 'social.attention.resolved', 'system', 'system', ?, ?, ?)`,
    [
      crypto.randomUUID(),
      row.organization_id,
      "Resolved a social attention item.",
      JSON.stringify({
        attentionId: row.id,
        sourceKind: row.source_kind,
        sourceId: row.source_id,
        target: row.target,
        kind: row.kind,
      }),
      now,
    ],
  );
}

/**
 * Webhook and cron share this. A definite success closes the issue. Publishing does not.
 * A failure with a provider id is rejected, never retried.
 */
export async function reconcilePostedTargets(
  sql: Sql,
  postId: string,
  organizationId: string,
  targets: { accountId: string; platform: string }[],
  outcome: "succeeded" | "failed" | "uncertain" | "not_attempted" | "scheduled" | "publishing",
  now: number,
): Promise<void> {
  if (outcome === "publishing" || outcome === "not_attempted") return;
  const post = await sql.get<{ zernio_post_id: string | null }>(
    "SELECT zernio_post_id FROM social_posts WHERE id = ? AND organization_id = ?",
    [postId, organizationId],
  );
  for (const target of targets) {
    if (outcome === "succeeded" || outcome === "scheduled") {
      const open = await sql.get<{ id: string }>(
        `SELECT id FROM social_attention_items
         WHERE organization_id = ? AND source_kind = 'post' AND source_id = ? AND target = ?
           AND status IN ('open', 'in_progress')`,
        [organizationId, postId, target.accountId],
      );
      if (open) await resolveAttention(sql, open.id, now);
      continue;
    }
    const kind = outcome === "uncertain" ? "uncertain_outcome" : post?.zernio_post_id ? "rejected_target" : "upload_failure";
    await raiseSocialAttention(sql, {
      organizationId,
      sourceKind: "post",
      sourceId: postId,
      target: target.accountId,
      kind,
      now,
      detail: { outcome, platform: target.platform },
    });
  }
}

const EMPTY_ASSESSMENT: RetryAssessment = {
  found: false,
  recoverable: false,
  reason: "not_open",
  accountId: "",
  postId: "",
  itemId: "",
};

export async function assessSocialRetry(sql: Sql, organizationId: string, attentionId: string): Promise<RetryAssessment> {
  const attention = await sql.get<AttentionRow>(
    `SELECT id, organization_id, source_kind, source_id, target, kind, status, recovery_action
     FROM social_attention_items WHERE id = ? AND organization_id = ?`,
    [attentionId, organizationId],
  );
  if (!attention) return EMPTY_ASSESSMENT;
  const base: RetryAssessment = {
    found: true,
    recoverable: false,
    reason: "not_recoverable",
    accountId: attention.target,
    postId: attention.source_kind === "post" ? attention.source_id : "",
    itemId: "",
  };
  if (attention.status !== "open" && attention.status !== "in_progress") return { ...base, reason: "not_open" };
  if (attention.kind === "stale_plan") return { ...base, reason: "stale_plan" };
  if (attention.kind !== "upload_failure" || attention.recovery_action !== "retry" || attention.source_kind !== "post") return base;
  const post = await sql.get<{ item_id: string; version: number; status: string; zernio_post_id: string | null }>(
    "SELECT item_id, version, status, zernio_post_id FROM social_posts WHERE id = ? AND organization_id = ?",
    [attention.source_id, organizationId],
  );
  if (!post) return base;
  const withItem = { ...base, itemId: post.item_id, postId: attention.source_id };
  if (LIVE_POST.has(post.status)) return { ...withItem, reason: "live_post" };
  if (post.zernio_post_id) return withItem;
  if (post.status !== "failed") return withItem;
  const item = await sql.get<{ version: number }>("SELECT version FROM deliverable_items WHERE id = ?", [post.item_id]);
  if (!item || item.version !== post.version) return { ...withItem, reason: "stale_plan" };
  const account = await sql.get<{ is_active: number }>(
    "SELECT is_active FROM social_accounts WHERE id = ? AND organization_id = ?",
    [attention.target, organizationId],
  );
  if (!account || account.is_active !== 1) return withItem;
  return { ...withItem, recoverable: true, reason: "ok" };
}

function blockedOutcome(assessed: RetryAssessment): AttentionOutcome {
  const error = assessed.reason === "not_open" || assessed.reason === "ok" ? "not_recoverable" : assessed.reason;
  return {
    itemId: assessed.itemId,
    accountId: assessed.accountId,
    outcome: "not_attempted",
    error,
    ...(assessed.postId ? { postId: assessed.postId } : {}),
  };
}

/** Sends a failed upload once. A live, rejected, or uncertain post is left alone. */
export async function recoverSocialAttention(
  sql: Sql,
  zernio: ZernioClient,
  store: ObjectStore,
  actor: SocialActor,
  organizationId: string,
  attentionId: string,
  now: number,
): Promise<AttentionOutcome> {
  const assessed = await assessSocialRetry(sql, organizationId, attentionId);
  if (!assessed.found || !assessed.recoverable) return blockedOutcome(assessed);
  const post = await sql.get<{
    deliverable_id: string;
    item_id: string;
    mode: "draft" | "scheduled" | "now";
    post_type: string;
    timezone: string | null;
    scheduled_for: number | null;
  }>(
    `SELECT deliverable_id, item_id, mode, post_type, timezone, scheduled_for
     FROM social_posts WHERE id = ? AND organization_id = ?`,
    [assessed.postId, organizationId],
  );
  if (!post) return blockedOutcome({ ...assessed, recoverable: false, reason: "not_recoverable" });
  const { sendPiece } = await import("./social");
  const postType = POST_TYPES.has(post.post_type as PostType) ? (post.post_type as PostType) : null;
  const sent = await sendPiece(
    sql,
    zernio,
    store,
    retryCaller(actor),
    {
      deliverableId: post.deliverable_id,
      itemId: post.item_id,
      accountIds: [assessed.accountId],
      mode: post.mode,
      postType,
      scheduledFor: post.scheduled_for,
      timezone: post.timezone || "UTC",
    },
    now,
  );
  if (sent.ok) {
    await resolveAttention(sql, attentionId, now);
    const kind = storedKind(actor);
    await sql.run(
      `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at)
       VALUES (?, ?, 'social.post.retried', ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        organizationId,
        kind === "client" ? "system" : kind,
        actor.id,
        "Retried a failed social upload.",
        JSON.stringify({ attentionId, postId: sent.postId, accountId: assessed.accountId, itemId: post.item_id }),
        now,
      ],
    );
    const outcome = sent.status === "published" || sent.status === "partial" ? "succeeded" : "scheduled";
    return { itemId: post.item_id, accountId: assessed.accountId, outcome, postId: sent.postId };
  }
  if (sent.uncertain) {
    await resolveAttention(sql, attentionId, now);
    return {
      itemId: post.item_id,
      accountId: assessed.accountId,
      outcome: "uncertain",
      error: "uncertain",
      ...(sent.postId ? { postId: sent.postId } : {}),
    };
  }
  if (sent.postId) await resolveAttention(sql, attentionId, now);
  return {
    itemId: post.item_id,
    accountId: assessed.accountId,
    outcome: "not_attempted",
    error: "not_recoverable",
    ...(sent.postId ? { postId: sent.postId } : {}),
  };
}
