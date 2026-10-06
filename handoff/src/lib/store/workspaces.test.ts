import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { LIMITS } from "@/lib/policy/limits";
import { addStaff } from "./staff";
import {
  assignOperator,
  configureWorkspace,
  createWorkspace,
  setWorkspaceLogo,
  type BrandingStore,
} from "./workspaces";

const NOW = 1_700_000_000_000;

const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

const WEBP_1X1 = Uint8Array.from(
  Buffer.from("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=", "base64"),
);

const superAdmin: Caller = {
  userId: "user-admin",
  staff: { superAdmin: true },
  operatorOf: [],
  memberships: [],
};

const operator: Caller = {
  userId: "user-operator",
  staff: { superAdmin: false },
  operatorOf: [],
  memberships: [],
};

function memoryBranding(): BrandingStore & {
  objects: Map<string, { body: Uint8Array; contentType: string }>;
} {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  return {
    objects,
    async put(key, body, contentType) {
      objects.set(key, { body: Uint8Array.from(body), contentType });
    },
    async get(key) {
      return objects.get(key);
    },
  };
}

async function memoryDb(): Promise<Sql> {
  process.env.HANDOFF_SQLITE_PATH = ":memory:";
  const sql = await openHandoffDb();
  await migrate(sql);
  return sql;
}

async function seedSuper(sql: Sql): Promise<void> {
  await sql.run("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)", [
    "user-admin",
    "admin@example.com",
    NOW,
  ]);
  await sql.run(
    "INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at) VALUES (?, ?, 1, ?, NULL)",
    ["user-admin", "admin@example.com", NOW],
  );
}

afterEach(() => {
  delete process.env.HANDOFF_SQLITE_PATH;
});

