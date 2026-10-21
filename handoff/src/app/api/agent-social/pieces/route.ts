import { listAgentSocialPieces } from "@/lib/social-queries";
import { agentSocialSession, clientOf, socialResponse, unauthorized } from "../http";

export const dynamic = "force-dynamic";

/** Finished pieces with version, approval, media summary, and publishing state. */
export async function GET(request: Request) {
  const { sql, agent } = await agentSocialSession(request);
  if (!agent) return unauthorized();
  const url = new URL(request.url);
  return socialResponse(
    await listAgentSocialPieces(
      sql,
      agent,
      { client: clientOf(request), deliverableId: url.searchParams.get("deliverable_id"), state: url.searchParams.get("state") },
      Date.now(),
    ),
  );
}
