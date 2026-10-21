import { postCadencePlan } from "@/lib/social-agent-api";
import { agentSocialSession, invalidBody, readJson, unauthorized, writeResponse } from "../http";

export const dynamic = "force-dynamic";

/** Plan a cadence change. Hire agents are denied by role before any account is rewritten. */
export async function POST(request: Request) {
  const { sql, agent } = await agentSocialSession(request);
  if (!agent) return unauthorized();
  const body = await readJson(request);
  if (!body) return invalidBody();
  return writeResponse(await postCadencePlan(sql, agent, body, Date.now()));
}
