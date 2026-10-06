import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { LIMITS } from "@/lib/policy/limits";
import { createWorkspace } from "./workspaces";
import {
  addTemplateItem,
  closeRequest,
  createRequest,
  createTemplate,
  reorderTemplateItems,
  reopenRequest,
  retireTemplateItem,
  updateRequest,
  updateTemplateItem,
  workspaceRequests,
} from "./requests";

const NOW = 1_700_000_000_000;
const WORKSPACE = "11111111-1111-4111-8111-111111111111";

const operator: Caller = {
  userId: "user-operator",
  staff: { superAdmin: false },
  operatorOf: [WORKSPACE],
  memberships: [],
};

const owner: Caller = {
  userId: "user-owner",
  staff: null,
  operatorOf: [],
  memberships: [{ workspaceId: WORKSPACE, role: "client_owner" }],
};

const forged: Caller = {
  userId: "user-forged",
  staff: { superAdmin: false },
  operatorOf: [WORKSPACE],
  memberships: [],
};

const superAdmin: Caller = {
  userId: "user-admin",
  staff: { superAdmin: true },
  operatorOf: [],
  memberships: [],
};

async function memoryDb(): Promise<Sql> {
  process.env.HANDOFF_SQLITE_PATH = ":memory:";
  const sql = await openHandoffDb();
  await migrate(sql);
  return sql;
}

async function seedWorkspace(sql: Sql, status = "active"): Promise<void> {
  await sql.run(
    `INSERT INTO workspaces (
      id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
      quota_bytes, retention_days, request_digest, status, opened_at, archived_at, purged_at
    ) VALUES (?, 'northwind', 'Northwind', 'Northwind Co', NULL, 'Northwind', 'standard', ?, ?, 0, ?, ?, NULL, NULL)`,
    [WORKSPACE, LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, status, NOW],
  );
  await sql.run("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)", [
    "user-owner",
    "owner@example.com",
    NOW,
  ]);
  await sql.run(
    `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
     VALUES ('mem-owner', ?, 'user-owner', 'owner@example.com', 'client_owner', ?, NULL)`,
    [WORKSPACE, NOW],
  );
  await sql.run("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)", [
    "user-operator",
    "operator@example.com",
    NOW,
  ]);
  await sql.run(
    `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
     VALUES ('user-operator', 'operator@example.com', 0, ?, NULL)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO workspace_operators (id, workspace_id, user_id, assigned_by, assigned_at, removed_at)
     VALUES ('op-1', ?, 'user-operator', 'user-admin', ?, NULL)`,
    [WORKSPACE, NOW],
  );
  await sql.run("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)", [
    "user-admin",
    "admin@example.com",
    NOW,
  ]);
  await sql.run(
    `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
     VALUES ('user-admin', 'admin@example.com', 1, ?, NULL)`,
    [NOW],
  );
}

afterEach(() => {
  delete process.env.HANDOFF_SQLITE_PATH;
});

