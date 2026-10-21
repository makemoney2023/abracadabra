import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Caller } from "@/lib/authz";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";

const gate = vi.hoisted(() => ({ sql: null as Sql | null, caller: null as Caller | null }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/current", () => ({
  openSession: async () => ({ sql: gate.sql, caller: gate.caller }),
}));

import { revokeSourceAction, selectSourceAction } from "./sources-actions";

const staff: Caller = { userId: "staff-1", staff: { superAdmin: true }, operatorOf: [], memberships: [] };
const member: Caller = { userId: "member-1", staff: null, operatorOf: [], memberships: [{ workspaceId: "ws-1", role: "client_member" }] };

async function database(): Promise<Sql> {
  const sql = sqliteSql(new DatabaseSync(":memory:"));
  await migrate(sql);
  const now = 1_800_000_000_000;
  await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES ('org-1', 'Acme', 'acme.example', 'client', ?, ?)", [now, now]);
  await sql.run(
    `INSERT INTO workspaces (
       id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id
     ) VALUES ('ws-1', 'acme', 'Acme', 'Acme', 'Studio', 'standard', 1000, 30, 0, 'active', ?, 'org-1')`,
    [now],
  );
  await sql.run("INSERT INTO batches (id, workspace_id, created_by, created_at, last_activity_at) VALUES ('b-1', 'ws-1', 'staff-1', ?, ?)", [now, now]);
  await sql.run(
    `INSERT INTO files (id, batch_id, workspace_id, relative_path, extension, size_bytes, object_key, tag, status, scan_attempts, created_at)
     VALUES ('file-1', 'b-1', 'ws-1', 'brief.pdf', 'pdf', 10, 'key', 'brand', 'clean', 0, ?)`,
    [now],
  );
  return sql;
}

function form(): FormData {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("fileId", "file-1");
  return data;
}

describe("source selection actions", () => {
  beforeEach(() => {
    gate.sql = null;
    gate.caller = staff;
  });

  it("lets assigned staff select and revoke a clean file, and refuses a client", async () => {
    gate.sql = await database();
    gate.caller = member;
    expect(await selectSourceAction(form())).toEqual({ ok: false, error: "forbidden" });
    gate.caller = staff;
    expect(await selectSourceAction(form())).toEqual({ ok: true });
    const selected = await gate.sql.get<{ revoked_at: number | null }>("SELECT revoked_at FROM library_file_selections");
    expect(selected?.revoked_at).toBeNull();
    expect((await gate.sql.get<{ id: string }>("SELECT id FROM files WHERE id = 'file-1'"))?.id).toBe("file-1");
    expect(await revokeSourceAction(form())).toEqual({ ok: true });
    expect((await gate.sql.get<{ revoked_at: number | null }>("SELECT revoked_at FROM library_file_selections"))?.revoked_at).not.toBeNull();
    expect((await gate.sql.get<{ id: string }>("SELECT id FROM files WHERE id = 'file-1'"))?.id).toBe("file-1");
  });
});
