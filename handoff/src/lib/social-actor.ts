import type { Assignment } from "./agent-work-filing";
import type { AgentPublishMode, SocialActor, SocialCapability } from "./social-policy";

/** Build the agent actor the policy evaluator expects. A missing assignment stays unassigned. */
export function agentActor(input: {
  agentId: string;
  assignment: Assignment | null;
  mode?: AgentPublishMode;
  grant?: SocialCapability[];
  revoke?: SocialCapability[];
  platforms?: string[] | null;
}): SocialActor {
  return {
    kind: "agent",
    id: input.agentId,
    role: input.assignment?.role ?? "hire",
    assigned: input.assignment !== null,
    mode: input.mode ?? "draft",
    grant: input.grant ?? [],
    revoke: input.revoke ?? [],
    platforms: input.platforms ?? null,
  };
}
