import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { Caller } from "@/lib/authz";
import { migrate } from "./migrate";
import { sqliteSql, type Sql } from "./sql";
import {
  addDeliverableItem,
  createDeliverable,
  listWorkspaceDeliverables,
  openDeliverable,
  publishDeliverable,
  pullDeliverableFromManifest,
  recordFeedback,
  visibleMedia,
} from "./deliverables";

const NOW = 1_700_000_000_000;

const staff: Caller = {
  userId: "staff-1",
  staff: { superAdmin: false },
  operatorOf: ["ws-1"],
  memberships: [],
};

const client: Caller = {
  userId: "client-1",
  staff: null,
  operatorOf: [],
  memberships: [{ workspaceId: "ws-1", role: "client_member" }],
};

const stranger: Caller = {
  userId: "client-2",
  staff: null,
  operatorOf: [],
  memberships: [],
};

async function database(): Promise<Sql> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  await sql.run(
    `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
     VALUES ('staff-1', 'staff@example.com', 0, ?, NULL)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO workspaces (
       id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
       quota_bytes, retention_days, request_digest, status, opened_at
     ) VALUES (
       'ws-1', 'strongfoam', 'Strongfoam', 'Strongfoam', NULL, 'Studio', 'standard',
       1000, 30, 0, 'active', ?
     )`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO workspace_operators (id, workspace_id, user_id, assigned_by, assigned_at, removed_at)
     VALUES ('op-1', 'ws-1', 'staff-1', 'staff-1', ?, NULL)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
     VALUES ('mem-1', 'ws-1', 'client-1', 'client@example.com', 'client_member', ?, NULL)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO organizations (
       id, name, domain, website, industry, kind, owner_user_id, notes, created_at, updated_at, archived_at
     ) VALUES (
       'org-1', 'Strongfoam', NULL, NULL, NULL, 'client', 'staff-1', NULL, ?, ?, NULL
     )`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO projects (
       id, organization_id, deal_id, name, status, owner_user_id, starts_at, due_at, created_at, updated_at
     ) VALUES (
       'project-1', 'org-1', NULL, 'Launch', 'active', 'staff-1', NULL, NULL, ?, ?
     )`,
    [NOW, NOW],
  );
  await sql.run("UPDATE workspaces SET organization_id = 'org-1', project_id = 'project-1' WHERE id = 'ws-1'");
  await sql.run(
    `INSERT INTO repos (
       id, github_repo_id, installation_id, full_name, organization_id, project_id,
       default_branch, is_private, owned_by, linked_by, created_at, archived_at
     ) VALUES (
       'repo-1', 42, NULL, 'makemoney2023/renewimplants', 'org-1', 'project-1',
       'main', 1, 'agency', 'staff-1', ?, NULL
     )`,
    [NOW],
  );
  return sql;
}

