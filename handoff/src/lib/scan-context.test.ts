import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { LIMITS } from "@/lib/policy/limits";
import { searchSpace } from "@/lib/knowledge";
import { localObjectStore, type ObjectStore } from "@/lib/store/objects";
import { readinessContextFiles, storeScanContext } from "./scan-context";

const NOW = 1_700_000_000_000;

let sql: Sql;
let store: ObjectStore;
let root: string;

beforeEach(async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  sql = sqliteSql(db);
  await migrate(sql);
  await sql.exec(`
    CREATE TABLE readiness_scans (
      id TEXT PRIMARY KEY,
      domain TEXT,
      status TEXT NOT NULL,
      organization_id TEXT,
      score_total INTEGER,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE TABLE readiness_scan_pages (
      id TEXT PRIMARY KEY,
      scan_id TEXT NOT NULL,
      url TEXT NOT NULL,
      page_type TEXT NOT NULL,
      schema_types_json TEXT NOT NULL,
      evidence_json TEXT NOT NULL
    );
  `);
  await sql.run(
    `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-1', 'Northwind', 'client', ?, ?)`,
    [NOW, NOW],
  );
  root = mkdtempSync(path.join(tmpdir(), "scan-context-"));
  store = localObjectStore(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("schema context", () => {
  it("writes the schema types and the scraped page into one note", () => {
    const files = readinessContextFiles("scan-1", [
      {
        url: "https://northwind.example/",
        pageType: "home",
        schemaTypes: ["Organization"],
        scrapedText: "We sell foam.",
        facts: { businessName: "Northwind" },
      },
    ]);
    expect(files).toHaveLength(1);
    expect(files[0]?.body).toContain("Schema: Organization");
    expect(files[0]?.body).toContain("We sell foam.");
    expect(files[0]?.workflow).toBe("schema");
  });

  it("stores the scrape as searchable knowledge in the client space", async () => {
    await sql.run(
      `INSERT INTO workspaces (
        id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
        quota_bytes, retention_days, request_digest, status, opened_at, organization_id
      ) VALUES (
        '11111111-1111-4111-8111-111111111111', 'northwind', 'Northwind', 'Northwind', NULL, 'Northwind', 'standard',
        ?, ?, 0, 'active', ?, 'org-1'
      )`,
      [LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, NOW],
    );
    await sql.run(
      `INSERT INTO readiness_scans (id, status, organization_id, score_total, created_at, completed_at)
       VALUES ('scan-1', 'complete', 'org-1', 40, ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO readiness_scan_pages (id, scan_id, url, page_type, schema_types_json, evidence_json)
       VALUES ('page-1', 'scan-1', 'https://northwind.example/', 'home', '["Organization"]', ?)`,
      [JSON.stringify({ businessName: "Northwind", scrapedText: "We sell foam to shipyards." })],
    );
    const saved = await storeScanContext({ sql, store, organizationId: "org-1", now: NOW });
    expect(saved).toMatchObject({ scanId: "scan-1", score: 40 });
    expect(saved.stored[0]).toContain("agent/schema/scan-1/");
    const file = await sql.get<{ tag: string }>("SELECT tag FROM files");
    expect(file?.tag).toBe("reference");
    const hits = await searchSpace({
      sql,
      workspaceId: "11111111-1111-4111-8111-111111111111",
      query: "foam shipyards",
      understander: null,
    });
    expect(hits[0]?.passage).toContain("foam");
  });

  it("uses a finished scan for the same domain when the scan is not tied to the client yet", async () => {
    await sql.run("UPDATE organizations SET domain = 'northwind.example' WHERE id = 'org-1'");
    await sql.run(
      `INSERT INTO workspaces (
        id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
        quota_bytes, retention_days, request_digest, status, opened_at, organization_id
      ) VALUES (
        '11111111-1111-4111-8111-111111111111', 'northwind', 'Northwind', 'Northwind', NULL, 'Northwind', 'standard',
        ?, ?, 0, 'active', ?, 'org-1'
      )`,
      [LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, NOW],
    );
    await sql.run(
      `INSERT INTO readiness_scans (id, domain, status, organization_id, score_total, created_at, completed_at)
       VALUES ('scan-2', 'northwind.example', 'complete', NULL, 55, ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO readiness_scan_pages (id, scan_id, url, page_type, schema_types_json, evidence_json)
       VALUES ('page-2', 'scan-2', 'https://northwind.example/about', 'about', '[]', ?)`,
      [JSON.stringify({ scrapedText: "About the yard." })],
    );
    const saved = await storeScanContext({ sql, store, organizationId: "org-1", now: NOW });
    expect(saved.scanId).toBe("scan-2");
    expect(saved.stored.length).toBe(1);
  });

  it("opens a file space when the lead has none and files the scrape there", async () => {
    await sql.run(
      `INSERT INTO readiness_scans (id, status, organization_id, score_total, created_at, completed_at)
       VALUES ('scan-3', 'complete', 'org-1', 28, ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO readiness_scan_pages (id, scan_id, url, page_type, schema_types_json, evidence_json)
       VALUES ('page-3', 'scan-3', 'https://northwind.example/', 'home', '[]', ?)`,
      [JSON.stringify({ scrapedText: "We adjust athletes." })],
    );
    const saved = await storeScanContext({ sql, store, organizationId: "org-1", now: NOW });
    expect(saved.stored.length).toBe(1);
    const space = await sql.get<{ organization_id: string; status: string }>(
      "SELECT organization_id, status FROM workspaces",
    );
    expect(space).toEqual({ organization_id: "org-1", status: "active" });
    const waiting = await sql.get<{ id: string }>(
      "SELECT id FROM activities WHERE body LIKE '%no file space%'",
    );
    expect(waiting).toBeUndefined();
  });

  it("picks another slug when the lead name is already a space", async () => {
    await sql.run(
      `INSERT INTO workspaces (
        id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
        quota_bytes, retention_days, request_digest, status, opened_at
      ) VALUES (
        '22222222-2222-4222-8222-222222222222', 'northwind', 'Other', 'Other', NULL, 'Other', 'standard',
        ?, ?, 0, 'active', ?
      )`,
      [LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, NOW],
    );
    await sql.run(
      `INSERT INTO readiness_scans (id, status, organization_id, score_total, created_at, completed_at)
       VALUES ('scan-4', 'complete', 'org-1', 12, ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO readiness_scan_pages (id, scan_id, url, page_type, schema_types_json, evidence_json)
       VALUES ('page-4', 'scan-4', 'https://northwind.example/team', 'team', '[]', ?)`,
      [JSON.stringify({ scrapedText: "The team." })],
    );
    const saved = await storeScanContext({ sql, store, organizationId: "org-1", now: NOW });
    expect(saved.stored.length).toBe(1);
    const opened = await sql.get<{ slug: string }>(
      "SELECT slug FROM workspaces WHERE organization_id = 'org-1'",
    );
    expect(opened?.slug.startsWith("northwind-")).toBe(true);
    expect(opened?.slug).not.toBe("northwind");
  });

  it("stores nothing when the client has no finished scan", async () => {
    const saved = await storeScanContext({ sql, store, organizationId: "org-1", now: NOW });
    expect(saved).toEqual({ scanId: null, score: null, stored: [] });
  });
});
