import { createHash } from "node:crypto";
import type { Sql } from "@/db/sql";
import type { ItemFormat } from "./deliverable-manifest";
import { libraryEligibleSql } from "./project-library";
import { notePreflightAttention, noteStalePlan } from "./social-attention";
import { pieceMedia } from "./social-plan";
import { evaluateSocialPolicy, type SocialAction, type SocialActor } from "./social-policy";
import {
  preflight,
  type PostTypeOverride,
  type PreflightOptions,
  type PreflightPiece,
  type PreflightResult,
  type PreflightRow,
  type PreflightTiming,
} from "./social-preflight";

export const PLAN_TTL_MS = 30 * 60 * 1000;
export const CONFIRM_SHORT_TTL_MS = 15 * 60 * 1000;

export type ActorStorageKind = "staff" | "client" | "agent" | "system";

export type PlanIdentity = {
  organizationId: string;
  actorKind: ActorStorageKind;
  actorId: string;
  action: string;
  executable: {
    itemId: string;
    version: number;
    accountId: string;
    platform: string;
    postType: string;
    scheduleAt: number | null;
    options: Record<string, unknown>;
  }[];
  blocked: { itemId: string; accountId: string; reason: string | null }[];
  timing: PreflightTiming;
  cadenceRevision: number | null;
};

export type PrepareSocialPlanInput = {
  organizationId: string;
  actor: SocialActor;
  action: SocialAction;
  mode: "explicit" | "eligible";
  itemIds: string[];
  accountIds: string[];
  timing: PreflightTiming;
  overrides?: PostTypeOverride[];
  options?: PreflightOptions[];
  timezone?: string;
  now: number;
};

export type PreparedPlan = {
  planId: string;
  planHash: string;
  authorization: "allowed" | "confirmation_required" | "denied";
  reasonCode: string;
  executable: PreflightRow[];
  blocked: PreflightRow[];
  warnings: PreflightResult["warnings"];
  expiresAt: number;
};

export class PlanError extends Error {
  readonly status: number;
  readonly reasonCode: string;

  constructor(status: number, reasonCode: string) {
    super(reasonCode);
    this.name = "PlanError";
    this.status = status;
    this.reasonCode = reasonCode;
  }
}

export type CommandCadence = {
  enabled: boolean;
  accountIds: string[];
  weekdays: number[];
  times: string[];
  timezone: string;
};

export type StoredRequest = {
  mode: "explicit" | "eligible";
  itemIds: string[];
  accountIds: string[];
  timing: PreflightTiming;
  overrides: PostTypeOverride[];
  options: PreflightOptions[];
  action: SocialAction;
  timezone: string;
  platform?: string;
  redirectUrl?: string;
  postId?: string;
  accountId?: string;
  scheduledFor?: number;
  attentionId?: string;
  cadence?: CommandCadence;
  /** Why this plan was allowed or denied. Stored for HQ to report later. Not part of the plan hash. */
  reasonCode?: string;
};

type PlanRow = {
  id: string;
  organization_id: string;
  actor_kind: ActorStorageKind;
  actor_id: string;
  action: SocialAction;
  request_json: string;
  rows_json: string;
  blocked_json: string;
  warnings_json: string;
  plan_hash: string;
  authorization: PreparedPlan["authorization"];
  expires_at: number;
  executed_at: number | null;
};

export type LoadedPlan = PreparedPlan & {
  action: SocialAction;
  request: StoredRequest;
  actorKind: ActorStorageKind;
  actorId: string;
};

export function actorStorageKind(actor: SocialActor): ActorStorageKind {
  if (actor.kind === "client_owner" || actor.kind === "client_member") return "client";
  return actor.kind;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function planHash(identity: PlanIdentity): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(identity))).digest("hex");
}

function hashRows(flight: PreflightResult, input: PrepareSocialPlanInput, cadenceRevision: number | null): string {
  return planHash({
    organizationId: input.organizationId,
    actorKind: actorStorageKind(input.actor),
    actorId: input.actor.id,
    action: input.action,
    executable: flight.executable.map((row) => ({
      itemId: row.itemId,
      version: row.version,
      accountId: row.accountId,
      platform: row.platform,
      postType: row.postType,
      scheduleAt: row.scheduleAt,
      options: row.options,
    })),
    blocked: flight.blocked.map((row) => ({ itemId: row.itemId, accountId: row.accountId, reason: row.reason })),
    timing: input.timing,
    cadenceRevision,
  });
}