describe("finished work", () => {
  it("keeps a draft off the client list until it is published", async () => {
    const sql = await database();
    const created = await createDeliverable(
      sql,
      staff,
      { organizationId: "org-1", projectId: "project-1", workspaceId: "ws-1", title: "Launch posts", kind: "social_pack" },
      NOW,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const added = await addDeliverableItem(
      sql,
      staff,
      { deliverableId: created.value.id, title: "Cover", format: "static", copyText: "Hello", section: "Launch", channel: "instagram" },
      NOW + 1,
    );
    expect(added.ok).toBe(true);

    expect(await listWorkspaceDeliverables(sql, client, "ws-1")).toEqual([]);
    expect(await openDeliverable(sql, client, created.value.id, "published")).toBeUndefined();
    expect((await listWorkspaceDeliverables(sql, staff, "ws-1")).map((row) => row.title)).toEqual(["Launch posts"]);

    const published = await publishDeliverable(sql, staff, created.value.id, NOW + 2);
    expect(published.ok).toBe(true);
    const clientList = await listWorkspaceDeliverables(sql, client, "ws-1");
    expect(clientList.map((row) => row.status)).toEqual(["in_review"]);
    const seen = await openDeliverable(sql, client, created.value.id, "published");
    expect(seen?.items.map((item) => item.title)).toEqual(["Cover"]);
    const activity = await sql.get<{ kind: string }>(
      "SELECT kind FROM activities WHERE project_id = 'project-1' AND kind = 'deliverable_published'",
    );
    expect(activity?.kind).toBe("deliverable_published");
  });

  it("refuses a client and a stranger from building finished work", async () => {
    const sql = await database();
    const byClient = await createDeliverable(
      sql,
      client,
      { organizationId: "org-1", projectId: "project-1", workspaceId: "ws-1", title: "Nope", kind: "other" },
      NOW,
    );
    expect(byClient).toEqual({ ok: false, error: "forbidden" });
    const byStranger = await createDeliverable(
      sql,
      stranger,
      { organizationId: "org-1", projectId: "project-1", workspaceId: "ws-1", title: "Nope", kind: "other" },
      NOW,
    );
    expect(byStranger).toEqual({ ok: false, error: "missing" });
  });

  it("approves the round when every piece is approved, and asks for changes when one is not", async () => {
    const sql = await database();
    const created = await createDeliverable(
      sql,
      staff,
      { organizationId: "org-1", projectId: "project-1", workspaceId: "ws-1", title: "Launch posts", kind: "social_pack" },
      NOW,
    );
    if (!created.ok) throw new Error("create");
    const first = await addDeliverableItem(sql, staff, { deliverableId: created.value.id, title: "Cover", format: "static" }, NOW);
    const second = await addDeliverableItem(sql, staff, { deliverableId: created.value.id, title: "Story", format: "story" }, NOW);
    if (!first.ok || !second.ok) throw new Error("items");
    await publishDeliverable(sql, staff, created.value.id, NOW);

    const asked = await recordFeedback(
      sql,
      client,
      { deliverableId: created.value.id, itemId: first.value.id, version: 1, decision: "changes", body: "Make the type bigger." },
      NOW + 3,
    );
    expect(asked.ok).toBe(true);
    expect((await openDeliverable(sql, client, created.value.id, "published"))?.deliverable.status).toBe("changes_requested");

    const empty = await recordFeedback(
      sql,
      client,
      { deliverableId: created.value.id, itemId: second.value.id, version: 1, decision: "changes", body: "  " },
      NOW + 4,
    );
    expect(empty).toEqual({ ok: false, error: "invalid" });

    await recordFeedback(
      sql,
      client,
      { deliverableId: created.value.id, itemId: first.value.id, version: 1, decision: "approve", body: "" },
      NOW + 5,
    );
    const all = await recordFeedback(
      sql,
      client,
      { deliverableId: created.value.id, itemId: null, version: 1, decision: "approve", body: "" },
      NOW + 6,
    );
    expect(all.ok).toBe(true);
    expect((await openDeliverable(sql, client, created.value.id, "published"))?.deliverable.status).toBe("approved");

    const stale = await recordFeedback(
      sql,
      client,
      { deliverableId: created.value.id, itemId: first.value.id, version: 1, decision: "comment", body: "Old note" },
      NOW + 7,
    );
    expect(stale.ok).toBe(true);
  });

  it("keeps the published round when a new one is pulled from a repo manifest", async () => {
    const sql = await database();
    const created = await createDeliverable(
      sql,
      staff,
      { organizationId: "org-1", projectId: "project-1", workspaceId: "ws-1", title: "Launch posts", kind: "social_pack" },
      NOW,
    );
    if (!created.ok) throw new Error("create");
    const cover = await addDeliverableItem(sql, staff, { deliverableId: created.value.id, title: "Cover", format: "static" }, NOW);
    if (!cover.ok) throw new Error("item");
    await publishDeliverable(sql, staff, created.value.id, NOW);
    const stored = new Map<string, Uint8Array>();
    const pulled = await pullDeliverableFromManifest(
      sql,
      staff,
      {
        deliverableId: created.value.id,
        repoId: "repo-1",
        commit: "abc123",
        manifest: {
          title: "Launch posts",
          kind: "social_pack",
          items: [
            {
              title: "Square",
              format: "static",
              section: "Launch",
              channel: "instagram",
              copy: "Now open",
              media: [{ path: "square.png", role: "main" }],
            },
          ],
        },
        files: { "square.png": { bytes: new Uint8Array([1, 2, 3]), contentType: "image/png" } },
      },
      NOW + 8,
      async (bytes) => {
        const key = `${crypto.randomUUID()}/${crypto.randomUUID()}/${crypto.randomUUID()}`;
        stored.set(key, bytes);
        return key;
      },
    );
    expect(pulled.ok).toBe(true);
    const clientView = await openDeliverable(sql, client, created.value.id, "published");
    expect(clientView?.items.map((item) => item.title)).toEqual(["Cover"]);
    const working = await openDeliverable(sql, staff, created.value.id, "working");
    expect(working?.deliverable.version).toBe(2);
    expect(working?.deliverable.source_ref).toBe("abc123");
    expect(working?.items.map((item) => item.title)).toEqual(["Square"]);
    const media = working?.items[0] ? JSON.parse(working.items[0].media_json) as { r2_key: string }[] : [];
    expect(media[0]?.r2_key.includes("square.png")).toBe(false);
    expect(stored.get(media[0]?.r2_key ?? "")).toEqual(new Uint8Array([1, 2, 3]));

    const sneaky = await pullDeliverableFromManifest(
      sql,
      staff,
      {
        deliverableId: created.value.id,
        repoId: "repo-1",
        commit: "def456",
        manifest: {
          title: "Launch posts",
          kind: "social_pack",
          items: [{ title: "Bad", format: "file", media: [{ path: "../src/secret.ts", role: "main" }] }],
        },
        files: { "../src/secret.ts": { bytes: new Uint8Array([9]), contentType: "text/plain" } },
      },
      NOW + 9,
      async () => "should-not-run",
    );
    expect(sneaky).toEqual({ ok: false, error: "invalid" });
    expect(stored.size).toBe(1);

    const draftMedia = await visibleMedia(sql, client, created.value.id, working?.items[0]?.id ?? "", "main");
    expect(draftMedia).toBeNull();
    const live = await visibleMedia(sql, client, created.value.id, cover.value.id, "main");
    expect(live).toBeNull();
    const staffDraft = await visibleMedia(sql, staff, created.value.id, working?.items[0]?.id ?? "", "main");
    expect(staffDraft?.contentType).toBe("image/png");
    expect(await visibleMedia(sql, stranger, created.value.id, working?.items[0]?.id ?? "", "main")).toBeNull();
  });
});
