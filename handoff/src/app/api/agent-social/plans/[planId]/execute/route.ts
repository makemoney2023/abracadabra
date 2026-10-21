import { executeAgentSocialPlan } from "@/lib/social-agent-api";
import { agentSocialSession, invalidBody, readJson, unauthorized, writeResponse } from "../../../http";

export const dynamic = "force-dynamic";

/** Run a stored plan. Confirmation is required before a public or destructive action. */
export async function POST(request: Request, context: { params: Promise<{ planId: string }> }) {
  const { sql, agent } = await agentSocialSession(request);
  if (!agent) return unauthorized();
  const body = await readJson(request);
  if (!body) return invalidBody();
  const { planId } = await context.params;
  return writeResponse(await executeAgentSocialPlan(sql, agent, planId, body, Date.now()));
}
