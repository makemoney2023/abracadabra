import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import type { SocialActor } from "./social-policy";
import { PLAN_TTL_MS, loadExecutablePlan, planHash, prepareSocialPlan, type PlanIdentity } from "./social-plans";

const NOW = 1_800_000_000_000;
const staff: SocialActor = { kind: "staff", id: "staff-1" };
const member: SocialActor = { kind: "client_member", id: "member-1" };

const timing = { kind: "scheduled" as const, startAt: NOW + 120_000, gapMinutes: 60, now: NOW };

function identity(patch: Partial<PlanIdentity> = {}): PlanIdentity {
  return {
    organizationId: "org-1",
    actorKind: "staff",
    actorId: "staff-1",
    action: "schedule",
    executable: [
      {
        itemId: "i-pic",
        version: 1,
        accountId: "ig",
        platform: "instagram",
        postType: "feed",
        scheduleAt: NOW + 120_000,
        options: { shareToFeed: true, contentType: "image" },
      },
    ],
    blocked: [],
    timing,
    cadenceRevision: null,
    ...patch,
  };
}

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
      [id, `Piece ${id}`, JSON.stringify([{ r2_key: "pic", role: "main", content_type: "image/png" }]), status, sort],
    );
  await item("i-pic", 0, "approved");
  await item("i-open", 1, "pending");
  await item("i-other", 2, "approved");
  await sql.run(
    `INSERT INTO social_accounts (id, organization_id, platform, username, display_name, is_active, synced_at)
     VALUES ('ig', 'org-1', 'instagram', 'acme', NULL, 1, ?)`,
    [NOW],
  );
  return sql;
}

describe("social plan identity", () => {
  it("hashes the same payload once, including option key order", () => {
    const left = planHash(identity());
    const right = planHash(
      identity({
        executable: [
          {
            itemId: "i-pic",
            version: 1,
            accountId: "ig",
            platform: "instagram",
            postType: "feed",
            scheduleAt: NOW + 120_000,
            options: { contentType: "image", shareToFeed: true },
          },
        ],
      }),
    );
    expect(left).toBe(right);
    expect(planHash(identity({ executable: [{ ...identity().executable[0], version: 2 }] }))).not.toBe(left);
    expect(planHash(identity({ actorId: "staff-2" }))).not.toBe(left);
    expect(planHash(identity({ cadenceRevision: NOW }))).not.toBe(left);
    expect(planHash(identity({ blocked: [{ itemId: "i-pic", accountId: "ig", reason: "disconnected" }], executable: [] }))).not.toBe(left);
  });
});

