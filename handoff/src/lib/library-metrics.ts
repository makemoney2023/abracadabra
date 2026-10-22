import type { Sql } from "@/db/sql";

export type LibraryMetricName =
  | "library_listed"
  | "library_search_empty"
  | "library_link_copied"
  | "view_link_created"
  | "view_link_opened"
  | "view_link_updated"
  | "view_link_revoked"
  | "view_link_download_attempted"
  | "view_link_downloaded"
  | "article_promotion_created";

export type LibraryMetric = {
  name: LibraryMetricName;
  workspaceId?: string;
  artifactType?: string;
  count?: number;
};

const SECRET_KEY = /token|passcode|url|canonical|caption|copy|content|pepper/i;

/** Counts and type names only. Callers must not pass tokens, passcodes, or URLs. */
export function libraryMetric(event: LibraryMetric): Record<string, string | number> {
  const row: Record<string, string | number> = { name: event.name };
  if (event.workspaceId) row.workspaceId = event.workspaceId;
  if (event.artifactType) row.artifactType = event.artifactType;
  if (event.count !== undefined) row.count = event.count;
  return row;
}

export function metricOmitsSecrets(payload: Record<string, unknown>): boolean {
  return Object.keys(payload).every((key) => !SECRET_KEY.test(key));
}

export async function recordLibraryMetric(
  sql: Sql,
  input: LibraryMetric & { organizationId: string; actorId?: string | null },
  now = Date.now(),
): Promise<void> {
  const data = libraryMetric(input);
  if (!metricOmitsSecrets(data)) return;
  await sql.run(
    `INSERT INTO activities (
       id, organization_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at
     ) VALUES (?, ?, ?, ?, 'staff', ?, NULL, ?, ?)`,
    [crypto.randomUUID(), input.organizationId, input.workspaceId ?? null, `library.${input.name}`, input.actorId ?? null, JSON.stringify(data), now],
  );
}
