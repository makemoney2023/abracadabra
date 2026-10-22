import { listAgentLibrary } from "@/lib/agent-library";
import { agentSocialSession, clientOf, unauthorized } from "../agent-social/http";
import { libraryResponse } from "./http";

export const dynamic = "force-dynamic";

/** The Library the assigned client sees. `removed=1` is the Removed shelf. */
export async function GET(request: Request) {
  const { sql, agent } = await agentSocialSession(request);
  if (!agent) return unauthorized();
  const url = new URL(request.url);
  return libraryResponse(await listAgentLibrary(sql, agent, {
    client: clientOf(request),
    removed: url.searchParams.get("removed") === "1",
  }));
}
