import type { Sql } from "./sql";

export type SchemaCheckRow = {
  id: string;
  objective: string;
  status: string;
  error_message: string | null;
  created_at: number;
};

export type SchemaSiteRow = {
  id: string;
  domain: string;
  name: string | null;
  website: string | null;
  verdict: string;
  answer: string | null;
  organization_id: string | null;
  contacts_json: string;
};

export async function recentSchemaChecks(sql: Sql): Promise<SchemaCheckRow[]> {
  return sql.all<SchemaCheckRow>(
    `SELECT id, objective, status, error_message, created_at
     FROM schema_checks ORDER BY created_at DESC LIMIT 20`,
  );
}

export async function schemaCheckSites(sql: Sql, checkId: string): Promise<SchemaSiteRow[]> {
  return sql.all<SchemaSiteRow>(
    `SELECT id, domain, name, website, verdict, answer, organization_id, contacts_json
     FROM schema_check_sites WHERE check_id = ? ORDER BY domain`,
    [checkId],
  );
}