const LIVE = ["sending", "scheduled", "published", "partial"];

type ItemRecord = {
  id: string;
  version: number;
  current_version: number;
  title: string;
  format: ItemFormat;
  status: string;
  media_json: string;
  deliverable_id: string;
};

function variantTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0);
  } catch {
    return [];
  }
}

async function loadContext(sql: Sql, input: PrepareSocialPlanInput): Promise<{ flight: PreflightResult; cadenceRevision: number | null }> {
  const cadence = await sql.get<{ updated_at: number }>("SELECT updated_at FROM social_autopost WHERE organization_id = ?", [
    input.organizationId,
  ]);
  if (input.itemIds.length === 0 || input.accountIds.length === 0) {
    return { flight: { executable: [], blocked: [], warnings: [], reason: "selection_required" }, cadenceRevision: cadence?.updated_at ?? null };
  }
  const items = await sql.all<ItemRecord>(
    `SELECT i.id, i.version, i.version AS current_version, i.title, i.format, i.status, i.media_json, i.deliverable_id
     FROM deliverable_items i JOIN deliverables d ON d.id = i.deliverable_id
     WHERE d.organization_id = ? AND d.published_version IS NOT NULL AND i.version = d.published_version
       AND i.removed_at IS NULL AND i.id IN (${input.itemIds.map(() => "?").join(", ")})`,
    [input.organizationId, ...input.itemIds],
  );
  const settings = items.length
    ? await sql.all<{ item_id: string; texts_json: string; first_comment: string | null; tags: string | null }>(
        `SELECT item_id, texts_json, first_comment, tags FROM social_piece_settings WHERE item_id IN (${items.map(() => "?").join(", ")})`,
        items.map((row) => row.id),
      )
    : [];
  const settingById = new Map(settings.map((row) => [row.item_id, row]));
  const variantRows = items.length
    ? await sql.all<{
        item_id: string;
        version: number;
        platform: string;
        first_comment: string | null;
        title: string | null;
        tags_json: string | null;
      }>(
        `SELECT item_id, version, platform, first_comment, title, tags_json
         FROM social_variants WHERE item_id IN (${items.map(() => "?").join(", ")})`,
        items.map((row) => row.id),
      )
    : [];
  const variantsByItem = new Map<string, typeof variantRows>();
  for (const variant of variantRows) {
    const list = variantsByItem.get(variant.item_id) ?? [];
    list.push(variant);
    variantsByItem.set(variant.item_id, list);
  }
  const pieces: PreflightPiece[] = items.map((row) => {
    const media = pieceMedia(row.media_json);
    const setting = settingById.get(row.id);
    let tags = (setting?.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);
    let youtubeTitle: string | undefined;
    try {
      const texts = JSON.parse(setting?.texts_json ?? "{}") as Record<string, unknown>;
      if (typeof texts.youtube_title === "string") youtubeTitle = texts.youtube_title;
    } catch {
      youtubeTitle = undefined;
    }
    let firstComment = setting?.first_comment ?? undefined;
    const stored = (variantsByItem.get(row.id) ?? []).filter(
      (variant) => variant.version === row.version && row.version === row.current_version,
    );
    if (stored.length > 0) {
      const comments = stored.map((variant) => variant.first_comment?.trim() || "").filter(Boolean);
      if (comments.length > 0 && comments.every((comment) => comment === comments[0])) firstComment = comments[0];
      const youtube = stored.find((variant) => variant.platform === "youtube");
      if (youtube?.title?.trim()) youtubeTitle = youtube.title.trim();
      const youtubeTags = variantTags(youtube?.tags_json ?? null);
      if (youtubeTags.length > 0) tags = youtubeTags;
    }
    return {
      id: row.id,
      version: row.version,
      currentVersion: row.current_version,
      title: row.title,
      format: row.format,
      approved: row.status === "approved",
      media: media.items,
      poster: media.poster,
      youtubeTitle,
      tags,
      firstComment,
    };
  });
  const accounts = await sql.all<{ id: string; platform: string; is_active: number }>(
    `SELECT id, platform, is_active FROM social_accounts WHERE organization_id = ? AND id IN (${input.accountIds.map(() => "?").join(", ")})`,
    [input.organizationId, ...input.accountIds],
  );
  const posts = await sql.all<{ item_id: string; version: number; account_ids: string }>(
    `SELECT item_id, version, account_ids FROM social_posts
     WHERE organization_id = ? AND status IN (${LIVE.map(() => "?").join(", ")})`,
    [input.organizationId, ...LIVE],
  );
  const live = posts.flatMap((row) => {
    let ids: string[] = [];
    try {
      const parsed = JSON.parse(row.account_ids) as unknown;
      if (Array.isArray(parsed)) ids = parsed.filter((id): id is string => typeof id === "string");
    } catch {
      ids = [];
    }
    return ids.map((accountId) => ({ itemId: row.item_id, version: row.version, accountId }));
  });
  const flight = preflight({
    mode: input.mode,
    itemIds: input.itemIds,
    accountIds: input.accountIds,
    pieces,
    accounts: accounts.map((row) => ({ id: row.id, platform: row.platform, active: row.is_active === 1 })),
    live,
    timing: input.timing,
    overrides: input.overrides,
    options: input.options,
  });
  return {
    cadenceRevision: cadence?.updated_at ?? null,
    flight: await applyAgentGuards(sql, input, items, accounts, flight),
  };
}

