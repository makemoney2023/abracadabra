import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import type { AgentPrincipal } from "./agent-work-filing";
import {
  getAgentSocialPlan,
  listAgentAttention,
  listAgentSocialAccounts,
  listAgentSocialPieces,
  listAgentSocialPosts,
  socialAgentActionsEnabled,
  socialOverview,
} from "./social-queries";

const NOW = 1_800_000_000_000;
const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");
const lead: AgentPrincipal = {
  agentId: "agent-1",
  label: "Lead",
  assignments: [{ organizationId: "org-1", workspaceId: "ws-1", projectId: null, role: "lead" }],
};

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
    `INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES ('org-1', 'Acme', 'acme.example', 'client', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO deliverables (
       id, organization_id, project_id, workspace_id, title, kind, status, version, published_version,
       actor_kind, actor_id, created_at, updated_at
     ) VALUES ('d-1', 'org-1', NULL, 'ws-1', 'October social', 'social_pack', 'in_review', 1, 1, 'staff', 'staff-1', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO deliverable_items (
       id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
     ) VALUES ('i-ready', 'd-1', 1, NULL, 'static', NULL, 'Ready', 'Caption', ?, NULL, 'approved', 0)`,
    [JSON.stringify([{ r2_key: "ready-pic", role: "main", content_type: "image/png" }])],
  );
  await sql.run(
    `INSERT INTO social_accounts (id, organization_id, platform, username, display_name, is_active, synced_at)
     VALUES ('ig', 'org-1', 'instagram', 'acme', 'Acme', 1, ?),
            ('ig-old', 'org-1', 'instagram', 'old', 'Old', 0, ?),
            ('pin', 'org-1', 'pinterest', 'pins', 'Pins', 1, ?),
            ('blog', 'org-1', 'wordpress', 'blog', 'Blog', 1, ?)`,
    [NOW, NOW, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO social_posts (
       id, organization_id, deliverable_id, item_id, version, account_ids, mode, post_type, status,
       zernio_post_id, error, scheduled_for, created_at, updated_at
     ) VALUES ('post-1', 'org-1', 'd-1', 'i-ready', 1, '["ig"]', 'scheduled', 'feed', 'scheduled', 'zp-secret', ?, ?, ?, ?)`,
    [JSON.stringify({ access_token: "tok", provider: "raw" }), NOW + 86_400_000, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO social_attention_items (
       id, organization_id, source_kind, source_id, target, kind, status, recovery_action, detail_json, created_at, updated_at
     ) VALUES ('att-1', 'org-1', 'post', 'post-1', 'ig', 'rejected_target', 'open', 'retry', ?, ?, ?)`,
    [JSON.stringify({ r2_key: "secret-object", access_token: "tok", sk_: "sk_secret" }), NOW, NOW],
  );
  await sql.run(
    `INSERT INTO social_publish_plans (
       id, organization_id, actor_kind, actor_id, action, request_json, rows_json, blocked_json, warnings_json,
       plan_hash, authorization, expires_at, created_at
     ) VALUES ('plan-1', 'org-1', 'agent', 'agent-1', 'schedule', '{}', '[]', '[]', '[]', 'hash-1', 'allowed', ?, ?)`,
    [NOW + 60_000, NOW],
  );
  await sql.run(
    `INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES ('org-2', 'Other', 'other.example', 'client', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO social_publish_plans (
       id, organization_id, actor_kind, actor_id, action, request_json, rows_json, blocked_json, warnings_json,
       plan_hash, authorization, expires_at, created_at
     ) VALUES ('plan-other', 'org-2', 'agent', 'other', 'schedule', '{}', '[]', '[]', '[]', 'hash-2', 'allowed', ?, ?)`,
    [NOW + 60_000, NOW],
  );
  return sql;
}

