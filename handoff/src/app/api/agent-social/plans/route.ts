import { postSocialPlan } from "@/lib/social-agent-api";
import { agentSocialSession, invalidBody, readJson, unauthorized, writeResponse } from "../http";

export const dynamic = "force-dynamic";

/** Prepare a content plan. Empty selections stay empty. */
export async function POST(request: Request) {
  const { sql, agent } = await agentSocialSession(request);
  if (!agent) return unauthorized();
  const body = await readJson(request);
  if (!body) return invalidBody();
  return writeResponse(await postSocialPlan(sql, agent, body, Date.now()));
}
