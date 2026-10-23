import type { Sql } from "@/db/sql";
import type { SocialWriteResult } from "@/app/api/agent-social/http";
import { clientRefFrom } from "./agent-contacts";
import { AGENT_SOCIAL_LIMITS } from "./agent-social-limits";
import type { AgentPrincipal } from "./agent-work-filing";
import { executeSocialPlan } from "./social-commands";
import { asPostType } from "./social-plan";
import { actorStorageKind, PlanError, prepareCommandPlan, prepareSocialPlan, type PreparedPlan } from "./social-plans";
import { evaluateSocialPolicy, type SocialAction, type SocialActor } from "./social-policy";
import { resolveAgentClient, socialAgentActionsEnabled } from "./social-queries";
import { saveSocialVariant, type SocialVariant } from "./social-variants";
import { storeForCommands, zernioForCommands } from "./social-runtime";
import type { ObjectStore } from "./store/objects";
import type { PreflightTiming } from "./social-preflight";
import { CONNECT_PLATFORMS, isEligibleSocialPlatform, type ZernioClient } from "./zernio";

const CONTENT_ACTIONS = new Set<SocialAction>(["schedule", "publish_now", "save_draft", "prepare_schedule"]);

function fail(status: number, reasonCode: string, message: string, extra?: Record<string, unknown>): SocialWriteResult {
  return { ok: false, status, reasonCode, message, ...(extra ? { extra } : {}) };
}

function writesOff(): SocialWriteResult | null {
  if (socialAgentActionsEnabled()) return null;
  return fail(403, "feature_disabled", "Agent social actions are off.");
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function numberList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = typeof item === "number" ? item : typeof item === "string" && item.trim() ? Number(item) : Number.NaN;
    return Number.isFinite(parsed) ? [parsed] : [];
  });
}

function requiredExternal(body: Record<string, unknown>): { ok: true; value: string } | SocialWriteResult {
  const externalId = text(body.external_id ?? body.externalId);
  if (!externalId) return fail(400, "external_id_required", "An external id is required.");
  return { ok: true, value: externalId };
}

function parseInstant(value: unknown): number | null {
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

function timingFrom(body: Record<string, unknown>, action: SocialAction, now: number): PreflightTiming | "invalid" | "missing" {
  const raw = body.timing;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    if (action === "publish_now") return { kind: "now", now };
    if (action === "save_draft" || action === "prepare_schedule") return { kind: "draft" };
    return "missing";
  }
  const timing = raw as Record<string, unknown>;
  const mode = timing.mode;
  if (mode === "now") return { kind: "now", now };
  if (mode === "draft") return { kind: "draft" };
  if (mode === "cadence") {
    return {
      kind: "cadence",
      slots: numberList(timing.slots),
      takenSlots: numberList(timing.taken_slots ?? timing.takenSlots),
      now,
    };
  }
  if (mode === "scheduled") {
    const startAt = parseInstant(timing.start_at ?? timing.startAt);
    if (startAt == null) return "invalid";
    const gapRaw = timing.gap_minutes ?? timing.gapMinutes;
    const gap = typeof gapRaw === "number" && Number.isFinite(gapRaw) ? gapRaw : typeof gapRaw === "string" && gapRaw.trim() && Number.isFinite(Number(gapRaw)) ? Number(gapRaw) : 60;
    return { kind: "scheduled", startAt, gapMinutes: gap, now };
  }
  return "invalid";
}

function planBody(plan: PreparedPlan): Record<string, unknown> {
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
  };
}

function planResult(plan: PreparedPlan): SocialWriteResult {
  const body = planBody(plan);
  if (plan.authorization === "denied") {
    return fail(403, plan.reasonCode, "That plan is not allowed.", body);
  }
  return { ok: true, status: 200, body };
}

async function assigned(sql: Sql, agent: AgentPrincipal, client: unknown) {
  const off = writesOff();
  if (off) return off;
  const resolved = await resolveAgentClient(sql, agent, clientRefFrom(client));
  if (!resolved.ok) return fail(resolved.status, resolved.reasonCode, resolved.message);
  return resolved;
}

