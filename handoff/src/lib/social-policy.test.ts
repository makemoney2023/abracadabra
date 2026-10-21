import { describe, expect, it } from "vitest";
import { assignmentFor, type AgentPrincipal } from "./agent-work-filing";
import {
  SOCIAL_CAPABILITIES,
  evaluateSocialPolicy,
  type AgentPublishMode,
  type SocialActor,
  type SocialCapability,
} from "./social-policy";

const lead = (mode: AgentPublishMode, extra?: Partial<Extract<SocialActor, { kind: "agent" }>>): SocialActor => ({
  kind: "agent",
  id: "agent-lead",
  role: "lead",
  assigned: true,
  mode,
  grant: [],
  revoke: [],
  ...extra,
});

const hire = (mode: AgentPublishMode, extra?: Partial<Extract<SocialActor, { kind: "agent" }>>): SocialActor => ({
  kind: "agent",
  id: "agent-hire",
  role: "hire",
  assigned: true,
  mode,
  grant: [],
  revoke: [],
  ...extra,
});

const staff: SocialActor = { kind: "staff", id: "staff-1" };
const owner: SocialActor = { kind: "client_owner", id: "owner-1" };
const member: SocialActor = { kind: "client_member", id: "member-1" };
const system: SocialActor = { kind: "system", id: "system" };

function granted(...caps: SocialCapability[]) {
  return { grant: caps };
}

