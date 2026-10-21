import { agentSocialSession, clientOf, socialResponse, unauthorized } from "../http";
import { socialOverview } from "@/lib/social-queries";

export const dynamic = "force-dynamic";

/** Policy, account health, ready/scheduled/attention counts, and the next cadence slots. */
export async function GET(request: Request) {
  const { sql, agent } = await agentSocialSession(request);
  if (!agent) return unauthorized();
  return socialResponse(await socialOverview(sql, agent, clientOf(request), Date.now()));
}
