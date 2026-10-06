import { mkdirSync } from "node:fs";
import path from "node:path";
import { d1Sql, sqliteSql, type D1Like, type Sql } from "./sql";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

type CloudflareContext = {
  env?: {
    DB?: D1Like;
  };
};

function boundDatabase(): D1Like | undefined {
  const holder = globalThis as typeof globalThis & {
    [CLOUDFLARE_CONTEXT]?: CloudflareContext;
  };
  return holder[CLOUDFLARE_CONTEXT]?.env?.DB;
}

function localLocation(): string {
  return process.env.HANDOFF_SQLITE_PATH ?? path.join(process.cwd(), ".data", "handoff.db");
}

/** Prefer the Worker D1 binding. Tests and local Next use a sqlite file. */
export async function openHandoffDb(): Promise<Sql> {
  const bound = boundDatabase();
  if (bound) return d1Sql(bound);
  const location = localLocation();
  if (location !== ":memory:") {
    mkdirSync(path.dirname(location), { recursive: true });
  }
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(location);
  db.exec("PRAGMA foreign_keys = ON");
  return sqliteSql(db);
}