describe("evaluateSocialPolicy", () => {
  it("lets staff schedule approved work and confirms destructive actions", () => {
    expect(evaluateSocialPolicy(staff, "schedule", { contentApproved: true })).toMatchObject({
      authorization: "allowed",
      reasonCode: "allowed",
    });
    expect(evaluateSocialPolicy(staff, "publish_now", { contentApproved: true }).authorization).toBe("confirmation_required");
    expect(evaluateSocialPolicy(staff, "disconnect").authorization).toBe("confirmation_required");
    expect(evaluateSocialPolicy(staff, "cancel").authorization).toBe("confirmation_required");
    expect(evaluateSocialPolicy(staff, "cadence_change").authorization).toBe("confirmation_required");
    expect(evaluateSocialPolicy(staff, "connect").authorization).toBe("confirmation_required");
    expect(evaluateSocialPolicy(staff, "policy_change").authorization).toBe("allowed");
    expect(evaluateSocialPolicy(staff, "read").capabilities).toEqual([...SOCIAL_CAPABILITIES]);
  });

  it("denies unapproved schedule and post-now for every actor", () => {
    for (const actor of [staff, system, lead("managed"), hire("schedule_approved")]) {
      expect(evaluateSocialPolicy(actor, "schedule", { contentApproved: false }).reasonCode).toBe("unapproved");
      expect(evaluateSocialPolicy(actor, "publish_now").reasonCode).toBe("unapproved");
    }
  });

  it("limits client members to reads and owners to confirmed connects", () => {
    expect(evaluateSocialPolicy(member, "read").authorization).toBe("allowed");
    expect(evaluateSocialPolicy(member, "variant_write").reasonCode).toBe("role_denied");
    expect(evaluateSocialPolicy(owner, "connect")).toMatchObject({
      authorization: "confirmation_required",
      reasonCode: "confirmation_required",
    });
    expect(evaluateSocialPolicy(owner, "disconnect").reasonCode).toBe("role_denied");
    expect(evaluateSocialPolicy(owner, "schedule", { contentApproved: true }).reasonCode).toBe("role_denied");
    expect(evaluateSocialPolicy(owner, "cadence_change").reasonCode).toBe("role_denied");
    expect(evaluateSocialPolicy(owner, "publish_now", { contentApproved: true }).reasonCode).toBe("role_denied");
  });

  it("lets the system schedule and retry approved work, and denies publishing controls", () => {
    expect(evaluateSocialPolicy(system, "schedule", { contentApproved: true }).authorization).toBe("allowed");
    expect(evaluateSocialPolicy(system, "retry").authorization).toBe("allowed");
    expect(evaluateSocialPolicy(system, "publish_now", { contentApproved: true }).reasonCode).toBe("role_denied");
    expect(evaluateSocialPolicy(system, "disconnect").reasonCode).toBe("role_denied");
    expect(evaluateSocialPolicy(system, "cadence_change").reasonCode).toBe("role_denied");
  });

  it("requires an assignment and refuses agent policy changes", () => {
    expect(evaluateSocialPolicy(lead("draft", { assigned: false }), "read").reasonCode).toBe("not_assigned");
    expect(evaluateSocialPolicy(hire("managed"), "policy_change").reasonCode).toBe("agent_cannot_raise_policy");
  });

  it("applies observe, draft, schedule_approved, and managed modes", () => {
    expect(evaluateSocialPolicy(lead("observe"), "read").authorization).toBe("allowed");
    expect(evaluateSocialPolicy(lead("observe"), "variant_write").reasonCode).toBe("policy_observe");
    expect(evaluateSocialPolicy(lead("draft"), "prepare_schedule").authorization).toBe("allowed");
    expect(evaluateSocialPolicy(lead("draft"), "save_draft").authorization).toBe("allowed");
    expect(evaluateSocialPolicy(lead("draft"), "schedule", { contentApproved: true }).reasonCode).toBe("policy_draft");
    expect(evaluateSocialPolicy(lead("draft"), "cancel")).toMatchObject({
      authorization: "confirmation_required",
      reasonCode: "confirmation_required",
    });
    expect(evaluateSocialPolicy(lead("draft"), "publish_now", { contentApproved: true }).authorization).toBe("confirmation_required");
    expect(evaluateSocialPolicy(hire("schedule_approved"), "schedule", { contentApproved: true }).authorization).toBe("allowed");
    expect(evaluateSocialPolicy(lead("schedule_approved"), "reschedule").reasonCode).toBe("policy_mode");
    expect(evaluateSocialPolicy(lead("schedule_approved"), "retry").reasonCode).toBe("policy_mode");
    expect(evaluateSocialPolicy(lead("managed"), "reschedule").authorization).toBe("allowed");
    expect(evaluateSocialPolicy(hire("managed"), "retry").authorization).toBe("allowed");
    expect(evaluateSocialPolicy(lead("managed"), "disconnect").authorization).toBe("confirmation_required");
  });

  it("keeps hire off cadence, connect, disconnect, and post-now unless granted", () => {
    expect(evaluateSocialPolicy(hire("managed"), "cadence_change").reasonCode).toBe("role_denied");
    expect(evaluateSocialPolicy(hire("managed"), "connect").reasonCode).toBe("role_denied");
    expect(evaluateSocialPolicy(hire("managed"), "disconnect").reasonCode).toBe("role_denied");
    expect(evaluateSocialPolicy(hire("managed"), "publish_now", { contentApproved: true }).reasonCode).toBe("role_denied");
    expect(evaluateSocialPolicy(hire("draft", granted("social.publish_now")), "publish_now", { contentApproved: true })).toMatchObject({
      authorization: "confirmation_required",
      reasonCode: "confirmation_required",
    });
    expect(evaluateSocialPolicy(hire("managed", granted("social.cadence.manage")), "cadence_change").authorization).toBe(
      "confirmation_required",
    );
  });

  it("reports a revoke separately from a capability the role never had", () => {
    const revoked = evaluateSocialPolicy(hire("draft", { revoke: ["social.read"] }), "read");
    expect(revoked.reasonCode).toBe("capability_revoked");
    expect(revoked.capabilities).not.toContain("social.read");
    const draftCaps = evaluateSocialPolicy(hire("draft"), "read").capabilities;
    expect(draftCaps).toContain("social.draft");
    expect(draftCaps).toContain("social.schedule.manage");
    expect(draftCaps).not.toContain("social.schedule");
    expect(draftCaps).not.toContain("social.failure.retry");
  });
});

describe("assignmentFor", () => {
  it("returns the assignment for the client and nothing for another client", () => {
    const agent: AgentPrincipal = {
      agentId: "a1",
      label: "Ada",
      assignments: [{ organizationId: "org-1", workspaceId: "ws-1", projectId: null, role: "hire" }],
    };
    expect(assignmentFor(agent, "org-1")?.role).toBe("hire");
    expect(assignmentFor(agent, "org-2")).toBeNull();
  });
});
