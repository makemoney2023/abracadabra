import { socialCadenceView } from "@/lib/social-queries";
import { agentSocialSession, clientOf, socialResponse, unauthorized } from "../http";

export const dynamic = "force-dynamic";

/** Standing publishing cadence and the next open slots. */
export async function GET(request: Request) {
  const { sql, agent } = await agentSocialSession(request);
  if (!agent) return unauthorized();
  return socialResponse(await socialCadenceView(sql, agent, clientOf(request), Date.now()));
}
