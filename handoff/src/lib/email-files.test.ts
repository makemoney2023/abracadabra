import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { LIMITS } from "@/lib/policy/limits";
import { localObjectStore, type ObjectStore } from "@/lib/store/objects";
import { parseInboundEmail } from "./client-channel";
import { storeEmailAttachments } from "./email-files";

const NOW = 1_700_000_000_000;
const PDF = new TextEncoder().encode("%PDF-1.4 hello");

const WITH_FILE = [
  "Authentication-Results: mx.cloudflare.net;",
  "\tdkim=pass header.d=client.example header.s=s1 header.b=abc;",
  "\tdmarc=pass (p=REJECT dis=NONE) header.from=client.example",
  "Authentication-Results: forged.example; dmarc=pass header.from=client.example",
  "From: Ada <ada@client.example>",
  "To: magic@abra-ca-dabra.app",
  "Subject: The brief",
  "Message-ID: <m-file@client.example>",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="bound"',
  "",
  "--bound",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Please add a page.",
  "--bound",
  'Content-Type: application/pdf; name="brief.pdf"',
  'Content-Disposition: attachment; filename="brief.pdf"',
  "Content-Transfer-Encoding: base64",
  "",
  Buffer.from(PDF).toString("base64"),
  "--bound",
  'Content-Type: application/x-pem-file; name="secret.pem"',
  'Content-Disposition: attachment; filename="secret.pem"',
  "Content-Transfer-Encoding: base64",
  "",
  Buffer.from("not-a-key").toString("base64"),
  "--bound--",
  "",
].join("\r\n");

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
  root = mkdtempSync(path.join(tmpdir(), "email-files-"));
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

describe("email attachments", () => {
  it("reads the file and ignores a forged authentication header underneath", async () => {
    const parsed = await parseInboundEmail(WITH_FILE);
    expect(parsed.authenticationResults).toContain("dkim=pass");
    expect(parsed.authenticationResults).toContain("header.from=client.example");
    expect(parsed.authenticationResults).not.toContain("forged.example");
    expect(parsed.attachments.map((file) => file.filename)).toEqual(["brief.pdf", "secret.pem"]);
    expect(parsed.attachments[0]?.bytes).toEqual(PDF);
  });

  it("puts an allowed file in a From email batch and leaves it waiting for the scan", async () => {
    await space();
    const parsed = await parseInboundEmail(WITH_FILE);
    const saved = await storeEmailAttachments({
      sql,
      store,
      organizationId: "org-1",
      files: parsed.attachments,
      now: NOW,
    });
    expect(saved.stored).toEqual(["brief.pdf"]);
    expect(saved.refused).toEqual(["secret.pem"]);
    const batch = await sql.get<{ label: string }>("SELECT label FROM batches WHERE id = ?", [saved.batchId]);
    expect(batch?.label).toBe("From email");
    const file = await sql.get<{ status: string; next_scan_at: number; object_key: string }>(
      "SELECT status, next_scan_at, object_key FROM files WHERE relative_path = 'brief.pdf'",
    );
    expect(file?.status).toBe("uploaded");
    expect(file?.next_scan_at).toBe(NOW);
    expect(file ? await store.read(file.object_key) : null).toEqual(PDF);
  });

  it("notes the file when the client has no space", async () => {
    const saved = await storeEmailAttachments({
      sql,
      store,
      organizationId: "org-1",
      files: [{ filename: "brief.pdf", mimeType: "application/pdf", bytes: PDF }],
      now: NOW,
    });
    expect(saved.batchId).toBeNull();
    expect(saved.stored).toEqual([]);
    const note = await sql.get<{ body: string }>(
      "SELECT body FROM activities WHERE organization_id = 'org-1' AND kind = 'agent.note'",
    );
    expect(note?.body).toContain("no file space");
  });

  it("opens one file space for a lead and reuses it", async () => {
    await sql.run("UPDATE organizations SET kind = 'lead' WHERE id = 'org-1'");
    const first = await storeEmailAttachments({
      sql,
      store,
      organizationId: "org-1",
      files: [{ filename: "brief.pdf", mimeType: "application/pdf", bytes: PDF }],
      now: NOW,
    });
    expect(first.stored).toEqual(["brief.pdf"]);
    const spaces = await sql.all<{ project_id: string | null }>("SELECT project_id FROM workspaces");
    expect(spaces).toEqual([{ project_id: null }]);
    const kind = await sql.get<{ kind: string }>("SELECT kind FROM organizations WHERE id = 'org-1'");
    expect(kind?.kind).toBe("lead");
    const requests = await sql.get<{ n: number }>("SELECT count(*) AS n FROM requests WHERE title = 'Files'");
    expect(requests?.n).toBe(1);

    const second = await storeEmailAttachments({
      sql,
      store,
      organizationId: "org-1",
      files: [{ filename: "more.pdf", mimeType: "application/pdf", bytes: PDF }],
      now: NOW + 1,
    });
    expect(second.stored).toEqual(["more.pdf"]);
    const count = await sql.get<{ n: number }>("SELECT count(*) AS n FROM workspaces");
    expect(count?.n).toBe(1);

    const refused = await storeEmailAttachments({
      sql,
      store,
      organizationId: "org-1",
      files: [
        { filename: "secret.pem", mimeType: "application/x-pem-file", bytes: new TextEncoder().encode("nope") },
        { filename: "empty.pdf", mimeType: "application/pdf", bytes: new Uint8Array() },
      ],
      now: NOW + 2,
    });
    expect(refused.stored).toEqual([]);
    expect(refused.refused.length).toBeGreaterThan(0);
    const after = await sql.get<{ n: number }>("SELECT count(*) AS n FROM workspaces");
    expect(after?.n).toBe(1);
  });

  it("does not open a second space for a client who already has one", async () => {
    await space();
    await storeEmailAttachments({
      sql,
      store,
      organizationId: "org-1",
      files: [{ filename: "brief.pdf", mimeType: "application/pdf", bytes: PDF }],
      now: NOW,
    });
    const count = await sql.get<{ n: number }>("SELECT count(*) AS n FROM workspaces");
    expect(count?.n).toBe(1);
  });
});
