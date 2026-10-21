import type { Sql } from "@/db/sql";
import type { Caller } from "./authz";
import type { ItemFormat } from "./deliverable-manifest";
import { getAutopost, nextSlots } from "./social-autopost";
import { executeSocialPlan, issueConfirmation } from "./social-commands";
import { asPostType, defaultPostType, pieceMedia, type PostType } from "./social-plan";
import type { SocialAction, SocialActor } from "./social-policy";
import { listSocialAccounts, listSocialPosts, sendPieces, zonedTimeToUtc, type SendMode } from "./social";
import { PlanError, prepareCommandPlan, prepareSocialPlan, type PreparedPlan } from "./social-plans";
import type { PreflightTiming } from "./social-preflight";
import { saveSocialVariant } from "./social-variants";
import type { ObjectStore } from "./store/objects";
import { CONNECT_PLATFORMS, isEligibleSocialPlatform, type ZernioClient } from "./zernio";

export const SOCIAL_READ_TOOLS = [
  "list_social_accounts",
  "list_social_posts",
  "social_overview",
  "list_social_pieces",
  "get_social_cadence",
] as const;
export const SOCIAL_WRITE_TOOLS = [
  "schedule_social",
  "prepare_social_publish",
  "prepare_social_move",
  "prepare_social_cancel",
  "prepare_social_retry",
  "prepare_social_cadence",
  "prepare_social_connect",
  "prepare_social_disconnect",
  "save_social_variant",
  "execute_social_plan",
] as const;

const PROVIDER_ACTIONS = new Set<SocialAction>([
  "schedule",
  "publish_now",
  "save_draft",
  "connect",
  "disconnect",
  "cancel",
  "reschedule",
  "retry",
]);

const PARTIAL_EXPLANATION =
  "A partial post is not a full success. Some destinations published and others still need attention.";

export type SocialToolDeps = { zernio: ZernioClient | null; store: ObjectStore };

type Result = { ok: true; value: unknown } | { ok: false; error: "missing" | "invalid" | "unknown" };

function text(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  return typeof value === "string" ? value.trim() : "";
}

function list(input: Record<string, unknown>, key: string): string[] {
  const value = input[key];
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  if (typeof value === "string") return value.split(/[\s,]+/).filter(Boolean);
  return [];
}

/** HQ chat tools for social posting. Returns null for any other tool name. */
export async function runSocialTool(
  sql: Sql,
  caller: Caller,
  tool: string,
  input: Record<string, unknown>,
  now: number,
  deps: () => SocialToolDeps,
): Promise<Result | null> {
  if (tool === "list_social_accounts" || tool === "list_social_posts") {
    const organizationId = text(input, "organizationId");
    const org = await sql.get<{ id: string }>("SELECT id FROM organizations WHERE id = ?", [organizationId]);
    if (!org) return { ok: false, error: "missing" };
    if (tool === "list_social_accounts") {
      const accounts = await listSocialAccounts(sql, organizationId);
      return {
        ok: true,
        value: accounts.map((row) => ({ id: row.id, platform: row.platform, username: row.username, active: row.is_active === 1 })),
      };
    }
    const posts = await listSocialPosts(sql, { organizationId }, 50);
    return {
      ok: true,
      value: posts.map((row) => ({
        id: row.id,
        piece: row.item_title,
        deliverableId: row.deliverable_id,
        type: row.post_type,
        status: row.status,
        scheduledFor: row.scheduled_for ? new Date(row.scheduled_for).toISOString() : null,
        timezone: row.timezone,
        error: row.error,
      })),
    };
  }
  if (tool === "schedule_social") {
    return scheduleSocial(sql, caller, input, now, deps);
  }
  return runSocialPlanTool(sql, caller, tool, input, now, deps);
}

