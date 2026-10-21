import { postConnectPlan } from "@/lib/social-agent-api";
import { agentSocialSession, invalidBody, readJson, unauthorized, writeResponse } from "../http";

export const dynamic = "force-dynamic";

/** Plan a human OAuth connect. The link is returned only when the plan is executed. */
export async function POST(request: Request) {
  const { sql, agent } = await agentSocialSession(request);
  if (!agent) return unauthorized();
  const body = await readJson(request);
  if (!body) return invalidBody();
  return writeResponse(await postConnectPlan(sql, agent, body, Date.now()));
}
