import type { Sql } from "@/db/sql";

export async function resolveWorkspaceRouteId(sql: Sql, idOrSlug: string): Promise<string | null> {
  const workspace = await sql.get<{ id: string }>(
    "SELECT id FROM workspaces WHERE id = ? OR slug = ? LIMIT 1",
    [idOrSlug, idOrSlug],
  );
  return workspace?.id ?? null;
}