function unavailableZernio(): ZernioClient {
  const failCall = () => Promise.reject(new PlanError(503, "publishing_unavailable"));
  return new Proxy({} as ZernioClient, { get: () => failCall });
}

function missingStore(): ObjectStore {
  const failCall = () => Promise.reject(new PlanError(503, "publishing_unavailable"));
  return {
    stat: failCall,
    read: failCall,
    remove: failCall,
    put: failCall,
    beginUpload: failCall,
    readUpload: failCall,
    writePart: failCall,
    finishUpload: failCall,
  };
}

/**
 * Scheduling and publishing from an agent names its work card and deliverable. They must agree, and the card must be
 * Done, before any plan is prepared. (Preparing and executing also re-check the card, the project's Library setting
 * and the allowed network in loadContext.)
 */
async function bindWork(
  sql: Sql,
  organizationId: string,
  itemIds: string[],
  body: Record<string, unknown>,
  selection: Record<string, unknown>,
): Promise<SocialWriteResult | null> {
  const deliverableId = text(body.deliverable_id ?? body.deliverableId ?? selection.deliverable_id ?? selection.deliverableId);
  const workItemId = text(body.work_item_id ?? body.workItemId ?? selection.work_item_id ?? selection.workItemId);
  if (!deliverableId) return fail(400, "deliverable_required", "A deliverable id is required.");
  if (!workItemId) return fail(400, "work_item_required", "A work item id is required.");
  const deliverable = await sql.get<{ id: string }>(
    "SELECT id FROM deliverables WHERE id = ? AND organization_id = ?",
    [deliverableId, organizationId],
  );
  if (!deliverable) return fail(404, "not_found", "That deliverable is not on this client.");
  const card = await sql.get<{ id: string; deliverable_id: string | null; status: string }>(
    "SELECT id, deliverable_id, status FROM tasks WHERE id = ? AND organization_id = ?",
    [workItemId, organizationId],
  );
  if (!card) return fail(404, "not_found", "That work item is not on this client.");
  if (card.deliverable_id !== deliverableId) return fail(409, "work_item_mismatch", "That work item does not belong to that deliverable.");
  if (card.status !== "done") return fail(409, "card_not_done", "That work item is not Done.");
  if (itemIds.length > 0) {
    const marks = itemIds.map(() => "?").join(", ");
    const owned = await sql.all<{ id: string }>(`SELECT id FROM deliverable_items WHERE deliverable_id = ? AND id IN (${marks})`, [deliverableId, ...itemIds]);
    if (owned.length !== new Set(itemIds).size) return fail(409, "deliverable_mismatch", "Those pieces do not belong to that deliverable.");
  }
  return null;
}

/** Fixed-window limits per agent and client. Counts every plan an agent prepared, so a loop is stopped early. */
async function rateLimited(sql: Sql, actor: SocialActor, organizationId: string, action: string, phase: "prepare" | "execute", now: number): Promise<SocialWriteResult | null> {
  if (actor.kind !== "agent" || actor.role !== "hire" || (action !== "schedule" && action !== "publish_now")) return null;
  const hour = now - 60 * 60 * 1000;
  const day = now - 24 * 60 * 60 * 1000;
  const count = async (statement: string, params: unknown[]) => (await sql.get<{ n: number }>(statement, params))?.n ?? 0;
  if (phase === "prepare") {
    const prepared = await count(
      "SELECT COUNT(*) AS n FROM social_publish_plans WHERE organization_id = ? AND actor_kind = 'agent' AND actor_id = ? AND action IN ('schedule', 'publish_now') AND created_at > ?",
      [organizationId, actor.id, hour],
    );
    if (prepared >= AGENT_SOCIAL_LIMITS.plansPerHour) return fail(429, "rate_limited", "Too many plans. Try again later.", { retryAfterSeconds: 3600 });
    return null;
  }
  const executed = await count(
    "SELECT COUNT(*) AS n FROM social_publish_plans WHERE organization_id = ? AND actor_kind = 'agent' AND actor_id = ? AND action IN ('schedule', 'publish_now') AND executed_at > ?",
    [organizationId, actor.id, day],
  );
  if (executed >= AGENT_SOCIAL_LIMITS.executionsPerDay) return fail(429, "rate_limited", "Too many posts today. Try again later.", { retryAfterSeconds: 86400 });
  if (action === "publish_now") {
    const now1 = await count(
      "SELECT COUNT(*) AS n FROM social_publish_plans WHERE organization_id = ? AND actor_kind = 'agent' AND actor_id = ? AND action = 'publish_now' AND executed_at > ?",
      [organizationId, actor.id, day],
    );
    if (now1 >= AGENT_SOCIAL_LIMITS.publishNowPerDay) return fail(429, "rate_limited", "Too many publish-now posts today. Try again later.", { retryAfterSeconds: 86400 });
  }
  return null;
}