/** Legacy direct send. Empty item ids mean every piece. Empty account ids mean every connected social account. */
async function scheduleSocial(
  sql: Sql,
  caller: Caller,
  input: Record<string, unknown>,
  now: number,
  deps: () => SocialToolDeps,
): Promise<Result> {
  const { zernio, store } = deps();
  if (!zernio) return { ok: true, value: { sent: 0, error: "Zernio is not set up. Add ZERNIO_API_KEY to the staff app." } };
  const deliverableId = text(input, "deliverableId");
  const deliverable = await sql.get<{ id: string; version: number }>("SELECT id, version FROM deliverables WHERE id = ?", [deliverableId]);
  if (!deliverable) return { ok: false, error: "missing" };
  const mode = text(input, "mode") || "draft";
  if (mode !== "draft" && mode !== "scheduled" && mode !== "now") return { ok: false, error: "invalid" };
  const timezone = text(input, "timezone") || "UTC";
  const startAt = mode === "scheduled" ? zonedTimeToUtc(text(input, "startAt"), timezone) : null;
  if (mode === "scheduled" && startAt == null) return { ok: false, error: "invalid" };
  const rawType = text(input, "postType") || "auto";
  const postType = rawType === "auto" ? null : asPostType(rawType);
  if (rawType !== "auto" && !postType) return { ok: false, error: "invalid" };
  let itemIds = list(input, "itemIds");
  if (itemIds.length === 0) {
    itemIds = (
      await sql.all<{ id: string }>(
        "SELECT id FROM deliverable_items WHERE deliverable_id = ? AND version = ? AND format NOT IN ('page', 'link', 'file')",
        [deliverable.id, deliverable.version],
      )
    ).map((row) => row.id);
  }
  let accountIds = list(input, "accountIds");
  if (accountIds.length === 0) {
    const org = await sql.get<{ organization_id: string }>("SELECT organization_id FROM deliverables WHERE id = ?", [deliverable.id]);
    accountIds = (await listSocialAccounts(sql, org?.organization_id ?? ""))
      .filter((row) => row.is_active === 1 && row.platform !== "wordpress" && row.platform !== "wix")
      .map((row) => row.id);
  }
  const gap = Number(input.gapMinutes ?? 1440);
  const result = await sendPieces(
    sql,
    zernio,
    store,
    caller,
    {
      deliverableId: deliverable.id,
      itemIds,
      accountIds,
      mode: mode as SendMode,
      postType,
      startAt,
      gapMinutes: Number.isFinite(gap) ? gap : 1440,
      timezone,
    },
    now,
  );
  return { ok: true, value: result };
}

const PLAN_TOOLS = new Set<string>([
  "social_overview",
  "list_social_pieces",
  "get_social_cadence",
  "prepare_social_publish",
  "prepare_social_move",
  "prepare_social_cancel",
  "prepare_social_retry",
  "prepare_social_cadence",
  "prepare_social_connect",
  "prepare_social_disconnect",
  "save_social_variant",
  "execute_social_plan",
]);

const LIVE_POST = new Set(["sending", "scheduled", "published", "partial"]);

function whole(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function numbers(input: Record<string, unknown>, key: string): number[] {
  const value = input[key];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = typeof item === "number" ? item : typeof item === "string" && item.trim() ? Number(item) : Number.NaN;
    return Number.isFinite(parsed) ? [parsed] : [];
  });
}

function nullable(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];
  if (value == null) return null;
  return typeof value === "string" ? value.trim() || null : null;
}

function enabledFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "true" || value === "1";
}

function httpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

