import type { Sql } from "@/db/sql";
import { assessSocialRetry, recoverSocialAttention } from "./social-attention";
import type { Caller } from "./authz";
import { actorStorageKind, loadExecutablePlan, PlanError, CONFIRM_SHORT_TTL_MS, type ActorStorageKind, type LoadedPlan } from "./social-plans";
import type { SocialActor } from "./social-policy";
import type { ObjectStore } from "./store/objects";
import { CONNECT_PLATFORMS, isEligibleSocialPlatform, type ConnectPlatform, type ZernioClient } from "./zernio";

/** Present only on callers created by the command layer. Direct staff callers stay staff-gated. */
export const SOCIAL_COMMAND_GATE = Symbol.for("handoff.social.command");

export type CommandGate = { kind: ActorStorageKind; id: string };

export type GatedCaller = Caller & { [SOCIAL_COMMAND_GATE]?: CommandGate };

export function commandCaller(actor: SocialActor): GatedCaller {
  const gate: CommandGate = { kind: actorStorageKind(actor), id: actor.id };
  const caller: GatedCaller =
    actor.kind === "staff"
      ? { userId: actor.id, staff: { superAdmin: false }, operatorOf: [], memberships: [] }
      : { userId: null, staff: null, operatorOf: [], memberships: [] };
  caller[SOCIAL_COMMAND_GATE] = gate;
  return caller;
}

export function readCommandGate(caller: Caller): CommandGate | undefined {
  return (caller as GatedCaller)[SOCIAL_COMMAND_GATE];
}

export function commandAuthorized(caller: Caller): boolean {
  return Boolean(caller.staff) || Boolean(readCommandGate(caller));
}

export type PlanTargetOutcome = "succeeded" | "failed" | "uncertain" | "not_attempted" | "scheduled";

export type ExecutePlanResult = {
  status: 200 | 202;
  duplicate: boolean;
  planId: string;
  outcomes: { itemId: string; accountId: string; outcome: PlanTargetOutcome; postId?: string; error?: string }[];
  oauthUrl?: string;
};

function activityActorKind(kind: ActorStorageKind): "staff" | "agent" | "system" {
  return kind === "client" ? "system" : kind;
}

export async function issueConfirmation(
  sql: Sql,
  input: { planId: string; planHash: string; actor: SocialActor; now: number; note?: string },
): Promise<{ id: string; expiresAt: number }> {
  const row = await sql.get<{
    actor_kind: ActorStorageKind;
    actor_id: string;
    action: string;
    plan_hash: string;
    authorization: string;
    expires_at: number;
    executed_at: number | null;
  }>(
    `SELECT actor_kind, actor_id, action, plan_hash, authorization, expires_at, executed_at
     FROM social_publish_plans WHERE id = ?`,
    [input.planId],
  );
  if (!row) throw new PlanError(404, "not_found");
  const kind = actorStorageKind(input.actor);
  if (row.actor_kind !== kind || row.actor_id !== input.actor.id || row.plan_hash !== input.planHash) {
    throw new PlanError(409, "stale_plan");
  }
  if (row.expires_at <= input.now || row.executed_at != null) throw new PlanError(409, "stale_plan");
  if (row.authorization === "denied") throw new PlanError(403, "denied");
  const expiresAt =
    row.action === "publish_now" || row.action === "disconnect"
      ? Math.min(row.expires_at, input.now + CONFIRM_SHORT_TTL_MS)
      : row.expires_at;
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO social_confirmations (
       id, plan_id, plan_hash, action, approver_kind, approver_id, note, expires_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.planId, input.planHash, row.action, kind, input.actor.id, input.note ?? null, expiresAt, input.now],
  );
  return { id, expiresAt };
}

async function consumeConfirmation(
  sql: Sql,
  input: { confirmationId: string; planId: string; planHash: string; action: string; now: number },
): Promise<void> {
  const claim = crypto.randomUUID();
  await sql.run(
    `UPDATE social_confirmations SET used_at = ?, note = COALESCE(note, '') || ?
     WHERE id = ? AND plan_id = ? AND plan_hash = ? AND action = ? AND used_at IS NULL AND expires_at > ?`,
    [input.now, `\n${claim}`, input.confirmationId, input.planId, input.planHash, input.action, input.now],
  );
  const row = await sql.get<{ note: string | null }>("SELECT note FROM social_confirmations WHERE id = ?", [input.confirmationId]);
  if (!row?.note?.includes(claim)) throw new PlanError(403, "confirmation_required");
}

async function claimPlan(sql: Sql, planId: string, now: number): Promise<void> {
  const claim = crypto.randomUUID();
  await sql.run(
    "UPDATE social_publish_plans SET executed_at = ?, result_json = ? WHERE id = ? AND executed_at IS NULL",
    [now, JSON.stringify({ claim }), planId],
  );
  const stored = await sql.get<{ result_json: string | null }>("SELECT result_json FROM social_publish_plans WHERE id = ?", [planId]);
  const parsed = stored?.result_json ? (JSON.parse(stored.result_json) as { claim?: string }) : null;
  if (parsed?.claim !== claim) throw new PlanError(409, "stale_plan");
}