export async function postSocialPlan(sql: Sql, agent: AgentPrincipal, body: Record<string, unknown>, now: number): Promise<SocialWriteResult> {
  const external = requiredExternal(body);
  if (!("value" in external)) return writesOff() ?? external;
  const off = writesOff();
  if (off) return off;
  const action = text(body.action);
  if (!action || !CONTENT_ACTIONS.has(action as SocialAction)) return fail(400, "invalid_action", "That action is not available.");
  const client = await assigned(sql, agent, body.client);
  if (!("organizationId" in client)) return client;
  const timing = timingFrom(body, action as SocialAction, now);
  if (timing === "missing" || timing === "invalid") return fail(400, "invalid_timing", "That timing is not usable.");
  const selection = body.selection && typeof body.selection === "object" && !Array.isArray(body.selection) ? (body.selection as Record<string, unknown>) : {};
  const itemIds = stringList(selection.item_ids ?? selection.itemIds);
  const standing = evaluateSocialPolicy(client.actor, action as SocialAction, { contentApproved: true });
  // A denied plan (mode, role, permission) is answered by the plan itself. An empty selection is too.
  if ((action === "schedule" || action === "publish_now") && client.actor.kind === "agent" && client.actor.role === "hire" && standing.authorization !== "denied" && itemIds.length > 0) {
    // Agents may not sweep ("eligible"): they name one deliverable and its card.
    if (selection.mode === "eligible") return fail(400, "selection_required", "Name the pieces to post.");
    const limited = await rateLimited(sql, client.actor, client.organizationId, action, "prepare", now);
    if (limited) return limited;
    const unbound = await bindWork(sql, client.organizationId, itemIds, body, selection);
    if (unbound) return unbound;
  }
  const prepared = await prepareSocialPlan(sql, {
    organizationId: client.organizationId,
    actor: client.actor,
    action: action as SocialAction,
    mode: selection.mode === "eligible" ? "eligible" : "explicit",
    itemIds,
    accountIds: stringList(selection.account_ids ?? selection.accountIds),
    timing,
    timezone: text(body.timezone) ?? "UTC",
    now,
  });
  return planResult(prepared);
}

