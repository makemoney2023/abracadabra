import { postDisconnectPlan } from "@/lib/social-agent-api";
import { agentSocialSession, invalidBody, readJson, unauthorized, writeResponse } from "../http";

export const dynamic = "force-dynamic";

/** Plan disconnecting one account. Execution still needs a confirmation. */
export async function POST(request: Request) {
  const { sql, agent } = await agentSocialSession(request);
  if (!agent) return unauthorized();
  const body = await readJson(request);
  if (!body) return invalidBody();
  return writeResponse(await postDisconnectPlan(sql, agent, body, Date.now()));
}
