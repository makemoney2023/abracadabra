import { googleAccessToken } from "./google-auth";
import { handleConnectorRequest } from "./handle";
import { searchConsole } from "./search-console";

export interface Env {
  DB: D1Database;
  CONNECTOR_TOKEN?: string;
  GOOGLE_SEARCH_CONSOLE_SA?: string;
}

async function grantFromD1(db: D1Database, organizationId: string, connectorId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT resource FROM connector_grants WHERE organization_id = ? AND connector_id = ?")
    .bind(organizationId, connectorId)
    .first<{ resource: string }>();
  return row?.resource ?? null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleConnectorRequest(request, {
      token: env.CONNECTOR_TOKEN ?? "",
      modules: [searchConsole],
      grant: (organizationId, connectorId) => grantFromD1(env.DB, organizationId, connectorId),
      accessToken: () => googleAccessToken(env.GOOGLE_SEARCH_CONSOLE_SA ?? ""),
    });
  },
};