export async function executeAgentSocialPlan(
  sql: Sql,
  agent: AgentPrincipal,
  planId: string,
  body: Record<string, unknown>,
  now: number,
): Promise<SocialWriteResult> {
  const off = writesOff();
  if (off) return off;
  const external = requiredExternal(body);
  if (!("value" in external)) return external;
  const planHash = text(body.plan_hash ?? body.planHash);
  if (!planHash) return fail(400, "plan_hash_required", "A plan hash is required.");
  const stored = await sql.get<{ organization_id: string; action: string }>("SELECT organization_id, action FROM social_publish_plans WHERE id = ?", [planId]);
  if (!stored) return fail(404, "not_found", "That plan is not on this client.");
  const client = body.client == null ? { organization_id: stored.organization_id } : clientRefFrom(body.client);
  const resolved = await resolveAgentClient(sql, agent, client);
  if (!resolved.ok || resolved.organizationId !== stored.organization_id) {
    return fail(404, "not_found", "That plan is not on this client.");
  }
  // Execute does not re-run the policy by itself. An agent switched off, or moved off this client, after it prepared
  // a plan must not be able to run it.
  const standing = evaluateSocialPolicy(resolved.actor, stored.action as SocialAction, { contentApproved: true });
  if (standing.authorization === "denied") return fail(403, standing.reasonCode, "That plan is not allowed.");
  const limited = await rateLimited(sql, resolved.actor, resolved.organizationId, stored.action, "execute", now);
  if (limited) return limited;
  try {
    const result = await executeSocialPlan(sql, {
      organizationId: resolved.organizationId,
      actor: resolved.actor,
      planId,
      planHash,
      externalId: external.value,
      confirmationId: text(body.confirmation_token ?? body.confirmationToken) ?? undefined,
      now,
      zernio: zernioForCommands() ?? unavailableZernio(),
      store: storeForCommands() ?? missingStore(),
    });
    return {
      ok: true,
      status: result.status,
      body: {
        duplicate: result.duplicate,
        planId: result.planId,
        outcomes: result.outcomes,
        ...(result.oauthUrl ? { oauthUrl: result.oauthUrl } : {}),
      },
    };
  } catch (error) {
    if (error instanceof PlanError) return fail(error.status, error.reasonCode, "That plan could not run.");
    throw error;
  }
}

function redirectUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? raw : null;
  } catch {
    return null;
  }
}

export async function postConnectPlan(sql: Sql, agent: AgentPrincipal, body: Record<string, unknown>, now: number): Promise<SocialWriteResult> {
  const external = requiredExternal(body);
  if (!("value" in external)) return writesOff() ?? external;
  const client = await assigned(sql, agent, body.client);
  if (!("organizationId" in client)) return client;
  const platform = (text(body.platform) ?? "").toLowerCase();
  if (!(CONNECT_PLATFORMS as readonly string[]).includes(platform) || !isEligibleSocialPlatform(platform)) {
    return fail(400, "invalid_platform", "That network is not available.");
  }
  const redirect = redirectUrl(body.redirect_url ?? body.redirectUrl);
  if (!redirect) return fail(400, "invalid_redirect", "The return address must be http or https.");
  const prepared = await prepareCommandPlan(sql, {
    organizationId: client.organizationId,
    actor: client.actor,
    action: "connect",
    now,
    platform,
    redirectUrl: redirect,
  });
  return planResult(prepared);
}

export async function postDisconnectPlan(sql: Sql, agent: AgentPrincipal, body: Record<string, unknown>, now: number): Promise<SocialWriteResult> {
  const external = requiredExternal(body);
  if (!("value" in external)) return writesOff() ?? external;
  const client = await assigned(sql, agent, body.client);
  if (!("organizationId" in client)) return client;
  const accountId = text(body.account_id ?? body.accountId);
  if (!accountId) return fail(404, "not_found", "That account is not on this client.");
  const account = await sql.get<{ platform: string }>("SELECT platform FROM social_accounts WHERE id = ? AND organization_id = ?", [
    accountId,
    client.organizationId,
  ]);
  if (!account) return fail(404, "not_found", "That account is not on this client.");
  if (!isEligibleSocialPlatform(account.platform)) return fail(400, "out_of_scope", "That account is outside this workflow.");
  const prepared = await prepareCommandPlan(sql, {
    organizationId: client.organizationId,
    actor: client.actor,
    action: "disconnect",
    now,
    accountId,
  });
  return planResult(prepared);
}

export async function postCadencePlan(sql: Sql, agent: AgentPrincipal, body: Record<string, unknown>, now: number): Promise<SocialWriteResult> {
  const external = requiredExternal(body);
  if (!("value" in external)) return writesOff() ?? external;
  const client = await assigned(sql, agent, body.client);
  if (!("organizationId" in client)) return client;
  const enabled = body.enabled === true || body.enabled === 1 || body.enabled === "true" || body.enabled === "1";
  const prepared = await prepareCommandPlan(sql, {
    organizationId: client.organizationId,
    actor: client.actor,
    action: "cadence_change",
    now,
    timezone: text(body.timezone) ?? "UTC",
    cadence: {
      enabled,
      accountIds: stringList(body.account_ids ?? body.accountIds),
      weekdays: numberList(body.weekdays).filter((day) => day >= 0 && day <= 6),
      times: stringList(body.times),
      timezone: text(body.timezone) ?? "UTC",
    },
  });
  return planResult(prepared);
}