/**
 * Extra checks for a function agent (a hire) that schedules or publishes (they run at prepare and again at execute, because execute
 * recomputes the plan and compares its hash). A row that fails moves from executable to blocked with a reason:
 * card_not_done (the deliverable's work card is missing or not Done), project_excluded (the project opted out of the
 * Library), platform_not_allowed (the network is not in this agent's permission). Staff, client and lead-agent actors are not
 * held to these.
 */
async function applyAgentGuards(
  sql: Sql,
  input: PrepareSocialPlanInput,
  items: ItemRecord[],
  accounts: { id: string; platform: string }[],
  flight: PreflightResult,
): Promise<PreflightResult> {
  const actor = input.actor;
  if (actor.kind !== "agent" || actor.role !== "hire" || (input.action !== "schedule" && input.action !== "publish_now") || flight.executable.length === 0) return flight;
  const deliverableOf = new Map(items.map((row) => [row.id, row.deliverable_id]));
  const deliverableIds = [...new Set(items.map((row) => row.deliverable_id))];
  const marks = deliverableIds.map(() => "?").join(", ");
  const cards = deliverableIds.length
    ? await sql.all<{ deliverable_id: string; status: string }>(
        `SELECT deliverable_id, status FROM tasks WHERE deliverable_id IN (${marks})`,
        deliverableIds,
      )
    : [];
  const cardsByDeliverable = new Map<string, string[]>();
  for (const card of cards) cardsByDeliverable.set(card.deliverable_id, [...(cardsByDeliverable.get(card.deliverable_id) ?? []), card.status]);
  const excluded = deliverableIds.length
    ? new Set(
        (
          await sql.all<{ id: string }>(
            `SELECT d.id FROM deliverables d WHERE d.id IN (${marks}) AND NOT (${libraryEligibleSql("d.project_id", "d.workspace_id")})`,
            deliverableIds,
          )
        ).map((row) => row.id),
      )
    : new Set<string>();
  const platformOf = new Map(accounts.map((row) => [row.id, row.platform]));
  const allowed = actor.platforms ? new Set(actor.platforms) : null;
  const executable: PreflightRow[] = [];
  const blocked = [...flight.blocked];
  for (const row of flight.executable) {
    const deliverableId = deliverableOf.get(row.itemId) ?? "";
    const statuses = cardsByDeliverable.get(deliverableId) ?? [];
    let reason: string | null = null;
    if (statuses.length === 0 || statuses.some((status) => status !== "done")) reason = "card_not_done";
    else if (excluded.has(deliverableId)) reason = "project_excluded";
    else if (allowed && !allowed.has(platformOf.get(row.accountId) ?? row.platform)) reason = "platform_not_allowed";
    if (reason) blocked.push({ ...row, eligible: false, reason });
    else executable.push(row);
  }
  return { ...flight, executable, blocked };
}

/** An empty executable list is unapproved only when every block is the approval check. */
function contentIsApproved(action: SocialAction, flight: PreflightResult): boolean {
  if (action !== "schedule" && action !== "publish_now") return true;
  if (flight.executable.length > 0) return true;
  return flight.blocked.some((row) => row.reason !== "unapproved");
}

function activityActor(actor: SocialActor): { kind: "staff" | "agent" | "system"; id: string; stored: ActorStorageKind } {
  const stored = actorStorageKind(actor);
  return { kind: stored === "client" ? "system" : stored, id: actor.id, stored };
}

