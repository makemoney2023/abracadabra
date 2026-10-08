import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { LIMITS } from "@/lib/policy/limits";
import { localObjectStore, type ObjectStore } from "@/lib/store/objects";
import { storeWorkflowOutput, workflowSpacePath } from "./workflow-files";

const NOW = 1_700_000_000_000;

let sql: Sql;
let store: ObjectStore;
let root: string;

beforeEach(async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  sql = sqliteSql(db);
  await migrate(sql);
  await sql.run(
    `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-1', 'Northwind', 'client', ?, ?)`,
    [NOW, NOW],
  );
  root = mkdtempSync(path.join(tmpdir(), "workflow-files-"));
  store = localObjectStore(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function space(): Promise<void> {
  await sql.run(
    `INSERT INTO workspaces (
      id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
      quota_bytes, retention_days, request_digest, status, opened_at, archived_at, purge_after, purged_at, organization_id
    ) VALUES (
      '11111111-1111-4111-8111-111111111111', 'northwind', 'Northwind', 'Northwind', NULL, 'Northwind', 'standard',
      ?, ?, 0, 'active', ?, NULL, NULL, NULL, 'org-1'
    )`,
    [LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, NOW],
  );
}

describe("workflow space files", () => {
  it("builds a markdown path under agent", () => {
    expect(workflowSpacePath({ workflow: "Marketing pack", run: "Run 1", node: "Copy" })).toBe(
      "agent/marketing-pack/run-1/copy.md",
    );
    expect(workflowSpacePath({ workflow: " ", run: "run", node: "copy" })).toBeNull();
  });

  it("writes the file into the client space and leaves it for the scan", async () => {
    await space();
    const saved = await storeWorkflowOutput({
      sql,
      store,
      organizationId: "org-1",
      files: [{ workflow: "Marketing pack", run: "run-1", node: "Copy", body: "# Headline\nFoam." }],
      now: NOW,
    });
    expect(saved.stored).toEqual(["agent/marketing-pack/run-1/copy.md"]);
    const file = await sql.get<{ status: string; tag: string; object_key: string }>(
      "SELECT status, tag, object_key FROM files",
    );
    expect(file?.status).toBe("uploaded");
    expect(file?.tag).toBe("copy");
    const bytes = await store.read(file?.object_key ?? "");
    expect(new TextDecoder().decode(bytes ?? new Uint8Array())).toContain("Foam.");
  });

  it("stores a JSON object as a json file", async () => {
    await space();
    const saved = await storeWorkflowOutput({
      sql,
      store,
      organizationId: "org-1",
      files: [{ workflow: "schema", run: "run-1", node: "score", body: '{"score":28}' }],
      now: NOW,
    });
    expect(saved.stored).toEqual(["agent/schema/run-1/score.json"]);
    const file = await sql.get<{ declared_content_type: string; object_key: string }>(
      "SELECT declared_content_type, object_key FROM files",
    );
    expect(file?.declared_content_type).toBe("application/json");
    const bytes = await store.read(file?.object_key ?? "");
    expect(JSON.parse(new TextDecoder().decode(bytes ?? new Uint8Array()))).toEqual({ score: 28 });
  });

  it("stores a PDF data URL as a pdf", async () => {
    await space();
    const pdf = Buffer.from("%PDF-1.4\n").toString("base64");
    const saved = await storeWorkflowOutput({
      sql,
      store,
      organizationId: "org-1",
      files: [{ workflow: "report", run: "run-1", node: "audit", body: `data:application/pdf;base64,${pdf}` }],
      now: NOW,
    });
    expect(saved.stored).toEqual(["agent/report/run-1/audit.pdf"]);
    const file = await sql.get<{ declared_content_type: string; object_key: string }>(
      "SELECT declared_content_type, object_key FROM files",
    );
    expect(file?.declared_content_type).toBe("application/pdf");
    const bytes = await store.read(file?.object_key ?? "");
    expect(new TextDecoder().decode(bytes ?? new Uint8Array()).startsWith("%PDF")).toBe(true);
  });

  it("stores a PNG data URL as a png", async () => {
    await space();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");
    const saved = await storeWorkflowOutput({
      sql,
      store,
      organizationId: "org-1",
      files: [{ workflow: "creative", run: "run-1", node: "hero", body: `data:image/png;base64,${png}` }],
      now: NOW,
    });
    expect(saved.stored).toEqual(["agent/creative/run-1/hero.png"]);
    const file = await sql.get<{ declared_content_type: string }>("SELECT declared_content_type FROM files");
    expect(file?.declared_content_type).toBe("image/png");
  });

  it("keeps a data URL that is not a real PDF as markdown", async () => {
    await space();
    const saved = await storeWorkflowOutput({
      sql,
      store,
      organizationId: "org-1",
      now: NOW,
      files: [
        {
          workflow: "report",
          run: "run-1",
          node: "audit",
          body: "data:application/pdf;base64,aaaa",
        },
      ],
    });
    expect(saved.stored).toEqual(["agent/report/run-1/audit.md"]);
  });

  it("keeps a sentence as markdown", async () => {
    await space();
    const saved = await storeWorkflowOutput({
      sql,
      store,
      organizationId: "org-1",
      files: [{ workflow: "notes", run: "run-1", node: "line", body: "{not json" }],
      now: NOW,
    });
    expect(saved.stored).toEqual(["agent/notes/run-1/line.md"]);
  });

  it("records a note when the client has no space", async () => {
    const saved = await storeWorkflowOutput({
      sql,
      store,
      organizationId: "org-1",
      files: [{ workflow: "seo", run: "run-1", node: "page", body: "A page." }],
      now: NOW,
    });
    expect(saved).toEqual({ batchId: null, stored: [] });
    const activity = await sql.get<{ body: string }>("SELECT body FROM activities");
    expect(activity?.body).toContain("no file space");
  });
});
