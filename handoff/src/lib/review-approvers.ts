import type { AgentPrincipal } from "@/lib/agent-work-filing";

/**
 * Agents other than Client Services that may approve a card from Waiting on Client Services to Done
 * (POST /api/agent-board/tasks/<id> { action: "approve" }), per client. HQ card 0ff14a37, approved by Christopher on
 * Oct 25, 2026 at 8:14 PM ET. This is code, not data, on purpose: widening it means a reviewed PR.
 *
 * Both must hold: the client is listed here for the agent AND the agent is assigned to that client now (an ended
 * assignment or a revoked agent loses it). Approve only: no send back, no other moves, no merge or deploy.
 * Every other agent, lead or hire, still gets 403 and Client Services' own endpoint is unchanged.
 */
export const REVIEW_APPROVERS: Readonly<Record<string, readonly string[]>> = {
  "scrum-master": [
    "17c4b7b6-1def-4098-a706-9ceacae390de", // Abracadabra (abra-ca-dabra.app)
    "8f26ca67-f722-4826-a964-63f94cc373dc", // Renew Implants (renewimplants.ca)
    "c76df001-6a5a-4ddd-a71d-1caadf8c61e9", // Strong Foam Insulation Inc. (strongfoam.com)
    "ee92cb98-b8ab-4a6c-b186-033a9a060de2", // LioCorr Holdings Inc. (liocorr.com)
  ],
};

/** True when this agent may approve review cards on that client: listed above and assigned to the client now. */
export function canApproveReviews(agent: AgentPrincipal, organizationId: string | null): boolean {
  if (!organizationId) return false;
  const allowed = REVIEW_APPROVERS[agent.agentId];
  if (!allowed || !allowed.includes(organizationId)) return false;
  return agent.assignments.some((row) => row.organizationId === organizationId);
}