function instant(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function gapMinutes(input: Record<string, unknown>): number {
  const raw = input.gapMinutes;
  const gap = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : 60;
  return Number.isFinite(gap) ? gap : 60;
}

function planValue(plan: PreparedPlan): Record<string, unknown> {
  const blocked = plan.blocked.map((row) => `${row.itemId} on ${row.accountId}: ${row.reason ?? "blocked"}`);
  return {
    planId: plan.planId,
    planHash: plan.planHash,
    expiresAt: new Date(plan.expiresAt).toISOString(),
    authorization: plan.authorization,
    reasonCode: plan.reasonCode,
    summary: { executable: plan.executable.length, blocked: plan.blocked.length },
    rows: plan.executable,
    blocked: plan.blocked,
    warnings: plan.warnings,
    explanation: blocked.length > 0 ? `Blocked rows: ${blocked.join("; ")}.` : "Every selected row can run.",
  };
}

function unavailableZernio(): ZernioClient {
  const failCall = () => Promise.reject(new PlanError(503, "publishing_unavailable"));
  return new Proxy({} as ZernioClient, { get: () => failCall });
}

async function organizationId(sql: Sql, input: Record<string, unknown>): Promise<string | null> {
  const id = text(input, "organizationId");
  if (!id) return null;
  const org = await sql.get<{ id: string }>("SELECT id FROM organizations WHERE id = ?", [id]);
  return org ? id : null;
}

async function runSocialPlanTool(
  sql: Sql,
  caller: Caller,
  tool: string,
  input: Record<string, unknown>,
  now: number,
  deps: () => SocialToolDeps,
): Promise<Result | null> {
  if (!PLAN_TOOLS.has(tool)) return null;
  if (!caller.userId) return { ok: false, error: "invalid" };
  const actor: SocialActor = { kind: "staff", id: caller.userId };
  const orgId = await organizationId(sql, input);
  if (!orgId) return { ok: false, error: "missing" };
  if (tool === "social_overview") return { ok: true, value: await staffOverview(sql, orgId, now) };
  if (tool === "list_social_pieces") return { ok: true, value: { pieces: await staffPieces(sql, orgId, text(input, "deliverableId")) } };
  if (tool === "get_social_cadence") return { ok: true, value: await staffCadence(sql, orgId, now) };
  if (tool === "prepare_social_publish") return preparePublish(sql, actor, orgId, input, now);
  if (tool === "prepare_social_connect") return prepareConnect(sql, actor, orgId, input, now);
  if (tool === "prepare_social_disconnect") return prepareDisconnect(sql, actor, orgId, input, now);
  if (tool === "prepare_social_move") return prepareMove(sql, actor, orgId, input, now);
  if (tool === "prepare_social_cancel") return prepareCancel(sql, actor, orgId, input, now);
  if (tool === "prepare_social_retry") return prepareRetry(sql, actor, orgId, input, now);
  if (tool === "prepare_social_cadence") return prepareCadence(sql, actor, orgId, input, now);
  if (tool === "save_social_variant") return saveVariant(sql, actor, orgId, input, now);
  return executePlan(sql, actor, orgId, input, now, deps);
}

async function staffOverview(sql: Sql, orgId: string, now: number) {
  const [accounts, pieces, posts, attention, cadence] = await Promise.all([
    listSocialAccounts(sql, orgId),
    sql.all<{ id: string; version: number; status: string }>(
      `SELECT i.id, i.version, i.status FROM deliverable_items i
       JOIN deliverables d ON d.id = i.deliverable_id
       WHERE d.organization_id = ? AND i.version = d.version AND i.format NOT IN ('page', 'link', 'file')`,
      [orgId],
    ),
    sql.all<{ id: string; item_id: string; version: number; status: string; scheduled_for: number | null }>(
      "SELECT id, item_id, version, status, scheduled_for FROM social_posts WHERE organization_id = ?",
      [orgId],
    ),
    sql.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM social_attention_items WHERE organization_id = ? AND status = 'open'",
      [orgId],
    ),
    getAutopost(sql, orgId),
  ]);
  const partials = posts.filter((post) => post.status === "partial");
  const targets = partials.length
    ? await sql.all<{ post_id: string; account_id: string; platform: string; outcome: string }>(
        `SELECT post_id, account_id, platform, outcome FROM social_post_targets WHERE post_id IN (${partials.map(() => "?").join(", ")})`,
        partials.map((post) => post.id),
      )
    : [];
  const liveIds = new Set(posts.filter((post) => LIVE_POST.has(post.status)).map((post) => `${post.item_id}:${post.version}`));
  return {
    accountHealth: accounts
      .filter((row) => isEligibleSocialPlatform(row.platform))
      .map((row) => ({
        id: row.id,
        platform: row.platform,
        username: row.username,
        displayName: row.display_name,
        active: row.is_active === 1,
      })),
    partialPosts: partials.map((post) => ({
      id: post.id,
      status: post.status,
      targets: targets
        .filter((target) => target.post_id === post.id)
        .map((target) => ({ accountId: target.account_id, platform: target.platform, outcome: target.outcome })),
    })),
    partialExplanation: PARTIAL_EXPLANATION,
    readyCount: pieces.filter((item) => item.status === "approved" && !liveIds.has(`${item.id}:${item.version}`)).length,
    scheduledCount: posts.filter((post) => post.status === "scheduled").length,
    attentionCount: attention?.count ?? 0,
    nextSlots: nextSlots(
      cadence,
      posts.flatMap((post) => (post.scheduled_for == null ? [] : [post.scheduled_for])),
      now,
      3,
    ),
  };
}

