import { getAgentSocialPlan } from "@/lib/social-queries";
import { agentSocialSession, socialResponse, unauthorized } from "../../http";

export const dynamic = "force-dynamic";

/** One prepared plan and its execution outcome, only for an assigned client. */
export async function GET(request: Request, context: { params: Promise<{ planId: string }> }) {
  const { sql, agent } = await agentSocialSession(request);
  if (!agent) return unauthorized();
  const { planId } = await context.params;
  return socialResponse(await getAgentSocialPlan(sql, agent, planId));
}
