import { setAgentShelf } from "@/lib/agent-library";
import { agentSocialSession, invalidBody, readJson, unauthorized, writeResponse } from "../../agent-social/http";
import { libraryResponse } from "../http";

export const dynamic = "force-dynamic";

/** Remove a piece from the Library, or put it back. Same rules as the button. */
export async function POST(request: Request) {
  const { sql, agent } = await agentSocialSession(request);
  if (!agent) return unauthorized();
  const body = await readJson(request);
  if (!body) return invalidBody();
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  const version = typeof body.version === "number" ? body.version : null;
  if (!itemId || version == null || (body.removed !== true && body.removed !== false)) {
    return writeResponse({ ok: false, status: 400, reasonCode: "invalid_body", message: "Name the piece, the version, and whether it is removed." });
  }
  return libraryResponse(await setAgentShelf(sql, agent, {
    client: body.client,
    itemId,
    version,
    removed: body.removed,
  }, Date.now()));
}