export async function prepareSocialPlan(sql: Sql, input: PrepareSocialPlanInput): Promise<PreparedPlan> {
  const { flight, cadenceRevision } = await loadContext(sql, input);
  const hash = hashRows(flight, input, cadenceRevision);
  const contentApproved = contentIsApproved(input.action, flight);
  const policy =
    flight.reason === "selection_required"
      ? { authorization: "denied" as const, reasonCode: "selection_required", capabilities: [] }
      : evaluateSocialPolicy(input.actor, input.action, { contentApproved });
  const planId = crypto.randomUUID();
  const expiresAt = input.now + PLAN_TTL_MS;
  const request: StoredRequest = {
    mode: input.mode,
    itemIds: input.itemIds,
    accountIds: input.accountIds,
    timing: input.timing,
    overrides: input.overrides ?? [],
    options: input.options ?? [],
    action: input.action,
    timezone: input.timezone ?? "UTC",
    reasonCode: policy.reasonCode,
  };
  const actor = activityActor(input.actor);
  await sql.batch([
    {
      statement: `INSERT INTO social_publish_plans (
        id, organization_id, actor_kind, actor_id, action, request_json, rows_json, blocked_json, warnings_json,
        plan_hash, authorization, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        planId,
        input.organizationId,
        actor.stored,
        input.actor.id,
        input.action,
        JSON.stringify(request),
        JSON.stringify(flight.executable),
        JSON.stringify(flight.blocked),
        JSON.stringify(flight.warnings),
        hash,
        policy.authorization,
        expiresAt,
        input.now,
      ],
    },
    {
      statement: `INSERT INTO activities (
        id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
      ) VALUES (?, ?, 'social.plan.prepared', ?, ?, ?, ?, ?)`,
      params: [
        crypto.randomUUID(),
        input.organizationId,
        actor.kind,
        actor.id,
        "Prepared a social publishing plan.",
        JSON.stringify({
          planId,
          planHash: hash,
          action: input.action,
          actorKind: actor.stored,
          actorId: input.actor.id,
          executable: flight.executable.length,
          blocked: flight.blocked.length,
          authorization: policy.authorization,
          reasonCode: policy.reasonCode,
        }),
        input.now,
      ],
    },
  ]);
  await notePreflightAttention(
    sql,
    input.organizationId,
    flight.blocked.map((row) => ({ itemId: row.itemId, accountId: row.accountId, reason: row.reason })),
    input.now,
  );
  return {
    planId,
    planHash: hash,
    authorization: policy.authorization,
    reasonCode: policy.reasonCode,
    executable: flight.executable,
    blocked: flight.blocked,
    warnings: flight.warnings,
    expiresAt,
  };
}

const COMMAND_ACTIONS = new Set<SocialAction>(["connect", "disconnect", "cancel", "reschedule", "cadence_change", "retry"]);

export type PrepareCommandPlanInput = {
  organizationId: string;
  actor: SocialActor;
  action: SocialAction;
  now: number;
  platform?: string;
  redirectUrl?: string;
  postId?: string;
  accountId?: string;
  scheduledFor?: number;
  attentionId?: string;
  cadence?: CommandCadence;
  timezone?: string;
};

/** A non-content plan. Empty selections stay empty and are not expanded to every piece. */
export async function prepareCommandPlan(sql: Sql, input: PrepareCommandPlanInput): Promise<PreparedPlan> {
  if (!COMMAND_ACTIONS.has(input.action)) throw new PlanError(400, "invalid_action");
  const shaped: PrepareSocialPlanInput = {
    organizationId: input.organizationId,
    actor: input.actor,
    action: input.action,
    mode: "explicit",
    itemIds: [],
    accountIds: [],
    timing: { kind: "draft" },
    now: input.now,
    timezone: input.timezone ?? "UTC",
  };
  const { flight, cadenceRevision } = await loadContext(sql, shaped);
  const hash = hashRows(flight, shaped, cadenceRevision);
  const policy = evaluateSocialPolicy(input.actor, input.action);
  const planId = crypto.randomUUID();
  const expiresAt = input.now + PLAN_TTL_MS;
  const request: StoredRequest = {
    mode: "explicit",
    itemIds: [],
    accountIds: [],
    timing: { kind: "draft" },
    overrides: [],
    options: [],
    action: input.action,
    timezone: input.timezone ?? "UTC",
    ...(input.platform ? { platform: input.platform } : {}),
    ...(input.redirectUrl ? { redirectUrl: input.redirectUrl } : {}),
    ...(input.postId ? { postId: input.postId } : {}),
    ...(input.accountId ? { accountId: input.accountId } : {}),
    ...(input.scheduledFor != null ? { scheduledFor: input.scheduledFor } : {}),
    ...(input.attentionId ? { attentionId: input.attentionId } : {}),
    ...(input.cadence ? { cadence: input.cadence } : {}),
    reasonCode: policy.reasonCode,
  };
  const actor = activityActor(input.actor);
  await sql.batch([
    {
      statement: `INSERT INTO social_publish_plans (
        id, organization_id, actor_kind, actor_id, action, request_json, rows_json, blocked_json, warnings_json,
        plan_hash, authorization, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        planId,
        input.organizationId,
        actor.stored,
        input.actor.id,
        input.action,
        JSON.stringify(request),
        JSON.stringify(flight.executable),
        JSON.stringify(flight.blocked),
        JSON.stringify(flight.warnings),
        hash,
        policy.authorization,
        expiresAt,
        input.now,
      ],
    },
    {
      statement: `INSERT INTO activities (
        id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
      ) VALUES (?, ?, 'social.plan.prepared', ?, ?, ?, ?, ?)`,
      params: [
        crypto.randomUUID(),
        input.organizationId,
        actor.kind,
        actor.id,
        "Prepared a social publishing plan.",
        JSON.stringify({
          planId,
          planHash: hash,
          action: input.action,
          actorKind: actor.stored,
          actorId: input.actor.id,
          executable: flight.executable.length,
          blocked: flight.blocked.length,
          authorization: policy.authorization,
          reasonCode: policy.reasonCode,
        }),
        input.now,
      ],
    },
  ]);
  return {
    planId,
    planHash: hash,
    authorization: policy.authorization,
    reasonCode: policy.reasonCode,
    executable: flight.executable,
    blocked: flight.blocked,
    warnings: flight.warnings,
    expiresAt,
  };
}