describe("templates", () => {
  it("lets staff create, reorder, and retire template items", async () => {
    const sql = await memoryDb();
    await seedWorkspace(sql);
    const refused = await createTemplate({ sql, caller: owner, now: NOW, name: "Brand kit" });
    expect(refused).toEqual({ ok: false, message: "You can't do that." });

    const created = await createTemplate({ sql, caller: operator, now: NOW, name: "Brand kit" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const logo = await addTemplateItem({
      sql,
      caller: operator,
      templateId: created.value.id,
      title: "Logo",
      guidance: "Square PNG",
      suggestedTag: "brand",
    });
    const photos = await addTemplateItem({
      sql,
      caller: operator,
      templateId: created.value.id,
      title: "Photos",
      guidance: null,
      suggestedTag: "photo",
    });
    expect(logo.ok && photos.ok).toBe(true);
    if (!logo.ok || !photos.ok) return;

    const reordered = await reorderTemplateItems({
      sql,
      caller: operator,
      templateId: created.value.id,
      orderedIds: [photos.value.id, logo.value.id],
    });
    expect(reordered.ok).toBe(true);
    const positions = await sql.all<{ id: string; position: number }>(
      "SELECT id, position FROM request_template_items WHERE template_id = ? ORDER BY position",
      [created.value.id],
    );
    expect(positions).toEqual([
      { id: photos.value.id, position: 0 },
      { id: logo.value.id, position: 1 },
    ]);

    const retired = await retireTemplateItem({
      sql,
      caller: operator,
      templateId: created.value.id,
      itemId: logo.value.id,
    });
    expect(retired.ok).toBe(true);
    const remaining = await sql.all<{ id: string; position: number }>(
      "SELECT id, position FROM request_template_items WHERE template_id = ?",
      [created.value.id],
    );
    expect(remaining).toEqual([{ id: photos.value.id, position: 0 }]);
  });

  it("leaves copied requests unchanged when a template item is edited", async () => {
    const sql = await memoryDb();
    await seedWorkspace(sql);
    const template = await createTemplate({ sql, caller: superAdmin, now: NOW, name: "Brand kit" });
    expect(template.ok).toBe(true);
    if (!template.ok) return;
    const item = await addTemplateItem({
      sql,
      caller: superAdmin,
      templateId: template.value.id,
      title: "Logo",
      guidance: "Square PNG",
      suggestedTag: "brand",
    });
    expect(item.ok).toBe(true);
    if (!item.ok) return;
    const workspace = await createWorkspace({
      sql,
      caller: superAdmin,
      now: NOW,
      fields: {
        name: "Copied",
        slug: "copied",
        displayName: "Copied Co",
        senderName: "Copied",
        policyProfile: "standard",
        templateId: template.value.id,
      },
    });
    expect(workspace.ok).toBe(true);
    if (!workspace.ok) return;

    const edited = await updateTemplateItem({
      sql,
      caller: superAdmin,
      templateId: template.value.id,
      itemId: item.value.id,
      title: "Wordmark",
      guidance: "SVG",
      suggestedTag: "brand",
    });
    expect(edited.ok).toBe(true);
    const request = await sql.get<{ title: string; guidance: string }>(
      "SELECT title, guidance FROM requests WHERE workspace_id = ?",
      [workspace.value.id],
    );
    expect(request).toEqual({ title: "Logo", guidance: "Square PNG" });
    const templateTitle = await sql.get<{ title: string }>(
      "SELECT title FROM request_template_items WHERE id = ?",
      [item.value.id],
    );
    expect(templateTitle?.title).toBe("Wordmark");
  });
});

describe("requests", () => {
  it("lets assigned staff create, edit, close, and reopen a request", async () => {
    const sql = await memoryDb();
    await seedWorkspace(sql);
    const created = await createRequest({
      sql,
      caller: operator,
      workspaceId: WORKSPACE,
      title: "Logo",
      guidance: "Square PNG",
      suggestedTag: "brand",
      dueOn: NOW + 86_400_000,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const edited = await updateRequest({
      sql,
      caller: operator,
      workspaceId: WORKSPACE,
      requestId: created.value.id,
      title: "Wordmark",
      guidance: "SVG",
      suggestedTag: "copy",
      dueOn: null,
    });
    expect(edited.ok).toBe(true);
    const closed = await closeRequest({
      sql,
      caller: operator,
      workspaceId: WORKSPACE,
      requestId: created.value.id,
      now: NOW,
    });
    expect(closed.ok).toBe(true);
    const closedRow = await sql.get<{ status: string; title: string; closed_at: number; due_on: number | null }>(
      "SELECT status, title, closed_at, due_on FROM requests WHERE id = ?",
      [created.value.id],
    );
    expect(closedRow).toEqual({ status: "closed", title: "Wordmark", closed_at: NOW, due_on: null });

    const reopened = await reopenRequest({
      sql,
      caller: operator,
      workspaceId: WORKSPACE,
      requestId: created.value.id,
      now: NOW + 1,
    });
    expect(reopened.ok).toBe(true);
    const openRow = await sql.get<{ status: string; closed_at: number | null }>(
      "SELECT status, closed_at FROM requests WHERE id = ?",
      [created.value.id],
    );
    expect(openRow).toEqual({ status: "open", closed_at: null });
  });

  it("refuses a client and a forged operator", async () => {
    const sql = await memoryDb();
    await seedWorkspace(sql);
    const created = await createRequest({
      sql,
      caller: operator,
      workspaceId: WORKSPACE,
      title: "Logo",
      guidance: null,
      suggestedTag: null,
      dueOn: null,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    for (const caller of [owner, forged]) {
      expect(
        await createRequest({
          sql,
          caller,
          workspaceId: WORKSPACE,
          title: "Extra",
          guidance: null,
          suggestedTag: null,
          dueOn: null,
        }),
      ).toEqual({ ok: false, message: "You can't do that." });
      expect(
        await updateRequest({
          sql,
          caller,
          workspaceId: WORKSPACE,
          requestId: created.value.id,
          title: "Stolen",
          guidance: null,
          suggestedTag: null,
          dueOn: null,
        }),
      ).toEqual({ ok: false, message: "You can't do that." });
      expect(
        await closeRequest({ sql, caller, workspaceId: WORKSPACE, requestId: created.value.id, now: NOW }),
      ).toEqual({ ok: false, message: "You can't do that." });
      expect(
        await reopenRequest({ sql, caller, workspaceId: WORKSPACE, requestId: created.value.id, now: NOW }),
      ).toEqual({ ok: false, message: "You can't do that." });
    }
    const title = await sql.get<{ title: string }>("SELECT title FROM requests WHERE id = ?", [created.value.id]);
    expect(title?.title).toBe("Logo");
  });

  it("refuses a new request on an archived workspace and guidance over 2,000 characters", async () => {
    const sql = await memoryDb();
    await seedWorkspace(sql, "archived");
    expect(
      await createRequest({
        sql,
        caller: operator,
        workspaceId: WORKSPACE,
        title: "Logo",
        guidance: null,
        suggestedTag: null,
        dueOn: null,
      }),
    ).toEqual({ ok: false, message: "This space is closed." });

    await sql.run("UPDATE workspaces SET status = 'active' WHERE id = ?", [WORKSPACE]);
    expect(
      await createRequest({
        sql,
        caller: operator,
        workspaceId: WORKSPACE,
        title: "Logo",
        guidance: "x".repeat(LIMITS.maxGuidanceChars + 1),
        suggestedTag: "not-a-tag",
        dueOn: null,
      }),
    ).toEqual({ ok: false, message: "The help text is too long. Keep it under 2,000 characters." });
    const count = await sql.get<{ n: number }>("SELECT count(*) AS n FROM requests");
    expect(count?.n).toBe(0);
  });

  it("lists open requests before received and closed", async () => {
    const sql = await memoryDb();
    await seedWorkspace(sql);
    const closed = await createRequest({
      sql,
      caller: operator,
      workspaceId: WORKSPACE,
      title: "Closed",
      guidance: null,
      suggestedTag: null,
      dueOn: null,
    });
    const open = await createRequest({
      sql,
      caller: operator,
      workspaceId: WORKSPACE,
      title: "Open",
      guidance: null,
      suggestedTag: null,
      dueOn: null,
    });
    const received = await createRequest({
      sql,
      caller: operator,
      workspaceId: WORKSPACE,
      title: "Received",
      guidance: null,
      suggestedTag: null,
      dueOn: null,
    });
    expect(closed.ok && open.ok && received.ok).toBe(true);
    if (!closed.ok || !open.ok || !received.ok) return;
    await closeRequest({ sql, caller: operator, workspaceId: WORKSPACE, requestId: closed.value.id, now: NOW });
    await sql.run("UPDATE requests SET status = 'received', received_at = ? WHERE id = ?", [NOW, received.value.id]);
    const listed = await workspaceRequests(sql, WORKSPACE);
    expect(listed.map((row) => row.title)).toEqual(["Open", "Received", "Closed"]);
  });
});
