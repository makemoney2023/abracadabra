import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { BoundSql } from "@/lib/cloudflare/sql";

const CRM = `
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT UNIQUE,
  website TEXT,
  industry TEXT,
  kind TEXT NOT NULL,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER
);
CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  name TEXT,
  title TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  opted_in INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE deals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  title TEXT NOT NULL,
  stage TEXT NOT NULL,
  source TEXT NOT NULL,
  next_step TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE activities (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  kind TEXT NOT NULL,
  actor_kind TEXT NOT NULL,
  actor_id TEXT,
  body TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE assessments (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  contact_id TEXT,
  deal_id TEXT,
  domain TEXT,
  answers_json TEXT NOT NULL,
  scores_json TEXT NOT NULL,
  total_score INTEGER,
  utm_json TEXT,
  report_url TEXT,
  completed_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);
`;

export function memoryCheckDb(): BoundSql {
  const dir = path.join(process.cwd(), "migrations");
  const migrations = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const db = new DatabaseSync(":memory:");
  db.exec(CRM);
  for (const name of migrations) db.exec(readFileSync(path.join(dir, name), "utf8"));
  return {
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          const args = values.map((value) => (value === undefined ? null : value));
          return {
            async run() {
              db.prepare(query).run(...(args as never[]));
              return { success: true };
            },
            async first<T>() {
              const row = db.prepare(query).get(...(args as never[])) as T | undefined;
              return row ?? null;
            },
            async all<T>() {
              return { results: db.prepare(query).all(...(args as never[])) as T[] };
            },
          };
        },
      };
    },
  };
}
