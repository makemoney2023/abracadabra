import { postCancelPlan } from "@/lib/social-agent-api";
import { agentSocialSession, invalidBody, readJson, unauthorized, writeResponse } from "../../../http";

export const dynamic = "force-dynamic";

/** Plan cancelling one scheduled post or draft. */
export async function POST(request: Request, context: { params: Promise<{ postId: string }> }) {
  const { sql, agent } = await agentSocialSession(request);
  if (!agent) return unauthorized();
  const body = await readJson(request);
  if (!body) return invalidBody();
  const { postId } = await context.params;
  return writeResponse(await postCancelPlan(sql, agent, postId, body, Date.now()));
}