async function staffPieces(sql: Sql, orgId: string, deliverableId: string) {
  const rows = await sql.all<{
    id: string;
    deliverable_id: string;
    version: number;
    title: string;
    format: ItemFormat;
    status: string;
    media_json: string;
  }>(
    `SELECT i.id, i.deliverable_id, i.version, i.title, i.format, i.status, i.media_json
     FROM deliverable_items i
     JOIN deliverables d ON d.id = i.deliverable_id
     WHERE d.organization_id = ? AND i.version = d.version AND i.format NOT IN ('page', 'link', 'file')
       AND (? = '' OR i.deliverable_id = ?)
     ORDER BY i.sort, i.id`,
    [orgId, deliverableId, deliverableId],
  );
  return rows.map((row) => {
    const media = pieceMedia(row.media_json);
    return {
      deliverableId: row.deliverable_id,
      itemId: row.id,
      version: row.version,
      title: row.title,
      format: row.format,
      approved: row.status === "approved",
      postType: defaultPostType(row.format, media),
      media: { count: media.items.length, keys: media.items.map((item) => item.key) },
    };
  });
}

async function staffCadence(sql: Sql, orgId: string, now: number) {
  const cadence = await getAutopost(sql, orgId);
  const taken = await sql.all<{ scheduled_for: number }>(
    "SELECT scheduled_for FROM social_posts WHERE organization_id = ? AND scheduled_for IS NOT NULL AND status = 'scheduled'",
    [orgId],
  );
  return {
    enabled: cadence.enabled,
    accountIds: cadence.accountIds,
    weekdays: cadence.weekdays,
    times: cadence.times,
    timezone: cadence.timezone,
    nextSlots: nextSlots(cadence, taken.map((row) => row.scheduled_for), now, 5),
  };
}

async function preparePublish(
  sql: Sql,
  actor: SocialActor,
  orgId: string,
  input: Record<string, unknown>,
  now: number,
): Promise<Result> {
  const mode = text(input, "mode") || "draft";
  const timezone = text(input, "timezone") || "UTC";
  let action: SocialAction;
  let timing: PreflightTiming;
  if (mode === "now") {
    action = "publish_now";
    timing = { kind: "now", now };
  } else if (mode === "draft") {
    action = "save_draft";
    timing = { kind: "draft" };
  } else if (mode === "scheduled") {
    const startAt = zonedTimeToUtc(text(input, "startAt"), timezone);
    if (startAt == null) return { ok: false, error: "invalid" };
    action = "schedule";
    timing = { kind: "scheduled", startAt, gapMinutes: gapMinutes(input), now };
  } else {
    return { ok: false, error: "invalid" };
  }
  const plan = await prepareSocialPlan(sql, {
    organizationId: orgId,
    actor,
    action,
    mode: "explicit",
    itemIds: list(input, "itemIds"),
    accountIds: list(input, "accountIds"),
    timing,
    timezone,
    now,
  });
  return { ok: true, value: planValue(plan) };
}