describe("social read models", () => {
  afterEach(() => {
    delete process.env.SOCIAL_AGENT_ACTIONS;
    delete (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT];
  });

  it("counts ready work, hides ineligible accounts, and omits secrets", async () => {
    const sql = await database();
    const overview = await socialOverview(sql, lead, { domain: "acme.example" }, NOW);
    expect(overview.ok).toBe(true);
    if (!overview.ok) return;
    expect(overview.policy).toMatchObject({ mode: "draft", authorization: "allowed" });
    expect(overview.policy.capabilities).toContain("social.read");
    expect(overview.policy.capabilities).toContain("social.cadence.manage");
    expect(overview.readyCount).toBe(0);
    expect(overview.scheduledCount).toBe(1);
    expect(overview.attentionCount).toBe(1);
    expect(overview.nextSlots.length).toBeGreaterThan(0);
    expect(overview.accountHealth.map((row) => row.id).sort()).toEqual(["ig", "ig-old"]);
    expect(overview.accountHealth.find((row) => row.id === "ig-old")?.active).toBe(false);

    const accounts = await listAgentSocialAccounts(sql, lead, "acme.example");
    expect(accounts.ok).toBe(true);
    if (!accounts.ok) return;
    expect(accounts.accounts.map((row) => row.id)).toEqual(["ig"]);

    const pieces = await listAgentSocialPieces(sql, lead, { client: "acme.example", state: "scheduled" }, NOW);
    expect(pieces.ok).toBe(true);
    if (!pieces.ok) return;
    expect(pieces.pieces).toEqual([
      expect.objectContaining({
        itemId: "i-ready",
        deliverableId: "d-1",
        state: "scheduled",
        media: { count: 1, kinds: ["image"], keys: ["ready-pic"] },
      }),
    ]);
    expect(JSON.stringify(pieces)).not.toMatch(/r2_key|access_token|sk_|zp-secret/);

    const posts = await listAgentSocialPosts(sql, lead, {
      client: "acme.example",
      status: "scheduled",
      from: NOW + 1_000,
      to: NOW + 2 * 86_400_000,
      limit: 1,
      offset: 0,
    });
    expect(posts.ok).toBe(true);
    if (!posts.ok) return;
    expect(posts.posts).toHaveLength(1);
    expect(posts.posts[0].id).toBe("post-1");
    expect(JSON.stringify(posts)).not.toMatch(/r2_key|access_token|sk_|zp-secret|provider/);

    const attention = await listAgentAttention(sql, lead, "acme.example");
    expect(attention.ok).toBe(true);
    if (!attention.ok) return;
    expect(attention.items).toEqual([
      expect.objectContaining({ id: "att-1", kind: "rejected_target", status: "open", recoveryAction: "retry" }),
    ]);
    expect(JSON.stringify(attention)).not.toMatch(/r2_key|access_token|sk_secret/);

    const foreign = await getAgentSocialPlan(sql, lead, "plan-other");
    expect(foreign).toMatchObject({ ok: false, status: 404, reasonCode: "not_found" });
    const own = await getAgentSocialPlan(sql, lead, "plan-1");
    expect(own.ok).toBe(true);
    if (!own.ok) return;
    expect(own.planId).toBe("plan-1");
    expect(own.authorization).toBe("allowed");
  });

  it("treats the agent-actions flag as off unless it is explicitly on", () => {
    expect(socialAgentActionsEnabled()).toBe(false);
    process.env.SOCIAL_AGENT_ACTIONS = "on";
    expect(socialAgentActionsEnabled()).toBe(true);
    process.env.SOCIAL_AGENT_ACTIONS = "false";
    expect(socialAgentActionsEnabled()).toBe(false);
  });

  it("reads SOCIAL_AGENT_ACTIONS from the worker binding when process env is unset", () => {
    delete process.env.SOCIAL_AGENT_ACTIONS;
    (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT] = { env: { SOCIAL_AGENT_ACTIONS: "on" } };
    expect(socialAgentActionsEnabled()).toBe(true);
    (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT] = { env: { SOCIAL_AGENT_ACTIONS: "off" } };
    expect(socialAgentActionsEnabled()).toBe(false);
    process.env.SOCIAL_AGENT_ACTIONS = "on";
    expect(socialAgentActionsEnabled()).toBe(true);
  });
});
