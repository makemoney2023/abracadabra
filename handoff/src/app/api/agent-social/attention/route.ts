import { listAgentAttention } from "@/lib/social-queries";
import { agentSocialSession, clientOf, socialResponse, unauthorized } from "../http";

export const dynamic = "force-dynamic";

/** Open account and publishing issues. Provider payloads stay off this response. */
export async function GET(request: Request) {
  const { sql, agent } = await agentSocialSession(request);
  if (!agent) return unauthorized();
  return socialResponse(await listAgentAttention(sql, agent, clientOf(request)));
}