async function prepareConnect(
  sql: Sql,
  actor: SocialActor,
  orgId: string,
  input: Record<string, unknown>,
  now: number,
): Promise<Result> {
  const platform = text(input, "platform").toLowerCase();
  if (!(CONNECT_PLATFORMS as readonly string[]).includes(platform) || !isEligibleSocialPlatform(platform)) {
    return { ok: false, error: "invalid" };
  }
  const redirect = httpUrl(text(input, "redirectUrl"));
  if (!redirect) return { ok: false, error: "invalid" };
  const plan = await prepareCommandPlan(sql, { organizationId: orgId, actor, action: "connect", now, platform, redirectUrl: redirect });
  return { ok: true, value: planValue(plan) };
}

async function prepareDisconnect(
  sql: Sql,
  actor: SocialActor,
  orgId: string,
  input: Record<string, unknown>,
  now: number,
): Promise<Result> {
  const accountId = text(input, "accountId");
  if (!accountId) return { ok: false, error: "missing" };
  const account = await sql.get<{ platform: string }>("SELECT platform FROM social_accounts WHERE id = ? AND organization_id = ?", [accountId, orgId]);
  if (!account) return { ok: false, error: "missing" };
  if (!isEligibleSocialPlatform(account.platform)) return { ok: false, error: "invalid" };
  const plan = await prepareCommandPlan(sql, { organizationId: orgId, actor, action: "disconnect", now, accountId });
  return { ok: true, value: planValue(plan) };
}

async function prepareMove(
  sql: Sql,
  actor: SocialActor,
  orgId: string,
  input: Record<string, unknown>,
  now: number,
): Promise<Result> {
  const postId = text(input, "postId");
  if (!postId) return { ok: false, error: "missing" };
  const post = await sql.get<{ id: string }>("SELECT id FROM social_posts WHERE id = ? AND organization_id = ?", [postId, orgId]);
  if (!post) return { ok: false, error: "missing" };
  const scheduledFor = instant(input.scheduledFor);
  if (scheduledFor == null) return { ok: false, error: "invalid" };
  const plan = await prepareCommandPlan(sql, {
    organizationId: orgId,
    actor,
    action: "reschedule",
    now,
    postId,
    scheduledFor,
    timezone: text(input, "timezone") || "UTC",
  });
  return { ok: true, value: planValue(plan) };
}

async function prepareCancel(
  sql: Sql,
  actor: SocialActor,
  orgId: string,
  input: Record<string, unknown>,
  now: number,
): Promise<Result> {
  const postId = text(input, "postId");
  if (!postId) return { ok: false, error: "missing" };
  const post = await sql.get<{ id: string }>("SELECT id FROM social_posts WHERE id = ? AND organization_id = ?", [postId, orgId]);
  if (!post) return { ok: false, error: "missing" };
  const plan = await prepareCommandPlan(sql, { organizationId: orgId, actor, action: "cancel", now, postId });
  return { ok: true, value: planValue(plan) };
}

async function prepareRetry(
  sql: Sql,
  actor: SocialActor,
  orgId: string,
  input: Record<string, unknown>,
  now: number,
): Promise<Result> {
  const attentionId = text(input, "attentionId");
  if (!attentionId) return { ok: false, error: "missing" };
  const attention = await sql.get<{ id: string }>("SELECT id FROM social_attention_items WHERE id = ? AND organization_id = ?", [attentionId, orgId]);
  if (!attention) return { ok: false, error: "missing" };
  const plan = await prepareCommandPlan(sql, { organizationId: orgId, actor, action: "retry", now, attentionId });
  return { ok: true, value: planValue(plan) };
}

async function prepareCadence(
  sql: Sql,
  actor: SocialActor,
  orgId: string,
  input: Record<string, unknown>,
  now: number,
): Promise<Result> {
  const timezone = text(input, "timezone") || "UTC";
  const plan = await prepareCommandPlan(sql, {
    organizationId: orgId,
    actor,
    action: "cadence_change",
    now,
    timezone,
    cadence: {
      enabled: enabledFlag(input.enabled),
      accountIds: list(input, "accountIds"),
      weekdays: numbers(input, "weekdays").filter((day) => day >= 0 && day <= 6),
      times: list(input, "times"),
      timezone,
    },
  });
  return { ok: true, value: planValue(plan) };
}

