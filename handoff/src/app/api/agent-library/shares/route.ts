import { setAgentShare } from "@/lib/agent-library";
import { agentSocialSession, invalidBody, readJson, unauthorized, writeResponse } from "../../agent-social/http";
import { libraryResponse } from "../http";

export const dynamic = "force-dynamic";

/** Create or revoke a read-only view link for published pieces. */
export async function POST(request: Request) {
  const { sql, agent } = await agentSocialSession(request);
  if (!agent) return unauthorized();
  const body = await readJson(request);
  if (!body) return invalidBody();
  const action = body.action === "create" || body.action === "revoke" ? body.action : null;
  const itemIds = Array.isArray(body.itemIds) ? body.itemIds.filter((id): id is string => typeof id === "string") : [];
  const shareId = typeof body.shareId === "string" ? body.shareId : null;
  if (!action) return writeResponse({ ok: false, status: 400, reasonCode: "invalid_body", message: "Say whether to create or revoke the view link." });
  const origin = new URL(request.url).origin;
  return libraryResponse(await setAgentShare(sql, agent, { client: body.client, action, itemIds, shareId }, Date.now(), origin));
}
