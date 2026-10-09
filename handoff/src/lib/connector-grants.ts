import { organizationById } from "@/db/crm";
import type { Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";

const SEARCH_CONSOLE = "search-console";

export async function connectorGrant(sql: Sql, organizationId: string, connectorId: string): Promise<string> {
  const row = await sql.get<{ resource: string }>(
    "SELECT resource FROM connector_grants WHERE organization_id = ? AND connector_id = ?",
    [organizationId, connectorId],
  );
  return row?.resource ?? "";
}

/** Upsert the vendor resource for one client. An empty resource removes the row. */
export async function saveConnectorGrant(
  sql: Sql,
  caller: Caller,
  input: { organizationId: string; connectorId: string; resource: string },
): Promise<{ ok: true } | { ok: false; error: "invalid" | "missing" }> {
  const connectorId = input.connectorId.trim();
  if (connectorId !== SEARCH_CONSOLE) return { ok: false, error: "invalid" };
  const organization = await organizationById(sql, caller, input.organizationId);
  if (!organization) return { ok: false, error: "missing" };
  const resource = input.resource.trim();
  if (!resource) {
    await sql.run("DELETE FROM connector_grants WHERE organization_id = ? AND connector_id = ?", [
      input.organizationId,
      connectorId,
    ]);
    return { ok: true };
  }
  await sql.run(
    `INSERT INTO connector_grants (organization_id, connector_id, resource)
     VALUES (?, ?, ?)
     ON CONFLICT (organization_id, connector_id) DO UPDATE SET resource = excluded.resource`,
    [input.organizationId, connectorId, resource],
  );
  return { ok: true };
}
