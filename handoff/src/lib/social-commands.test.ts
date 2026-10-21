import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import type { SocialActor } from "./social-policy";
import { CONFIRM_SHORT_TTL_MS, prepareSocialPlan } from "./social-plans";
import { executeSocialPlan, issueConfirmation } from "./social-commands";
import type { ObjectStore } from "./store/objects";
import { ZernioError, type ZernioClient, type ZernioPostInput } from "./zernio";

const NOW = 1_800_000_000_000;
const staff: SocialActor = { kind: "staff", id: "staff-1" };
const lead: SocialActor = {
  kind: "agent",
  id: "agent-1",
  role: "lead",
  assigned: true,
  mode: "managed",
  grant: [],
  revoke: [],
};
const scheduled = { kind: "scheduled" as const, startAt: NOW + 120_000, gapMinutes: 60, now: NOW };
const store = { read: async (key: string) => new TextEncoder().encode(key) } as unknown as ObjectStore;

async function database(): Promise<Sql> {
  const sql = sqliteSql(new DatabaseSync(":memory:"));
  await migrate(sql);
  await sql.run(
    `INSERT INTO workspaces (
       id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
       quota_bytes, retention_days, request_digest, status, opened_at
     ) VALUES ('ws-1', 'acme', 'Acme', 'Acme', NULL, 'Studio', 'standard', 1000, 30, 0, 'active', ?)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-1', 'Acme', 'client', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO deliverables (
       id, organization_id, project_id, workspace_id, title, kind, status, version, published_version,
       actor_kind, actor_id, created_at, updated_at
     ) VALUES ('d-1', 'org-1', NULL, 'ws-1', 'October social', 'social_pack', 'in_review', 1, 1, 'staff', 'staff-1', ?, ?)`,
    [NOW, NOW],
  );
  const item = (id: string, sort: number, status: string) =>
    sql.run(
      `INSERT INTO deliverable_items (
         id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
       ) VALUES (?, 'd-1', 1, NULL, 'static', NULL, ?, 'Caption', ?, NULL, ?, ?)`,
      [id, `Piece ${id}`, JSON.stringify([{ r2_key: `${id}-pic`, role: "main", content_type: "image/png" }]), status, sort],
    );
  await item("i-pic", 0, "approved");
  await item("i-other", 1, "approved");
  await item("i-open", 2, "pending");
  await sql.run(
    `INSERT INTO social_profiles (organization_id, zernio_profile_id, created_at) VALUES ('org-1', 'prof-1', ?)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO social_accounts (id, organization_id, platform, username, display_name, is_active, synced_at)
     VALUES ('ig', 'org-1', 'instagram', 'acme', NULL, 1, ?), ('li', 'org-1', 'linkedin', 'acme', NULL, 1, ?)`,
    [NOW, NOW],
  );
  return sql;
}

function fakeZernio(fail: (call: number, input: ZernioPostInput) => Error | null = () => null) {
  const posts: ZernioPostInput[] = [];
  const uploads: string[] = [];
  let calls = 0;
  const zernio = {
    findProfile: async () => null,
    createProfile: async () => ({ _id: "prof-1", name: "Acme", externalId: "org-1" }),
    listAccounts: async () => [],
    connectUrl: async () => "https://example.com/oauth",
    disconnectAccount: async () => undefined,
    presign: async (filename: string) => ({ uploadUrl: `https://up/${filename}`, publicUrl: `https://media/${filename}` }),
    upload: async (url: string) => {
      uploads.push(url);
    },
    createPost: async (input: ZernioPostInput) => {
      calls += 1;
      const error = fail(calls, input);
      if (error) throw error;
      posts.push(input);
      return { _id: `zp-${calls}`, status: input.publishNow ? "publishing" : input.isDraft ? "draft" : "scheduled" };
    },
    getPost: async () => ({ _id: "zp-1", status: "published", platforms: [] }),
    reschedulePost: async (postId: string) => ({ _id: postId, status: "scheduled" }),
    deletePost: async () => undefined,
    listWebhooks: async () => [],
    saveWebhook: async (input: { name: string; url: string; events: string[] }) => ({ _id: "wh", ...input }),
  } as ZernioClient;
  return { zernio, posts, uploads };
}

