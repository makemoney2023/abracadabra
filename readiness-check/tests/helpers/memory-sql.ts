import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
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
`;

export function memoryCheckDb(): BoundSql {
  const migration = readFileSync(
    path.join(process.cwd(), "migrations/0001_readiness_scans.sql"),
    "utf8",
  );
  const db = new DatabaseSync(":memory:");
  db.exec(CRM);
  db.exec(migration);
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
