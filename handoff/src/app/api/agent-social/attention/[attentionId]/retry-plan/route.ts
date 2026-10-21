import { postRetryPlan } from "@/lib/social-agent-api";
import { agentSocialSession, invalidBody, readJson, unauthorized, writeResponse } from "../../../http";

export const dynamic = "force-dynamic";

/** Plan a retry. Execution never creates a second live post. */
export async function POST(request: Request, context: { params: Promise<{ attentionId: string }> }) {
  const { sql, agent } = await agentSocialSession(request);
  if (!agent) return unauthorized();
  const body = await readJson(request);
  if (!body) return invalidBody();
  const { attentionId } = await context.params;
  return writeResponse(await postRetryPlan(sql, agent, attentionId, body, Date.now()));
}