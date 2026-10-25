import { d1Sql, sqliteSql, type D1Like, type Sql } from "./sql";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

/**
 * The handoff-search database (Search Console facts) for page reads, or null when it isn't bound.
 * In the Worker it is the SEARCH_DB binding. Local dev and screenshots can point HANDOFF_SEARCH_SQLITE_PATH at a sqlite
 * file. Read-only use: this never runs migrateSearch(); the sync queue consumer owns the schema.
 */
export async function openSearchDb(): Promise<Sql | null> {
  const holder = globalThis as typeof globalThis & { [CLOUDFLARE_CONTEXT]?: { env?: { SEARCH_DB?: D1Like } } };
  const bound = holder[CLOUDFLARE_CONTEXT]?.env?.SEARCH_DB;
  if (bound) return d1Sql(bound);
  const location = process.env.HANDOFF_SEARCH_SQLITE_PATH;
  if (!location) return null;
  const { DatabaseSync } = await import("node:sqlite");
  return sqliteSql(new DatabaseSync(location));
}