export async function executeSocialPlan(
  sql: Sql,
  input: {
    organizationId: string;
    actor: SocialActor;
    planId: string;
    planHash: string;
    externalId: string;
    confirmationId?: string;
    now: number;
    zernio: ZernioClient;
    store: ObjectStore;
  },
): Promise<ExecutePlanResult> {
  if (!input.externalId.trim()) throw new PlanError(400, "external_id_required");
  const kind = actorStorageKind(input.actor);
  const prior = await sql.get<{ response_json: string }>(
    "SELECT response_json FROM social_action_idempotency WHERE actor_kind = ? AND actor_id = ? AND external_id = ?",
    [kind, input.actor.id, input.externalId],
  );
  if (prior) {
    const stored = JSON.parse(prior.response_json) as ExecutePlanResult;
    return { ...stored, duplicate: true };
  }

  const plan = await loadExecutablePlan(sql, input);
  const sendable = plan.action === "schedule" || plan.action === "publish_now" || plan.action === "save_draft";
  const command = plan.action === "connect" || plan.action === "disconnect" || plan.action === "cancel" || plan.action === "reschedule" || plan.action === "cadence_change" || plan.action === "retry";
  if (!sendable && !command) throw new PlanError(403, "role_denied");
  if (plan.authorization === "confirmation_required") {
    if (!input.confirmationId) throw new PlanError(403, "confirmation_required");
    await consumeConfirmation(sql, {
      confirmationId: input.confirmationId,
      planId: plan.planId,
      planHash: plan.planHash,
      action: plan.action,
      now: input.now,
    });
  }
  await claimPlan(sql, plan.planId, input.now);

  if (command) {
    const ran = await runCommand(sql, input.zernio, input.store, input.actor, input.organizationId, plan, input.now);
    return finishExecution(sql, input, plan, ran.outcomes, ran.oauthUrl);
  }

  const outcomes: ExecutePlanResult["outcomes"] = [];
  const mode = plan.action === "publish_now" ? "now" : plan.action === "save_draft" ? "draft" : "scheduled";
  const { sendPiece } = await import("./social");
  const caller = commandCaller(input.actor);
  for (const row of plan.executable) {
    const piece = await sql.get<{ deliverable_id: string }>(
      `SELECT i.deliverable_id FROM deliverable_items i
       JOIN deliverables d ON d.id = i.deliverable_id
       WHERE i.id = ? AND i.version = ? AND d.organization_id = ?`,
      [row.itemId, row.version, input.organizationId],
    );
    if (!piece) {
      outcomes.push({ itemId: row.itemId, accountId: row.accountId, outcome: "failed", error: "missing_piece" });
      continue;
    }
    const sent = await sendPiece(
      sql,
      input.zernio,
      input.store,
      caller,
      {
        deliverableId: piece.deliverable_id,
        itemId: row.itemId,
        accountIds: [row.accountId],
        mode,
        postType: row.postType,
        scheduledFor: row.scheduleAt,
        timezone: plan.request.timezone || "UTC",
        platformOverrides: row.options,
      },
      input.now,
    );
    if (!sent.ok && sent.uncertain) {
      outcomes.push({ itemId: row.itemId, accountId: row.accountId, outcome: "uncertain", postId: sent.postId, error: sent.error });
      continue;
    }
    if (!sent.ok) {
      outcomes.push({
        itemId: row.itemId,
        accountId: row.accountId,
        outcome: "failed",
        ...(sent.postId ? { postId: sent.postId } : {}),
        error: sent.error,
      });
      continue;
    }
    const outcome = mode === "now" && sent.status !== "scheduled" && sent.status !== "draft" ? "succeeded" : "scheduled";
    outcomes.push({ itemId: row.itemId, accountId: row.accountId, outcome, postId: sent.postId });
  }
  for (const row of plan.blocked) {
    outcomes.push({
      itemId: row.itemId,
      accountId: row.accountId,
      outcome: "not_attempted",
      ...(row.reason ? { error: row.reason } : {}),
    });
  }
  return finishExecution(sql, input, plan, outcomes);
}

type CommandRun = { outcomes: ExecutePlanResult["outcomes"]; oauthUrl?: string };