describe("social commands", () => {
  it("requires a single-use confirmation bound to the plan, then replays the same external id", async () => {
    const sql = await database();
    const { zernio, posts } = fakeZernio();
    const plan = await prepareSocialPlan(sql, {
      organizationId: "org-1",
      actor: staff,
      action: "publish_now",
      mode: "explicit",
      itemIds: ["i-pic"],
      accountIds: ["ig"],
      timing: { kind: "now", now: NOW },
      now: NOW,
    });
    expect(plan.authorization).toBe("confirmation_required");
    await expect(
      executeSocialPlan(sql, {
        organizationId: "org-1",
        actor: staff,
        planId: plan.planId,
        planHash: plan.planHash,
        externalId: "ext-missing",
        now: NOW,
        zernio,
        store,
      }),
    ).rejects.toMatchObject({ status: 403, reasonCode: "confirmation_required" });
    const confirmation = await issueConfirmation(sql, { planId: plan.planId, planHash: plan.planHash, actor: staff, now: NOW });
    expect(confirmation.expiresAt - NOW).toBe(CONFIRM_SHORT_TTL_MS);
    await expect(
      executeSocialPlan(sql, {
        organizationId: "org-1",
        actor: staff,
        planId: plan.planId,
        planHash: plan.planHash,
        externalId: "ext-late",
        confirmationId: confirmation.id,
        now: NOW + CONFIRM_SHORT_TTL_MS,
        zernio,
        store,
      }),
    ).rejects.toMatchObject({ status: 403, reasonCode: "confirmation_required" });
    const done = await executeSocialPlan(sql, {
      organizationId: "org-1",
      actor: staff,
      planId: plan.planId,
      planHash: plan.planHash,
      externalId: "ext-1",
      confirmationId: confirmation.id,
      now: NOW,
      zernio,
      store,
    });
    expect(done).toMatchObject({ status: 200, duplicate: false, outcomes: [{ itemId: "i-pic", accountId: "ig", outcome: "succeeded" }] });
    expect(posts).toHaveLength(1);
    const again = await executeSocialPlan(sql, {
      organizationId: "org-1",
      actor: staff,
      planId: plan.planId,
      planHash: plan.planHash,
      externalId: "ext-1",
      confirmationId: confirmation.id,
      now: NOW + 5,
      zernio,
      store,
    });
    expect(again).toMatchObject({ duplicate: true, status: 200 });
    expect(posts).toHaveLength(1);
    await expect(
      executeSocialPlan(sql, {
        organizationId: "org-1",
        actor: staff,
        planId: plan.planId,
        planHash: plan.planHash,
        externalId: "ext-2",
        now: NOW + 10,
        zernio,
        store,
      }),
    ).rejects.toMatchObject({ status: 409, reasonCode: "stale_plan" });
    expect(posts).toHaveLength(1);
  });

  it("keeps each target outcome and skips unapproved or changed work before upload", async () => {
    const sql = await database();
    const { zernio, posts, uploads } = fakeZernio((call) => (call === 2 ? new Error("Instagram token expired") : null));
    const plan = await prepareSocialPlan(sql, {
      organizationId: "org-1",
      actor: lead,
      action: "schedule",
      mode: "explicit",
      itemIds: ["i-pic", "i-other", "i-open"],
      accountIds: ["ig"],
      timing: scheduled,
      now: NOW,
    });
    const done = await executeSocialPlan(sql, {
      organizationId: "org-1",
      actor: lead,
      planId: plan.planId,
      planHash: plan.planHash,
      externalId: "batch-1",
      now: NOW,
      zernio,
      store,
    });
    expect(done.status).toBe(200);
    expect(done.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemId: "i-pic", outcome: "scheduled" }),
        expect.objectContaining({ itemId: "i-other", outcome: "failed" }),
        expect.objectContaining({ itemId: "i-open", accountId: "ig", outcome: "not_attempted" }),
      ]),
    );
    expect(posts.length).toBeGreaterThan(0);
    expect(uploads.join(" ")).not.toContain("i-open");
    const kept = await sql.get<{ outcome: string }>(
      `SELECT t.outcome FROM social_post_targets t JOIN social_posts p ON p.id = t.post_id WHERE p.item_id = 'i-pic' LIMIT 1`,
    );
    expect(kept?.outcome).toBe("scheduled");
    const activity = await sql.get<{ actor_kind: string; data_json: string }>(
      "SELECT actor_kind, data_json FROM activities WHERE kind = 'social.plan.executed'",
    );
    expect(activity?.actor_kind).toBe("agent");
    expect(activity?.data_json ?? "").not.toMatch(/Caption|sk_|bearer/i);
    expect(activity?.data_json).toContain("batch-1");

    const fresh = await database();
    const quiet = fakeZernio();
    const stale = await prepareSocialPlan(fresh, {
      organizationId: "org-1",
      actor: staff,
      action: "schedule",
      mode: "explicit",
      itemIds: ["i-pic"],
      accountIds: ["ig"],
      timing: scheduled,
      now: NOW,
    });
    await fresh.run("UPDATE deliverables SET version = 2, updated_at = ? WHERE id = 'd-1'", [NOW]);
    await expect(
      executeSocialPlan(fresh, {
        organizationId: "org-1",
        actor: staff,
        planId: stale.planId,
        planHash: stale.planHash,
        externalId: "changed",
        now: NOW,
        zernio: quiet.zernio,
        store,
      }),
    ).rejects.toMatchObject({ status: 409, reasonCode: "stale_plan" });
    expect(quiet.uploads).toHaveLength(0);
  });

  it("returns 202 and leaves the local row sending when the provider times out after creation", async () => {
    const sql = await database();
    const { zernio } = fakeZernio(() => new ZernioError("timeout", 408));
    const plan = await prepareSocialPlan(sql, {
      organizationId: "org-1",
      actor: lead,
      action: "schedule",
      mode: "explicit",
      itemIds: ["i-pic"],
      accountIds: ["ig"],
      timing: scheduled,
      now: NOW,
    });
    const done = await executeSocialPlan(sql, {
      organizationId: "org-1",
      actor: lead,
      planId: plan.planId,
      planHash: plan.planHash,
      externalId: "timeout-1",
      now: NOW,
      zernio,
      store,
    });
    expect(done.status).toBe(202);
    expect(done.outcomes[0]).toMatchObject({ outcome: "uncertain", itemId: "i-pic" });
    const row = await sql.get<{ status: string; id: string }>("SELECT id, status FROM social_posts");
    expect(row).toMatchObject({ status: "sending" });
    expect(done.outcomes[0]?.postId).toBe(row?.id);
    const target = await sql.get<{ outcome: string }>("SELECT outcome FROM social_post_targets");
    expect(target?.outcome).toBe("uncertain");
  });
});
