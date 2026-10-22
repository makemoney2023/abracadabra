import { setAgentFile } from "@/lib/agent-library";
import { agentSocialSession, invalidBody, readJson, unauthorized, writeResponse } from "../../agent-social/http";
import { libraryResponse } from "../http";

export const dynamic = "force-dynamic";

/** Show or hide a clean file on the Library. This does not delete the file. */
export async function POST(request: Request) {
  const { sql, agent } = await agentSocialSession(request);
  if (!agent) return unauthorized();
  const body = await readJson(request);
  if (!body) return invalidBody();
  const fileId = typeof body.fileId === "string" ? body.fileId : "";
  if (!fileId || (body.selected !== true && body.selected !== false)) {
    return writeResponse({ ok: false, status: 400, reasonCode: "invalid_body", message: "Name the file and whether it is on the Library." });
  }
  return libraryResponse(await setAgentFile(sql, agent, { client: body.client, fileId, selected: body.selected }, Date.now()));
}