async function finishExecution(
  sql: Sql,
  input: {
    organizationId: string;
    actor: SocialActor;
    externalId: string;
    confirmationId?: string;
    now: number;
  },
  plan: LoadedPlan,
  outcomes: ExecutePlanResult["outcomes"],
  oauthUrl?: string,
): Promise<ExecutePlanResult> {
  const kind = actorStorageKind(input.actor);
  const result: ExecutePlanResult = {
    status: outcomes.some((row) => row.outcome === "uncertain") ? 202 : 200,
    duplicate: false,
    planId: plan.planId,
    outcomes,
    ...(oauthUrl ? { oauthUrl } : {}),
  };
  await sql.run("UPDATE social_publish_plans SET result_json = ? WHERE id = ?", [JSON.stringify(result), plan.planId]);
  await sql.run(
    `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, ?, 'social.plan.executed', ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      input.organizationId,
      activityActorKind(kind),
      input.actor.id,
      "Executed a social publishing plan.",
      JSON.stringify({
        planId: plan.planId,
        action: plan.action,
        actorKind: kind,
        actorId: input.actor.id,
        externalId: input.externalId,
        confirmationId: input.confirmationId ?? null,
        outcomes: outcomes.map(({ itemId, accountId, outcome, postId }) => ({ itemId, accountId, outcome, postId })),
      }),
      input.now,
    ],
  );
  try {
    await sql.run(
      `INSERT INTO social_action_idempotency (
         id, actor_kind, actor_id, external_id, action, resource_id, response_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), kind, input.actor.id, input.externalId, plan.action, plan.planId, JSON.stringify(result), input.now],
    );
  } catch (error) {
    const raced = await sql.get<{ response_json: string }>(
      "SELECT response_json FROM social_action_idempotency WHERE actor_kind = ? AND actor_id = ? AND external_id = ?",
      [kind, input.actor.id, input.externalId],
    );
    if (!raced) throw error;
    const stored = JSON.parse(raced.response_json) as ExecutePlanResult;
    return { ...stored, duplicate: true };
  }
  return result;
}

/** Account, cadence, and recovery commands. A retry never creates a second live post. */
async function runCommand(
  sql: Sql,
  zernio: ZernioClient,
  store: ObjectStore,
  actor: SocialActor,
  organizationId: string,
  plan: LoadedPlan,
  now: number,
): Promise<CommandRun> {
  const request = plan.request;
  const failed = (error: string, accountId = request.accountId ?? "", postId?: string): CommandRun => ({
    outcomes: [{ itemId: "", accountId, outcome: "failed", error, ...(postId ? { postId } : {}) }],
  });
  try {
    if (plan.action === "connect") {
      const org = await sql.get<{ id: string; name: string }>("SELECT id, name FROM organizations WHERE id = ?", [organizationId]);
      if (!org) return failed("not_found");
      const platform = request.platform ?? "";
      if (!isEligibleSocialPlatform(platform) || !(CONNECT_PLATFORMS as readonly string[]).includes(platform)) return failed("invalid_platform");
      const { connectLink } = await import("./social");
      const oauthUrl = await connectLink(sql, zernio, org, platform as ConnectPlatform, request.redirectUrl ?? "", now);
      return { outcomes: [], oauthUrl };
    }
    if (plan.action === "disconnect") {
      const accountId = request.accountId ?? "";
      const { disconnectSocialAccount } = await import("./social");
      const removed = await disconnectSocialAccount(sql, zernio, organizationId, accountId);
      if (!removed) return failed("not_found", accountId);
      return { outcomes: [{ itemId: "", accountId, outcome: "succeeded" }] };
    }
    if (plan.action === "cancel") {
      const postId = request.postId ?? "";
      const { cancelSocialPost } = await import("./social");
      const cancelled = await cancelSocialPost(sql, zernio, commandCaller(actor), postId, now);
      if (!cancelled.ok) return failed("not_recoverable", "", postId);
      return { outcomes: [{ itemId: "", accountId: "", outcome: "succeeded", postId }] };
    }
    if (plan.action === "reschedule") {
      const postId = request.postId ?? "";
      const { rescheduleSocialPost } = await import("./social");
      const moved = await rescheduleSocialPost(
        sql,
        zernio,
        commandCaller(actor),
        { postId, scheduledFor: request.scheduledFor ?? 0, timezone: request.timezone || "UTC" },
        now,
      );
      if (!moved.ok) return failed("not_recoverable", "", postId);
      return { outcomes: [{ itemId: "", accountId: "", outcome: "scheduled", postId }] };
    }
    if (plan.action === "cadence_change") {
      if (!request.cadence) return failed("invalid_cadence");
      const { saveAutopost } = await import("./social-autopost");
      const saved = await saveAutopost(sql, commandCaller(actor), organizationId, request.cadence, now);
      if (!saved.ok) return failed("not_recoverable", request.cadence.accountIds[0] ?? "");
      return { outcomes: [{ itemId: "", accountId: request.cadence.accountIds[0] ?? "", outcome: "succeeded" }] };
    }
    if (plan.action === "retry") {
      const assessed = await assessSocialRetry(sql, organizationId, request.attentionId ?? "");
      if (!assessed.found) return { outcomes: [] };
      const recovered = await recoverSocialAttention(sql, zernio, store, actor, organizationId, request.attentionId ?? "", now);
      return { outcomes: [recovered] };
    }
    return failed("invalid_action");
  } catch (error) {
    if (error instanceof PlanError) throw error;
    return failed("provider_failed");
  }
}
