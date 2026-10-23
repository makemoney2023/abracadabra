export const SOCIAL_CAPABILITIES = [
  "social.read",
  "social.variant.write",
  "social.draft",
  "social.schedule",
  "social.publish_now",
  "social.schedule.manage",
  "social.cadence.manage",
  "social.account.connect",
  "social.account.disconnect",
  "social.failure.retry",
  "social.analytics.read",
] as const;

export type SocialCapability = (typeof SOCIAL_CAPABILITIES)[number];

export const AGENT_MODES = ["observe", "draft", "schedule_approved", "managed"] as const;
export type AgentPublishMode = (typeof AGENT_MODES)[number];

export type SocialAction =
  | "read"
  | "variant_write"
  | "save_draft"
  | "prepare_schedule"
  | "schedule"
  | "reschedule"
  | "cancel"
  | "publish_now"
  | "retry"
  | "cadence_change"
  | "connect"
  | "disconnect"
  | "policy_change";

export type SocialActor =
  | { kind: "staff"; id: string }
  | { kind: "client_owner"; id: string }
  | { kind: "client_member"; id: string }
  | { kind: "system"; id: string }
  | {
      kind: "agent";
      id: string;
      role: "lead" | "hire";
      assigned: boolean;
      mode: AgentPublishMode;
      grant: SocialCapability[];
      revoke: SocialCapability[];
      /** Networks this agent may post to. null: no limit (a client lead). A hire carries its permission row's list. */
      platforms?: string[] | null;
    };

export type PolicyResult = {
  authorization: "allowed" | "confirmation_required" | "denied";
  reasonCode: string;
  capabilities: SocialCapability[];
};

const LEAD = new Set<SocialCapability>(SOCIAL_CAPABILITIES);
const HIRE = new Set<SocialCapability>([
  "social.read",
  "social.analytics.read",
  "social.variant.write",
  "social.draft",
  "social.schedule",
  "social.schedule.manage",
  "social.failure.retry",
]);
const MEMBER = new Set<SocialCapability>(["social.read", "social.analytics.read"]);
const OWNER = new Set<SocialCapability>(["social.read", "social.analytics.read", "social.account.connect"]);
const SYSTEM = new Set<SocialCapability>([
  "social.read",
  "social.analytics.read",
  "social.draft",
  "social.schedule",
  "social.failure.retry",
]);

const ACTION_CAPABILITY: Partial<Record<SocialAction, SocialCapability>> = {
  read: "social.read",
  variant_write: "social.variant.write",
  save_draft: "social.draft",
  prepare_schedule: "social.draft",
  schedule: "social.schedule",
  reschedule: "social.schedule.manage",
  cancel: "social.schedule.manage",
  publish_now: "social.publish_now",
  retry: "social.failure.retry",
  cadence_change: "social.cadence.manage",
  connect: "social.account.connect",
  disconnect: "social.account.disconnect",
};

const CONFIRM = new Set<SocialAction>(["publish_now", "disconnect", "cancel", "cadence_change", "connect"]);

function roleSet(actor: Extract<SocialActor, { kind: "agent" }>): Set<SocialCapability> {
  return actor.role === "lead" ? LEAD : HIRE;
}

function heldBeforeMode(actor: SocialActor): Set<SocialCapability> {
  if (actor.kind === "staff") return new Set(SOCIAL_CAPABILITIES);
  if (actor.kind === "client_member") return new Set(MEMBER);
  if (actor.kind === "client_owner") return new Set(OWNER);
  if (actor.kind === "system") return new Set(SYSTEM);
  const caps = new Set(roleSet(actor));
  for (const grant of actor.grant) caps.add(grant);
  for (const revoke of actor.revoke) caps.delete(revoke);
  return caps;
}

function visibleCapabilities(actor: SocialActor, held: Set<SocialCapability>): SocialCapability[] {
  const ordered = SOCIAL_CAPABILITIES.filter((cap) => held.has(cap));
  if (actor.kind !== "agent") return ordered;
  if (actor.mode === "observe") return ordered.filter((cap) => cap === "social.read" || cap === "social.analytics.read");
  if (actor.mode === "draft") return ordered.filter((cap) => cap !== "social.schedule" && cap !== "social.failure.retry");
  if (actor.mode === "schedule_approved") return ordered.filter((cap) => cap !== "social.failure.retry");
  return ordered;
}

function modeDenial(mode: AgentPublishMode, action: SocialAction): string | null {
  if (action === "read" || action === "policy_change") return null;
  if (mode === "observe") return "policy_observe";
  if (mode === "draft" && (action === "schedule" || action === "reschedule" || action === "retry")) return "policy_draft";
  if (mode === "schedule_approved" && (action === "reschedule" || action === "retry")) return "policy_mode";
  return null;
}

function wasGrantedThenRevoked(actor: Extract<SocialActor, { kind: "agent" }>, capability: SocialCapability): boolean {
  if (!actor.revoke.includes(capability)) return false;
  return roleSet(actor).has(capability) || actor.grant.includes(capability);
}

/** Pure authorization. Feature flags stay at the route. Mode never hides a missing role capability. */
export function evaluateSocialPolicy(
  actor: SocialActor,
  action: SocialAction,
  options?: { contentApproved?: boolean },
): PolicyResult {
  const held = heldBeforeMode(actor);
  const capabilities = visibleCapabilities(actor, held);
  const deny = (reasonCode: string): PolicyResult => ({ authorization: "denied", reasonCode, capabilities });

  if (actor.kind === "agent" && !actor.assigned) return deny("not_assigned");
  if (actor.kind === "agent" && action === "policy_change") return deny("agent_cannot_raise_policy");
  if ((action === "schedule" || action === "publish_now") && options?.contentApproved !== true) return deny("unapproved");

  const needed = ACTION_CAPABILITY[action];
  if (needed) {
    if (actor.kind === "agent" && wasGrantedThenRevoked(actor, needed)) return deny("capability_revoked");
    if (!held.has(needed)) return deny("role_denied");
  } else if (action === "policy_change" && actor.kind !== "staff") {
    return deny("role_denied");
  }

  if (actor.kind === "agent") {
    const modeReason = modeDenial(actor.mode, action);
    if (modeReason) return deny(modeReason);
  }

  // A function agent (a hire) can ask to move a post, but staff approve it. Leads, staff and the client's people are not held to this.
  if (CONFIRM.has(action) || (actor.kind === "agent" && actor.role === "hire" && action === "reschedule")) {
    return { authorization: "confirmation_required", reasonCode: "confirmation_required", capabilities };
  }
  return { authorization: "allowed", reasonCode: "allowed", capabilities };
}
