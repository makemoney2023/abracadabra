import { agentSetSocialItemApproval } from "@/lib/social-agent-approve";
import { agentSocialSession, invalidBody, readJson, unauthorized, writeResponse } from "../../../http";

export const dynamic = "force-dynamic";

/** Put ONE approved social piece back to pending. Refused once it is scheduled or posted. */
export async function POST(request: Request, context: { params: Promise<{ itemId: string }> }) {
  const { sql, agent } = await agentSocialSession(request);
  if (!agent) return unauthorized();
  const body = await readJson(request);
  if (!body) return invalidBody();
  const { itemId } = await context.params;
  return writeResponse(await agentSetSocialItemApproval(sql, agent, itemId, body, "unapprove", Date.now()));
}