async function saveVariant(
  sql: Sql,
  actor: SocialActor,
  orgId: string,
  input: Record<string, unknown>,
  now: number,
): Promise<Result> {
  const itemId = text(input, "itemId");
  const platform = text(input, "platform").toLowerCase();
  const version = whole(input.version);
  const expectedRevision = whole(input.expectedRevision);
  if (!itemId || !platform || version == null || expectedRevision == null) return { ok: false, error: "invalid" };
  const rawType = text(input, "postType");
  const postType: PostType | null = rawType ? asPostType(rawType) : null;
  if (rawType && !postType) return { ok: false, error: "invalid" };
  const rawOptions = input.options ?? {};
  if (typeof rawOptions !== "object" || rawOptions === null || Array.isArray(rawOptions)) return { ok: false, error: "invalid" };
  const options = rawOptions as Record<string, unknown>;
  try {
    const variant = await saveSocialVariant(sql, {
      organizationId: orgId,
      actor,
      itemId,
      version,
      platform,
      caption: nullable(input, "caption"),
      firstComment: nullable(input, "firstComment"),
      title: nullable(input, "title"),
      tags: list(input, "tags"),
      postType,
      options,
      mediaOrder: list(input, "mediaOrder"),
      expectedRevision,
      now,
    });
    return { ok: true, value: { saved: true, variant } };
  } catch (error) {
    if (error instanceof PlanError) return { ok: true, value: { saved: false, reasonCode: error.reasonCode } };
    throw error;
  }
}

function storedReasonCode(requestJson: string): string {
  try {
    const request = JSON.parse(requestJson) as { reasonCode?: unknown };
    if (typeof request.reasonCode === "string" && request.reasonCode.trim()) return request.reasonCode;
  } catch {
    return "denied";
  }
  return "denied";
}

async function executePlan(
  sql: Sql,
  actor: SocialActor,
  orgId: string,
  input: Record<string, unknown>,
  now: number,
  deps: () => SocialToolDeps,
): Promise<Result> {
  const planId = text(input, "planId");
  const planHash = text(input, "planHash");
  const externalId = text(input, "externalId");
  if (!planId || !planHash || !externalId) return { ok: false, error: "invalid" };
  const row = await sql.get<{
    organization_id: string;
    actor_kind: string;
    actor_id: string;
    action: SocialAction;
    plan_hash: string;
    authorization: PreparedPlan["authorization"];
    request_json: string;
  }>(
    "SELECT organization_id, actor_kind, actor_id, action, plan_hash, authorization, request_json FROM social_publish_plans WHERE id = ?",
    [planId],
  );
  if (!row || row.organization_id !== orgId) return { ok: false, error: "missing" };
  if (row.actor_kind !== "staff" || row.actor_id !== actor.id || row.plan_hash !== planHash) {
    return { ok: true, value: { executed: false, reasonCode: "stale_plan" } };
  }
  if (row.authorization === "denied") {
    return { ok: true, value: { executed: false, reasonCode: storedReasonCode(row.request_json) } };
  }
  const { zernio, store } = deps();
  if (PROVIDER_ACTIONS.has(row.action) && !zernio) {
    return { ok: true, value: { executed: false, reasonCode: "publishing_unavailable" } };
  }
  try {
    const confirmationId =
      row.authorization === "confirmation_required"
        ? (await issueConfirmation(sql, { planId, planHash, actor, now })).id
        : undefined;
    const result = await executeSocialPlan(sql, {
      organizationId: orgId,
      actor,
      planId,
      planHash,
      externalId,
      confirmationId,
      now,
      zernio: zernio ?? unavailableZernio(),
      store,
    });
    return {
      ok: true,
      value: {
        executed: true,
        duplicate: result.duplicate,
        planId: result.planId,
        outcomes: result.outcomes,
        status: result.status,
        ...(result.oauthUrl ? { oauthUrl: result.oauthUrl } : {}),
      },
    };
  } catch (error) {
    if (error instanceof PlanError) return { ok: true, value: { executed: false, reasonCode: error.reasonCode } };
    throw error;
  }
}
