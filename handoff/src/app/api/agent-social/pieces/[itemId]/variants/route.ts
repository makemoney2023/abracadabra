import { saveAgentSocialVariant } from "@/lib/social-agent-api";
import { agentSocialSession, invalidBody, readJson, unauthorized, writeResponse } from "../../../http";

export const dynamic = "force-dynamic";

/** Save one platform variant for a finished piece. Does not publish it. */
export async function PATCH(request: Request, context: { params: Promise<{ itemId: string }> }) {
  const { sql, agent } = await agentSocialSession(request);
  if (!agent) return unauthorized();
  const body = await readJson(request);
  if (!body) return invalidBody();
  const { itemId } = await context.params;
  return writeResponse(await saveAgentSocialVariant(sql, agent, itemId, body, Date.now()));
}
