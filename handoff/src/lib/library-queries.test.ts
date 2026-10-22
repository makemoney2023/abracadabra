import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import type { Caller } from "@/lib/authz";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { LIBRARY_PAGE_SIZE, listLibraryArtifacts, staffLibrarySummaries } from "./library-queries";

const NOW = 1_800_000_000_000;
const member: Caller = { userId: "member-1", staff: null, operatorOf: [], memberships: [{ workspaceId: "ws-1", role: "client_member" }] };
const staff: Caller = { userId: "staff-1", staff: { superAdmin: false }, operatorOf: ["ws-1"], memberships: [] };

function watched(sql: Sql): { sql: Sql; reads: () => number } {
  let reads = 0;
  return {
    reads: () => reads,
    sql: {
      exec: async (statement) => sql.exec(statement),
      run: async (statement, params) => sql.run(statement, params),
      batch: async (statements) => sql.batch(statements),
      all: async (statement, params) => {
        reads += 1;
        return sql.all(statement, params);
      },
      get: async (statement, params) => {
        reads += 1;
        return sql.get(statement, params);
      },
    },
  };
}

async function database(): Promise<Sql> {
  const sql = sqliteSql(new DatabaseSync(":memory:"));
  await migrate(sql);
  await sql.run(
    `INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES ('org-1', 'Acme', 'acme.example', 'client', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO workspaces (
       id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days,
       request_digest, status, opened_at, organization_id
     ) VALUES ('ws-1', 'acme', 'Acme', 'Acme', 'Studio', 'standard', 1000, 30, 0, 'active', ?, 'org-1'),
              ('ws-2', 'other', 'Other', 'Other', 'Studio', 'standard', 1000, 30, 0, 'active', ?, 'org-1')`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO projects (id, organization_id, name, status, created_at, updated_at) VALUES ('project-1', 'org-1', 'Q4 launch', 'active', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO client_agents (id, label, token_hash, created_at, updated_at) VALUES ('agent1', 'Ada', 'hash', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO batches (id, workspace_id, created_by, created_at, last_activity_at, held_at, released_at)
     VALUES ('batch-live', 'ws-1', 'staff-1', ?, ?, NULL, NULL),
            ('batch-held', 'ws-1', 'staff-1', ?, ?, ?, NULL),
            ('batch-file', 'ws-1', 'staff-1', ?, ?, NULL, NULL)`,
    [NOW, NOW, NOW, NOW, NOW, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO agent_work_items (
       id, agent_id, external_id, state, kind, title, organization_id, workspace_id, created_at, updated_at
     ) VALUES ('work-live', 'agent1', 'live', 'filed', 'site', 'Live site', 'org-1', 'ws-1', ?, ?),
              ('work-held', 'agent1', 'held', 'filed', 'site', 'Held site', 'org-1', 'ws-1', ?, ?)`,
    [NOW, NOW, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO built_work (
       id, work_item_id, batch_id, organization_id, workspace_id, title, live_url, status, created_at
     ) VALUES ('built-live', 'work-live', 'batch-live', 'org-1', 'ws-1', 'Live site', 'https://live.example', 'live', ?),
              ('built-held', 'work-held', 'batch-held', 'org-1', 'ws-1', 'Held site', 'https://held.example', 'live', ?)`,
    [NOW, NOW - 10],
  );
  await sql.run(
    `INSERT INTO deliverables (
       id, organization_id, project_id, workspace_id, title, kind, status, version, published_version, published_at, actor_kind, created_at, updated_at
     ) VALUES ('d-live', 'org-1', 'project-1', 'ws-1', 'Launch', 'document', 'approved', 1, 1, ?, 'staff', ?, ?),
              ('d-draft', 'org-1', 'project-1', 'ws-1', 'Secret draft', 'document', 'draft', 1, NULL, NULL, 'staff', ?, ?)`,
    [NOW, NOW, NOW, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO deliverable_items (
       id, deliverable_id, version, format, channel, title, copy_text, media_json, link_url, status, sort
     ) VALUES ('item-article', 'd-live', 1, 'link', NULL, 'Q4 article', 'Body', '[]', 'https://news.example/q4', 'approved', 0),
              ('item-social', 'd-live', 1, 'static', 'linkedin', 'LinkedIn launch', 'Caption', '[]', NULL, 'approved', 1),
              ('item-draft', 'd-draft', 1, 'link', NULL, 'Secret draft', NULL, '[]', 'https://secret.example', 'pending', 0)`,
  );
  await sql.run(
    `INSERT INTO deliverable_artifact_metadata (
       id, organization_id, workspace_id, deliverable_id, item_id, version, artifact_type, dek, canonical_url,
       author_name, article_status, external_published_at, created_at, updated_at
     ) VALUES ('meta-1', 'org-1', 'ws-1', 'd-live', 'item-article', 1, 'article', 'The launch story', 'https://news.example/q4?utm_source=keep', 'Ada', 'published', ?, ?, ?)`,
    [NOW, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO social_accounts (id, organization_id, platform, display_name, is_active, synced_at)
     VALUES ('acct-li', 'org-1', 'linkedin', 'Acme LinkedIn', 1, ?),
            ('acct-ig', 'org-1', 'instagram', 'Acme Instagram', 1, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO social_posts (
       id, organization_id, deliverable_id, item_id, version, account_ids, mode, post_type, status, published_urls, created_at, updated_at
     ) VALUES ('post-1', 'org-1', 'd-live', 'item-social', 1, '["acct-li","acct-ig"]', 'now', 'feed', 'partial', ?, ?, ?)`,
    [JSON.stringify({ "acct-li": "https://www.linkedin.com/feed/update/1" }), NOW, NOW],
  );
  await sql.run(
    `INSERT INTO social_post_targets (
       id, post_id, organization_id, account_id, platform, outcome, public_url, error, updated_at
     ) VALUES ('target-li', 'post-1', 'org-1', 'acct-li', 'linkedin', 'succeeded', 'https://www.linkedin.com/feed/update/1', NULL, ?),
              ('target-ig', 'post-1', 'org-1', 'acct-ig', 'instagram', 'failed', NULL, 'The network rejected the picture.', ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO files (
       id, batch_id, workspace_id, relative_path, extension, size_bytes, object_key, tag, status, scan_attempts, created_at
     ) VALUES ('file-clean', 'batch-file', 'ws-1', 'Q4/brief.pdf', 'pdf', 12, 'ws-1/batch-file/file-clean', 'source', 'clean', 0, ?),
              ('file-raw', 'batch-file', 'ws-1', 'Q4/raw.pdf', 'pdf', 12, 'ws-1/batch-file/file-raw', 'source', 'uploaded', 0, ?)`,
    [NOW - 50, NOW - 40],
  );
  await sql.run(
    `INSERT INTO library_file_selections (id, organization_id, workspace_id, file_id, selected_by, selected_at)
     VALUES ('sel-1', 'org-1', 'ws-1', 'file-clean', 'staff-1', ?)`,
    [NOW - 50],
  );
  return sql;
}

describe("library queries", () => {
  it("authorizes before reading and hides held, unreleased, unselected, and foreign records", async () => {
    const sql = await database();
    const probe = watched(sql);
    const missing = await listLibraryArtifacts(probe.sql, member, { workspaceId: "ws-2" });
    expect(missing).toEqual({ ok: false, error: "missing" });
    expect(probe.reads()).toBe(0);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() => {
      throw new Error("library reads must stay local");
    }) as typeof fetch;
    try {
      const page = await listLibraryArtifacts(sql, member, { workspaceId: "ws-1", includeHeld: true });
      expect(page.ok).toBe(true);
      if (!page.ok) return;
      const titles = page.page.artifacts.map((artifact) => artifact.title);
      expect(titles).toContain("Q4 article");
      expect(titles).toContain("Live site");
      expect(titles).toContain("brief.pdf");
      expect(titles).not.toContain("Held site");
      expect(titles).not.toContain("Secret draft");
      expect(titles).not.toContain("raw.pdf");
      const staffPage = await listLibraryArtifacts(sql, staff, { workspaceId: "ws-1", includeHeld: true });
      expect(staffPage.ok && staffPage.page.artifacts.some((artifact) => artifact.title === "Held site")).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps partial social outcomes and pages a family without losing the boundary", async () => {
    const sql = await database();
    const social = await listLibraryArtifacts(sql, member, { workspaceId: "ws-1", platform: "linkedin" });
    expect(social.ok).toBe(true);
    if (!social.ok) return;
    expect(social.page.artifacts.map((artifact) => artifact.title)).toEqual(["LinkedIn launch"]);
    const article = social.page.artifacts[0];
    expect(article?.primaryStatus).toBe("partially_published");
    expect(article?.destinations.map((destination) => destination.state)).toEqual(expect.arrayContaining(["published", "failed"]));
    expect(JSON.stringify(article)).not.toContain("rejected the picture");
    const staffSocial = await listLibraryArtifacts(sql, staff, { workspaceId: "ws-1", platform: "linkedin" });
    expect(staffSocial.ok && JSON.stringify(staffSocial.page.artifacts[0])).toContain("rejected the picture");

    for (let index = 0; index < 25; index += 1) {
      await sql.run(
        `INSERT INTO deliverable_items (
           id, deliverable_id, version, format, title, media_json, link_url, status, sort
         ) VALUES (?, 'd-live', 1, 'page', ?, '[]', NULL, 'approved', ?)`,
        [`page-${String(index).padStart(2, "0")}`, `Note ${index}`, index],
      );
    }
    const first = await listLibraryArtifacts(sql, member, { workspaceId: "ws-1", sort: "title" });
    const second = await listLibraryArtifacts(sql, member, { workspaceId: "ws-1", sort: "title", cursor: first.ok ? first.page.nextCursor : null });
    expect(first.ok && first.page.artifacts).toHaveLength(LIBRARY_PAGE_SIZE);
    expect(second.ok && second.page.artifacts.length).toBeGreaterThan(0);
    if (!first.ok || !second.ok) return;
    const seen = new Set(first.page.artifacts.map((artifact) => artifact.artifactKey));
    expect(second.page.artifacts.every((artifact) => !seen.has(artifact.artifactKey))).toBe(true);
    expect(first.page.counts.total).toBeGreaterThan(LIBRARY_PAGE_SIZE);
  });

  it("pages past the first hundred records and counts only the active filters", async () => {
    const sql = await database();
    for (let index = 0; index < 120; index += 1) {
      await sql.run(
        `INSERT INTO deliverable_items (
           id, deliverable_id, version, format, title, copy_text, media_json, link_url, status, sort
         ) VALUES (?, 'd-live', 1, 'page', ?, ?, '[]', NULL, 'approved', ?)`,
        [`note-${String(index).padStart(3, "0")}`, `Note ${String(index).padStart(3, "0")}`, index % 2 === 0 ? "field notes" : "other", index],
      );
    }
    const titles: string[] = [];
    let cursor: string | null = null;
    let total = 0;
    for (let pageNumber = 0; pageNumber < 12; pageNumber += 1) {
      const page = await listLibraryArtifacts(sql, member, { workspaceId: "ws-1", sort: "title", cursor });
      expect(page.ok).toBe(true);
      if (!page.ok) return;
      total = page.page.counts.total;
      titles.push(...page.page.artifacts.map((artifact) => artifact.title));
      cursor = page.page.nextCursor;
      if (!cursor) break;
    }
    expect(titles.filter((title) => title.startsWith("Note "))).toHaveLength(120);
    expect(total).toBeGreaterThanOrEqual(120);
    expect(new Set(titles).size).toBe(titles.length);
    const published = await listLibraryArtifacts(sql, member, { workspaceId: "ws-1", status: "published" });
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    expect(published.page.artifacts.every((artifact) => artifact.primaryStatus === "published")).toBe(true);
    expect(published.page.counts.total).toBe(published.page.artifacts.length);
    expect(published.page.counts.total).toBe(2);
    expect(published.page.counts.total).toBeLessThan(total);
    const excerpt = await listLibraryArtifacts(sql, member, { workspaceId: "ws-1", search: "field notes" });
    expect(excerpt.ok && excerpt.page.counts.total).toBe(60);
    const account = await listLibraryArtifacts(sql, member, { workspaceId: "ws-1", search: "Acme LinkedIn" });
    expect(account.ok && account.page.artifacts.map((artifact) => artifact.title)).toEqual(["LinkedIn launch"]);
  });

  it("counts every item that needs review, not only the first page", async () => {
    const sql = await database();
    for (let index = 0; index < 30; index += 1) {
      await sql.run(
        `INSERT INTO deliverable_items (
           id, deliverable_id, version, format, title, media_json, link_url, status, sort
         ) VALUES (?, 'd-live', 1, 'page', ?, '[]', NULL, 'pending', ?)`,
        [`review-${index}`, `Review ${index}`, index],
      );
    }
    const summaries = await staffLibrarySummaries(sql, staff, [{ id: "ws-1", slug: "acme", display_name: "Acme" }]);
    expect(summaries[0]?.reviewNeeded).toBe(30);
  });

  it("rejects an overlong search before querying", async () => {
    const sql = await database();
    const probe = watched(sql);
    const result = await listLibraryArtifacts(probe.sql, member, { workspaceId: "ws-1", search: "a".repeat(201) });
    expect(result).toEqual({ ok: false, error: "invalid" });
    expect(probe.reads()).toBe(0);
  });
});