export async function loadExecutablePlan(
  sql: Sql,
  input: { organizationId: string; actor: SocialActor; planId: string; planHash: string; now: number },
): Promise<LoadedPlan> {
  const row = await sql.get<PlanRow>(
    `SELECT id, organization_id, actor_kind, actor_id, action, request_json, rows_json, blocked_json, warnings_json,
       plan_hash, authorization, expires_at, executed_at
     FROM social_publish_plans WHERE id = ?`,
    [input.planId],
  );
  if (!row || row.organization_id !== input.organizationId) throw new PlanError(404, "not_found");
  const actorKind = actorStorageKind(input.actor);
  if (row.actor_kind !== actorKind || row.actor_id !== input.actor.id) throw new PlanError(409, "stale_plan");
  if (row.plan_hash !== input.planHash) throw new PlanError(409, "stale_plan");
  if (row.expires_at <= input.now || row.executed_at != null) throw new PlanError(409, "stale_plan");
  if (row.authorization === "denied") throw new PlanError(403, "denied");
  const request = JSON.parse(row.request_json) as StoredRequest;
  const { flight, cadenceRevision } = await loadContext(sql, {
    organizationId: row.organization_id,
    actor: input.actor,
    action: row.action,
    mode: request.mode,
    itemIds: request.itemIds,
    accountIds: request.accountIds,
    timing: request.timing,
    overrides: request.overrides,
    options: request.options,
    timezone: request.timezone,
    now: input.now,
  });
  const liveHash = hashRows(flight, {
    organizationId: row.organization_id,
    actor: input.actor,
    action: row.action,
    mode: request.mode,
    itemIds: request.itemIds,
    accountIds: request.accountIds,
    timing: request.timing,
    overrides: request.overrides,
    options: request.options,
    now: input.now,
  }, cadenceRevision);
  if (liveHash !== row.plan_hash) {
    await noteStalePlan(sql, row.organization_id, row.id, input.now);
    throw new PlanError(409, "stale_plan");
  }
  return {
    planId: row.id,
    planHash: row.plan_hash,
    authorization: row.authorization,
    reasonCode: row.authorization,
    action: row.action,
    request,
    actorKind: row.actor_kind,
    actorId: row.actor_id,
    executable: flight.executable,
    blocked: flight.blocked,
    warnings: flight.warnings,
    expiresAt: row.expires_at,
  };
}