async function ownPost(sql: Sql, organizationId: string, postId: string) {
  return sql.get<{ id: string }>("SELECT id FROM social_posts WHERE id = ? AND organization_id = ?", [postId, organizationId]);
}

export async function postMovePlan(
  sql: Sql,
  agent: AgentPrincipal,
  postId: string,
  body: Record<string, unknown>,
  now: number,
): Promise<SocialWriteResult> {
  const external = requiredExternal(body);
  if (!("value" in external)) return writesOff() ?? external;
  const client = await assigned(sql, agent, body.client);
  if (!("organizationId" in client)) return client;
  if (!(await ownPost(sql, client.organizationId, postId))) return fail(404, "not_found", "That post is not on this client.");
  const scheduledFor = parseInstant(body.scheduled_for ?? body.scheduledFor);
  if (scheduledFor == null) return fail(400, "invalid_timing", "That timing is not usable.");
  const prepared = await prepareCommandPlan(sql, {
    organizationId: client.organizationId,
    actor: client.actor,
    action: "reschedule",
    now,
    postId,
    scheduledFor,
    timezone: text(body.timezone) ?? "UTC",
  });
  return planResult(prepared);
}

export async function postCancelPlan(
  sql: Sql,
  agent: AgentPrincipal,
  postId: string,
  body: Record<string, unknown>,
  now: number,
): Promise<SocialWriteResult> {
  const external = requiredExternal(body);
  if (!("value" in external)) return writesOff() ?? external;
  const client = await assigned(sql, agent, body.client);
  if (!("organizationId" in client)) return client;
  if (!(await ownPost(sql, client.organizationId, postId))) return fail(404, "not_found", "That post is not on this client.");
  const prepared = await prepareCommandPlan(sql, {
    organizationId: client.organizationId,
    actor: client.actor,
    action: "cancel",
    now,
    postId,
  });
  return planResult(prepared);
}

export async function postRetryPlan(
  sql: Sql,
  agent: AgentPrincipal,
  attentionId: string,
  body: Record<string, unknown>,
  now: number,
): Promise<SocialWriteResult> {
  const external = requiredExternal(body);
  if (!("value" in external)) return writesOff() ?? external;
  const client = await assigned(sql, agent, body.client);
  if (!("organizationId" in client)) return client;
  const attention = await sql.get<{ id: string }>("SELECT id FROM social_attention_items WHERE id = ? AND organization_id = ?", [
    attentionId,
    client.organizationId,
  ]);
  if (!attention) return fail(404, "not_found", "That item is not on this client.");
  const prepared = await prepareCommandPlan(sql, {
    organizationId: client.organizationId,
    actor: client.actor,
    action: "retry",
    now,
    attentionId,
  });
  return planResult(prepared);
}

function variantMessage(reasonCode: string): string {
  if (reasonCode === "feature_disabled") return "Agent social actions are off.";
  if (reasonCode === "conflict") return "That variant changed. Read it again and retry.";
  if (reasonCode === "post_scheduled") return "That post is already scheduled or published. Ask staff to change it with a card.";
  if (reasonCode === "stale_source") return "That piece version is no longer current.";
  if (reasonCode === "not_found") return "That piece is not on this client.";
  if (reasonCode === "unsupported_options") return "That network does not accept those options.";
  if (reasonCode === "invalid_platform") return "That network is not available.";
  if (reasonCode === "invalid_post_type") return "That post type is not usable.";
  if (reasonCode === "role_denied" || reasonCode === "policy_observe" || reasonCode === "policy_draft") return "That change is not allowed.";
  return "That variant was not saved.";
}

