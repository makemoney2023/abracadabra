import { listAgentSocialAccounts } from "@/lib/social-queries";
import { agentSocialSession, clientOf, socialResponse, unauthorized } from "../http";

export const dynamic = "force-dynamic";

/** Connected eligible social accounts. Blog sites and out-of-scope networks are omitted. */
export async function GET(request: Request) {
  const { sql, agent } = await agentSocialSession(request);
  if (!agent) return unauthorized();
  return socialResponse(await listAgentSocialAccounts(sql, agent, clientOf(request)));
}