describe("createWorkspace", () => {
  it("lets a super-admin open a workspace and refuses everyone else", async () => {
    const sql = await memoryDb();
    await seedSuper(sql);
    const refused = await createWorkspace({
      sql,
      caller: operator,
      now: NOW,
      fields: {
        name: "Northwind",
        slug: "northwind",
        displayName: "Northwind Co",
        senderName: "Northwind",
        policyProfile: "standard",
      },
    });
    expect(refused).toEqual({ ok: false, message: "You can't do that." });

    const created = await createWorkspace({
      sql,
      caller: superAdmin,
      now: NOW,
      fields: {
        name: "Northwind",
        slug: "northwind",
        displayName: "Northwind Co",
        senderName: "Northwind",
        policyProfile: "software",
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const row = await sql.get<{
      slug: string;
      display_name: string;
      policy_profile: string;
      quota_bytes: number;
      retention_days: number;
      status: string;
      request_digest: number;
    }>("SELECT * FROM workspaces WHERE id = ?", [created.value.id]);
    expect(row?.slug).toBe("northwind");
    expect(row?.display_name).toBe("Northwind Co");
    expect(row?.policy_profile).toBe("software");
    expect(row?.quota_bytes).toBe(LIMITS.defaultQuotaBytes);
    expect(row?.retention_days).toBe(LIMITS.defaultRetentionDays);
    expect(row?.status).toBe("active");
    expect(row?.request_digest).toBe(0);

    const duplicate = await createWorkspace({
      sql,
      caller: superAdmin,
      now: NOW,
      fields: {
        name: "Other",
        slug: "northwind",
        displayName: "Other",
        senderName: "Other",
        policyProfile: "standard",
      },
    });
    expect(duplicate).toEqual({ ok: false, message: "That web address is already taken." });
  });

  it("opens a Files request when no file ask is chosen", async () => {
    const sql = await memoryDb();
    await seedSuper(sql);
    const created = await createWorkspace({
      sql,
      caller: superAdmin,
      now: NOW,
      fields: {
        name: "Renew Implants",
        slug: "renew-implants",
        displayName: "Renew Implants",
        senderName: "Strongfoam",
        policyProfile: "standard",
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const requests = await sql.all<{ title: string; status: string; position: number }>(
      "SELECT title, status, position FROM requests WHERE workspace_id = ? ORDER BY position",
      [created.value.id],
    );
    expect(requests).toEqual([{ title: "Files", status: "open", position: 1 }]);
  });

  it("copies a live template into requests and ignores later template edits", async () => {
    const sql = await memoryDb();
    await seedSuper(sql);
    await sql.run(
      "INSERT INTO request_templates (id, name, created_by, created_at, retired_at) VALUES (?, ?, ?, ?, NULL)",
      ["tpl-1", "Brand kit", "user-admin", NOW],
    );
    await sql.run(
      `INSERT INTO request_template_items (id, template_id, position, title, guidance, suggested_tag)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ["item-1", "tpl-1", 0, "Logo", "Square PNG", "brand"],
    );
    const retired = await createWorkspace({
      sql,
      caller: superAdmin,
      now: NOW,
      fields: {
        name: "Retired",
        slug: "retired-source",
        displayName: "Retired",
        senderName: "Retired",
        policyProfile: "standard",
        templateId: "missing",
      },
    });
    expect(retired).toEqual({ ok: false, message: "Pick a template that is still in use." });

    const created = await createWorkspace({
      sql,
      caller: superAdmin,
      now: NOW,
      fields: {
        name: "Copied",
        slug: "copied",
        displayName: "Copied Co",
        senderName: "Copied",
        policyProfile: "standard",
        templateId: "tpl-1",
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const request = await sql.get<{ title: string; guidance: string; suggested_tag: string; status: string }>(
      "SELECT title, guidance, suggested_tag, status FROM requests WHERE workspace_id = ?",
      [created.value.id],
    );
    expect(request).toEqual({
      title: "Logo",
      guidance: "Square PNG",
      suggested_tag: "brand",
      status: "open",
    });

    await sql.run("UPDATE request_template_items SET title = ? WHERE id = ?", ["Wordmark", "item-1"]);
    const after = await sql.get<{ title: string }>(
      "SELECT title FROM requests WHERE workspace_id = ?",
      [created.value.id],
    );
    expect(after?.title).toBe("Logo");
  });
});

describe("assignOperator and configureWorkspace", () => {
  it("assigns live staff and lets only a super-admin change profile and quota", async () => {
    const sql = await memoryDb();
    await seedSuper(sql);
    const created = await createWorkspace({
      sql,
      caller: superAdmin,
      now: NOW,
      fields: {
        name: "Northwind",
        slug: "northwind",
        displayName: "Northwind Co",
        senderName: "Northwind",
        policyProfile: "standard",
      },
    });
    if (!created.ok) throw new Error(created.message);

    const stranger = await assignOperator({
      sql,
      caller: superAdmin,
      now: NOW,
      workspaceId: created.value.id,
      userId: "user-stranger",
    });
    expect(stranger).toEqual({ ok: false, message: "That person isn't on the team." });

    await sql.run("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)", [
      "user-revoked",
      "revoked@example.com",
      NOW,
    ]);
    await sql.run(
      "INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at) VALUES (?, ?, 0, ?, ?)",
      ["user-revoked", "revoked@example.com", NOW, NOW],
    );
    const revoked = await assignOperator({
      sql,
      caller: superAdmin,
      now: NOW,
      workspaceId: created.value.id,
      userId: "user-revoked",
    });
    expect(revoked).toEqual({ ok: false, message: "That person isn't on the team." });

    const added = await addStaff({
      sql,
      caller: superAdmin,
      email: "Ops@Example.com",
      now: NOW,
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const denied = await assignOperator({
      sql,
      caller: { ...operator, userId: added.value.userId },
      now: NOW,
      workspaceId: created.value.id,
      userId: added.value.userId,
    });
    expect(denied).toEqual({ ok: false, message: "You can't do that." });

    const assigned = await assignOperator({
      sql,
      caller: superAdmin,
      now: NOW,
      workspaceId: created.value.id,
      userId: added.value.userId,
    });
    expect(assigned.ok).toBe(true);
    const live = await sql.get<{ n: number }>(
      "SELECT count(*) AS n FROM workspace_operators WHERE workspace_id = ? AND user_id = ? AND removed_at IS NULL",
      [created.value.id, added.value.userId],
    );
    expect(live?.n).toBe(1);

    const configured = await configureWorkspace({
      sql,
      caller: { ...operator, userId: added.value.userId, operatorOf: [created.value.id] },
      workspaceId: created.value.id,
      policyProfile: "software",
      quotaBytes: 10,
    });
    expect(configured).toEqual({ ok: false, message: "You can't do that." });

    const updated = await configureWorkspace({
      sql,
      caller: superAdmin,
      workspaceId: created.value.id,
      policyProfile: "software",
      quotaBytes: 42,
    });
    expect(updated.ok).toBe(true);
    const row = await sql.get<{ policy_profile: string; quota_bytes: number }>(
      "SELECT policy_profile, quota_bytes FROM workspaces WHERE id = ?",
      [created.value.id],
    );
    expect(row).toEqual({ policy_profile: "software", quota_bytes: 42 });
  });
});

describe("setWorkspaceLogo", () => {
  it("refuses a non-image or oversized logo and stores a re-encoded PNG", async () => {
    const sql = await memoryDb();
    await seedSuper(sql);
    const created = await createWorkspace({
      sql,
      caller: superAdmin,
      now: NOW,
      fields: {
        name: "Northwind",
        slug: "northwind",
        displayName: "Northwind Co",
        senderName: "Northwind",
        policyProfile: "standard",
      },
    });
    if (!created.ok) throw new Error(created.message);
    const branding = memoryBranding();

    const jpeg = await setWorkspaceLogo({
      sql,
      caller: superAdmin,
      workspaceId: created.value.id,
      bytes: Uint8Array.of(0xff, 0xd8, 0xff, 0xd9),
      branding,
    });
    expect(jpeg).toEqual({ ok: false, message: "Use a PNG or WebP logo smaller than 512 KB." });

    const oversized = new Uint8Array(LIMITS.logoMaxBytes + 1);
    oversized.set(PNG_1X1.subarray(0, 8));
    const tooBig = await setWorkspaceLogo({
      sql,
      caller: superAdmin,
      workspaceId: created.value.id,
      bytes: oversized,
      branding,
    });
    expect(tooBig).toEqual({ ok: false, message: "Use a PNG or WebP logo smaller than 512 KB." });

    const trailer = new Uint8Array(PNG_1X1.length + 10);
    trailer.set(PNG_1X1);
    trailer.set(new TextEncoder().encode("NOT-A-LOGO"), PNG_1X1.length);
    const stored = await setWorkspaceLogo({
      sql,
      caller: superAdmin,
      workspaceId: created.value.id,
      bytes: trailer,
      branding,
    });
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    const object = branding.objects.get(stored.value.key);
    expect(stored.value.key).toBe(`branding/${created.value.id}.png`);
    expect(object?.contentType).toBe("image/png");
    expect(object?.body.subarray(0, 8)).toEqual(PNG_1X1.subarray(0, 8));
    expect(new TextDecoder().decode(object?.body ?? new Uint8Array())).not.toContain("NOT-A-LOGO");
    const key = await sql.get<{ logo_object_key: string }>(
      "SELECT logo_object_key FROM workspaces WHERE id = ?",
      [created.value.id],
    );
    expect(key?.logo_object_key).toBe(stored.value.key);

    const webp = await setWorkspaceLogo({
      sql,
      caller: superAdmin,
      workspaceId: created.value.id,
      bytes: WEBP_1X1,
      branding,
    });
    expect(webp.ok).toBe(true);
    if (!webp.ok) return;
    const webpObject = branding.objects.get(webp.value.key);
    expect(webpObject?.contentType).toBe("image/png");
    expect(webpObject?.body.subarray(0, 4)).toEqual(PNG_1X1.subarray(0, 4));

    const client: Caller = {
      userId: "user-client",
      staff: null,
      operatorOf: [created.value.id],
      memberships: [{ workspaceId: created.value.id, role: "client_owner" }],
    };
    const clientLogo = await setWorkspaceLogo({
      sql,
      caller: client,
      workspaceId: created.value.id,
      bytes: PNG_1X1,
      branding,
    });
    expect(clientLogo).toEqual({ ok: false, message: "You can't do that." });
  });
});