describe("prepareSocialPlan", () => {
  it("persists the exact eligible ids, a 30 minute expiry, blocked rows, and a redacted activity", async () => {
    const sql = await database();
    const prepared = await prepareSocialPlan(sql, {
      organizationId: "org-1",
      actor: staff,
      action: "schedule",
      mode: "eligible",
      itemIds: ["i-pic", "i-open"],
      accountIds: ["ig"],
      timing,
      now: NOW,
    });
    expect(prepared.expiresAt - NOW).toBe(PLAN_TTL_MS);
    expect(prepared.authorization).toBe("allowed");
    expect(prepared.executable.map((row) => row.itemId)).toEqual(["i-pic"]);
    expect(prepared.blocked.map((row) => row.reason)).toEqual(["unapproved"]);
    const stored = await sql.get<{ request_json: string; rows_json: string; blocked_json: string; plan_hash: string }>(
      "SELECT request_json, rows_json, blocked_json, plan_hash FROM social_publish_plans",
    );
    expect(JSON.parse(stored?.request_json ?? "{}").itemIds).toEqual(["i-pic", "i-open"]);
    expect(JSON.parse(stored?.rows_json ?? "[]")).toHaveLength(1);
    expect(JSON.parse(stored?.blocked_json ?? "[]")).toHaveLength(1);
    expect(stored?.plan_hash).toBe(prepared.planHash);
    expect(stored?.request_json).not.toContain("i-other");
    const activity = await sql.get<{ kind: string; actor_kind: string; body: string | null; data_json: string | null }>(
      "SELECT kind, actor_kind, body, data_json FROM activities",
    );
    expect(activity).toMatchObject({ kind: "social.plan.prepared", actor_kind: "staff" });
    expect(`${activity?.body ?? ""} ${activity?.data_json ?? ""}`).not.toMatch(/Caption|sk_|token/i);
  });

  it("denies an empty selection and a client member, and rejects stale, expired, and denied plans", async () => {
    const sql = await database();
    const empty = await prepareSocialPlan(sql, {
      organizationId: "org-1",
      actor: staff,
      action: "schedule",
      mode: "explicit",
      itemIds: [],
      accountIds: [],
      timing,
      now: NOW,
    });
    expect(empty).toMatchObject({ authorization: "denied", reasonCode: "selection_required", executable: [], blocked: [] });
    await expect(
      loadExecutablePlan(sql, { organizationId: "org-1", actor: staff, planId: empty.planId, planHash: empty.planHash, now: NOW }),
    ).rejects.toMatchObject({ status: 403, reasonCode: "denied" });

    const denied = await prepareSocialPlan(sql, {
      organizationId: "org-1",
      actor: member,
      action: "schedule",
      mode: "explicit",
      itemIds: ["i-pic"],
      accountIds: ["ig"],
      timing,
      now: NOW,
    });
    expect(denied.reasonCode).toBe("role_denied");
    await expect(
      loadExecutablePlan(sql, { organizationId: "org-1", actor: member, planId: denied.planId, planHash: denied.planHash, now: NOW }),
    ).rejects.toMatchObject({ status: 403, reasonCode: "denied" });

    const ready = await prepareSocialPlan(sql, {
      organizationId: "org-1",
      actor: staff,
      action: "schedule",
      mode: "explicit",
      itemIds: ["i-pic"],
      accountIds: ["ig"],
      timing,
      now: NOW,
    });
    await expect(
      loadExecutablePlan(sql, { organizationId: "org-1", actor: staff, planId: ready.planId, planHash: "nope", now: NOW }),
    ).rejects.toMatchObject({ status: 409, reasonCode: "stale_plan" });
    await expect(
      loadExecutablePlan(sql, { organizationId: "org-1", actor: staff, planId: ready.planId, planHash: ready.planHash, now: NOW + PLAN_TTL_MS }),
    ).rejects.toMatchObject({ status: 409, reasonCode: "stale_plan" });
    await expect(
      loadExecutablePlan(sql, { organizationId: "org-1", actor: { kind: "staff", id: "staff-2" }, planId: ready.planId, planHash: ready.planHash, now: NOW }),
    ).rejects.toMatchObject({ status: 409, reasonCode: "stale_plan" });

    await sql.run(
      `INSERT INTO social_autopost (organization_id, enabled, account_ids, weekdays, times, timezone, updated_by, updated_at)
       VALUES ('org-1', 0, '[]', '1,2,3,4,5', '09:00', 'UTC', 'staff-1', ?)`,
      [NOW + 1],
    );
    await expect(
      loadExecutablePlan(sql, { organizationId: "org-1", actor: staff, planId: ready.planId, planHash: ready.planHash, now: NOW }),
    ).rejects.toMatchObject({ status: 409, reasonCode: "stale_plan" });
  });

  it("does not schedule a removed piece or an unpublished round", async () => {
    const sql = await database();
    await sql.run("UPDATE deliverable_items SET removed_at = ? WHERE id = 'i-other'", [NOW]);
    await sql.run(
      `INSERT INTO deliverables (
         id, organization_id, project_id, workspace_id, title, kind, status, version, published_version,
         actor_kind, actor_id, created_at, updated_at
       ) VALUES ('d-draft', 'org-1', NULL, 'ws-1', 'Draft round', 'social_pack', 'draft', 1, NULL, 'staff', 'staff-1', ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO deliverable_items (
         id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
       ) VALUES ('i-draft', 'd-draft', 1, NULL, 'static', NULL, 'Working copy', 'Caption', ?, NULL, 'approved', 0)`,
      [JSON.stringify([{ r2_key: "pic", role: "main", content_type: "image/png" }])],
    );
    const prepared = await prepareSocialPlan(sql, {
      organizationId: "org-1",
      actor: staff,
      action: "schedule",
      mode: "explicit",
      itemIds: ["i-other", "i-draft", "i-pic"],
      accountIds: ["ig"],
      timing,
      now: NOW,
    });
    expect(prepared.executable.map((row) => row.itemId)).toEqual(["i-pic"]);
  });
});