function publicVariant(saved: SocialVariant): Record<string, unknown> {
  return {
    id: saved.id,
    itemId: saved.itemId,
    version: saved.version,
    platform: saved.platform,
    caption: saved.caption,
    firstComment: saved.firstComment,
    title: saved.title,
    tags: saved.tags,
    postType: saved.postType,
    options: saved.options,
    mediaOrder: saved.mediaOrder,
    revision: saved.revision,
    eligible: saved.eligible,
  };
}

/** Saves one platform variant. Idempotency is stored only after a successful write. */
export async function saveAgentSocialVariant(
  sql: Sql,
  agent: AgentPrincipal,
  itemId: string,
  body: Record<string, unknown>,
  now: number,
): Promise<SocialWriteResult> {
  const external = requiredExternal(body);
  if (!("value" in external)) return writesOff() ?? external;
  const client = await assigned(sql, agent, body.client);
  if (!("organizationId" in client)) return client;
  const kind = actorStorageKind(client.actor);
  const prior = await sql.get<{ response_json: string }>(
    "SELECT response_json FROM social_action_idempotency WHERE actor_kind = ? AND actor_id = ? AND external_id = ?",
    [kind, client.actor.id, external.value],
  );
  if (prior) {
    const stored = JSON.parse(prior.response_json) as Record<string, unknown>;
    return { ok: true, status: 200, body: { ...stored, duplicate: true } };
  }
  const platform = text(body.platform);
  if (!platform) return fail(400, "invalid_platform", "A platform is required.");
  const versionRaw = body.version;
  const version = typeof versionRaw === "number" ? versionRaw : typeof versionRaw === "string" && versionRaw.trim() ? Number(versionRaw) : Number.NaN;
  if (!Number.isInteger(version)) return fail(400, "invalid_version", "A version is required.");
  const revisionRaw = body.expected_revision ?? body.expectedRevision ?? 0;
  const expectedRevision =
    typeof revisionRaw === "number" ? revisionRaw : typeof revisionRaw === "string" && revisionRaw.trim() ? Number(revisionRaw) : Number.NaN;
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) return fail(400, "invalid_revision", "That revision is not usable.");
  const postTypeRaw = text(body.post_type ?? body.postType);
  const postType = postTypeRaw ? asPostType(postTypeRaw) : null;
  if (postTypeRaw && !postType) return fail(400, "invalid_post_type", "That post type is not usable.");
  const options =
    body.options && typeof body.options === "object" && !Array.isArray(body.options) ? (body.options as Record<string, unknown>) : {};
  try {
    const saved = await saveSocialVariant(sql, {
      organizationId: client.organizationId,
      actor: client.actor,
      itemId,
      version,
      platform,
      caption: typeof body.caption === "string" ? body.caption : null,
      firstComment: typeof (body.first_comment ?? body.firstComment) === "string" ? String(body.first_comment ?? body.firstComment) : null,
      title: typeof body.title === "string" ? body.title : null,
      tags: stringList(body.tags),
      postType,
      options,
      mediaOrder: stringList(body.media_order ?? body.mediaOrder),
      expectedRevision,
      now,
    });
    const response = { duplicate: false, variant: publicVariant(saved) };
    try {
      await sql.run(
        `INSERT INTO social_action_idempotency (
           id, actor_kind, actor_id, external_id, action, resource_id, response_json, created_at
         ) VALUES (?, ?, ?, ?, 'variant_write', ?, ?, ?)`,
        [crypto.randomUUID(), kind, client.actor.id, external.value, saved.id, JSON.stringify(response), now],
      );
    } catch (error) {
      const raced = await sql.get<{ response_json: string }>(
        "SELECT response_json FROM social_action_idempotency WHERE actor_kind = ? AND actor_id = ? AND external_id = ?",
        [kind, client.actor.id, external.value],
      );
      if (!raced) throw error;
      const stored = JSON.parse(raced.response_json) as Record<string, unknown>;
      return { ok: true, status: 200, body: { ...stored, duplicate: true } };
    }
    return { ok: true, status: 200, body: response };
  } catch (error) {
    if (error instanceof PlanError) return fail(error.status, error.reasonCode, variantMessage(error.reasonCode));
    throw error;
  }
}
