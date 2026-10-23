import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { Caller } from "@/lib/authz";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { listLibraryArtifacts } from "./library-queries";
import { includeFromForm, libraryProjectOk, projectInLibrary } from "./project-library";

const NOW = 1_800_000_000_000;
const member: Caller = { userId: "member-1", staff: null, operatorOf: [], memberships: [{ workspaceId: "ws-shared", role: "client_member" }, { workspaceId: "ws-print", role: "client_member" }] };

/** One client, one shared Space (two projects: social + print), and a Space that belongs to the print project alone. */
async function database(): Promise<Sql> {
  const sql = sqliteSql(new DatabaseSync(":memory:"));
  await migrate(sql);
  await sql.run(`INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES ('org-1', 'Acme', 'acme.example', 'client', ?, ?)`, [NOW, NOW]);
  await sql.run(
    `INSERT INTO projects (id, organization_id, name, status, created_at, updated_at, include_in_library)
     VALUES ('p-social', 'org-1', 'Social', 'active', ?, ?, 1), ('p-print', 'org-1', 'Print run', 'active', ?, ?, 0)`,
    [NOW, NOW, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO workspaces (id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id, project_id)
     VALUES ('ws-shared', 'shared', 'Shared', 'Shared', 'Studio', 'standard', 1000, 30, 0, 'active', ?, 'org-1', NULL),
            ('ws-print', 'print', 'Print', 'Print', 'Studio', 'standard', 1000, 30, 0, 'active', ?, 'org-1', 'p-print')`,
    [NOW, NOW],
  );
  await sql.run(`INSERT INTO client_agents (id, label, token_hash, created_at, updated_at) VALUES ('agent1', 'Ada', 'hash', ?, ?)`, [NOW, NOW]);
  await sql.run(
    `INSERT INTO batches (id, workspace_id, created_by, created_at, last_activity_at)
     VALUES ('b-shared', 'ws-shared', 'staff-1', ?, ?), ('b-print', 'ws-print', 'staff-1', ?, ?)`,
    [NOW, NOW, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO agent_work_items (id, agent_id, external_id, state, kind, title, organization_id, workspace_id, created_at, updated_at)
     VALUES ('w-site-social', 'agent1', 'a', 'filed', 'site', 'Social site', 'org-1', 'ws-shared', ?, ?),
            ('w-site-print', 'agent1', 'b', 'filed', 'site', 'Print site', 'org-1', 'ws-shared', ?, ?)`,
    [NOW, NOW, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO built_work (id, work_item_id, batch_id, organization_id, workspace_id, project_id, title, live_url, status, created_at)
     VALUES ('bw-social', 'w-site-social', 'b-shared', 'org-1', 'ws-shared', 'p-social', 'Social site', 'https://social.example', 'live', ?),
            ('bw-print', 'w-site-print', 'b-shared', 'org-1', 'ws-shared', 'p-print', 'Print site', 'https://print.example', 'live', ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO deliverables (id, organization_id, project_id, workspace_id, title, kind, status, version, published_version, published_at, actor_kind, created_at, updated_at)
     VALUES ('d-social', 'org-1', 'p-social', 'ws-shared', 'Social pack', 'social_pack', 'approved', 1, 1, ?, 'staff', ?, ?),
            ('d-print', 'org-1', 'p-print', 'ws-shared', 'Print pack', 'document', 'approved', 1, 1, ?, 'staff', ?, ?),
            ('d-print-loose', 'org-1', NULL, 'ws-print', 'Print pack without project', 'document', 'approved', 1, 1, ?, 'staff', ?, ?),
            ('d-unfiled', 'org-1', NULL, 'ws-shared', 'Unfiled pack', 'document', 'approved', 1, 1, ?, 'staff', ?, ?)`,
    [NOW, NOW, NOW, NOW, NOW, NOW, NOW, NOW, NOW, NOW, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO deliverable_items (id, deliverable_id, version, format, channel, title, copy_text, media_json, link_url, status, sort)
     VALUES ('i-social', 'd-social', 1, 'static', 'instagram', 'Social post', 'Caption', '[]', NULL, 'approved', 0),
            ('i-print', 'd-print', 1, 'static', NULL, 'Brochure', NULL, '[]', NULL, 'approved', 0),
            ('i-print-loose', 'd-print-loose', 1, 'static', NULL, 'Flyer', NULL, '[]', NULL, 'approved', 0),
            ('i-unfiled', 'd-unfiled', 1, 'static', NULL, 'Unfiled piece', NULL, '[]', NULL, 'approved', 0)`,
  );
  await sql.run(
    `INSERT INTO files (id, batch_id, workspace_id, relative_path, extension, size_bytes, object_key, tag, status, scan_attempts, created_at)
     VALUES ('f-shared', 'b-shared', 'ws-shared', 'shared.pdf', 'pdf', 1, 'k1', 'source', 'clean', 0, ?),
            ('f-print', 'b-print', 'ws-print', 'print.pdf', 'pdf', 1, 'k2', 'source', 'clean', 0, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO library_file_selections (id, organization_id, workspace_id, file_id, selected_by, selected_at)
     VALUES ('s1', 'org-1', 'ws-shared', 'f-shared', 'staff-1', ?), ('s2', 'org-1', 'ws-print', 'f-print', 'staff-1', ?)`,
    [NOW, NOW],
  );
  return sql;
}

async function titles(sql: Sql, workspaceId: string, extra: { removed?: boolean } = {}): Promise<string[]> {
  const page = await listLibraryArtifacts(sql, member, { workspaceId, ...extra });
  expect(page.ok).toBe(true);
  return page.ok ? page.page.artifacts.map((artifact) => artifact.title).sort() : [];
}

describe("projects.include_in_library", () => {
  it("defaults to on for every project, so existing projects keep today's behaviour", async () => {
    const sql = sqliteSql(new DatabaseSync(":memory:"));
    await migrate(sql);
    await sql.run(`INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('o', 'O', 'client', ?, ?)`, [NOW, NOW]);
    await sql.run(`INSERT INTO projects (id, organization_id, name, status, created_at, updated_at) VALUES ('p', 'o', 'P', 'active', ?, ?)`, [NOW, NOW]);
    const row = await sql.get<{ include_in_library: number }>("SELECT include_in_library FROM projects WHERE id = 'p'");
    expect(row?.include_in_library).toBe(1);
    await expect(sql.run("UPDATE projects SET include_in_library = 2 WHERE id = 'p'")).rejects.toThrow();
  });

  it("is added to a database that already has projects, and leaves their rows on", async () => {
    const db = new DatabaseSync(":memory:");
    const sql = sqliteSql(db);
    await migrate(sql);
    // A re-run is a no-op, and a project inserted the old way (no column named) is on.
    await sql.run(`INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('o', 'O', 'client', ?, ?)`, [NOW, NOW]);
    await sql.run(`INSERT INTO projects (id, organization_id, name, status, created_at, updated_at) VALUES ('old', 'o', 'Old', 'active', ?, ?)`, [NOW, NOW]);
    await migrate(sql);
    const columns = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
    expect(columns.filter((column) => column.name === "include_in_library")).toHaveLength(1);
    expect((await sql.get<{ include_in_library: number }>("SELECT include_in_library FROM projects WHERE id = 'old'"))?.include_in_library).toBe(1);
  });

  it("reads a project's flag, treating a missing or null project as included", async () => {
    const sql = await database();
    expect(await projectInLibrary(sql, "p-social")).toBe(true);
    expect(await projectInLibrary(sql, "p-print")).toBe(false);
    expect(await projectInLibrary(sql, null)).toBe(true);
    expect(await projectInLibrary(sql, "missing")).toBe(true);
    expect(libraryProjectOk("d.project_id")).toContain("include_in_library");
  });
});

describe("includeFromForm", () => {
  const form = (entries: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(entries)) data.set(key, value);
    return data;
  };

  it("treats an unchecked box as off only when the form carries the option", () => {
    expect(includeFromForm(form({ libraryOption: "1", includeInLibrary: "on" }))).toBe(true);
    expect(includeFromForm(form({ libraryOption: "1" }))).toBe(false);
    expect(includeFromForm(form({ name: "Old form without the option" }))).toBe(true);
  });
});

describe("Library hides projects that opt out", () => {
  it("lists pieces, built sites and files of included projects only, in a Space shared by two projects", async () => {
    const sql = await database();
    const shared = await titles(sql, "ws-shared");
    expect(shared).toContain("Social post");
    expect(shared).toContain("Social site");
    expect(shared).toContain("shared.pdf");
    expect(shared).toContain("Unfiled piece");
    expect(shared).not.toContain("Brochure");
    expect(shared).not.toContain("Print site");
  });

  it("hides everything in a Space that belongs to an opted-out project, including pieces with no project of their own", async () => {
    const sql = await database();
    expect(await titles(sql, "ws-print")).toEqual([]);
  });

  it("counts only what the Library lists", async () => {
    const sql = await database();
    const page = await listLibraryArtifacts(sql, member, { workspaceId: "ws-shared" });
    expect(page.ok && page.page.counts.total).toBe(4);
  });

  it("brings the work back when the project is switched on again, and keeps removed pieces separate", async () => {
    const sql = await database();
    await sql.run("UPDATE projects SET include_in_library = 1 WHERE id = 'p-print'");
    const shared = await titles(sql, "ws-shared");
    expect(shared).toContain("Brochure");
    expect(shared).toContain("Print site");
    expect(await titles(sql, "ws-print")).toEqual(["Flyer", "print.pdf"]);
  });

  it("also hides an opted-out project's pieces from the removed view", async () => {
    const sql = await database();
    await sql.run("UPDATE deliverable_items SET removed_at = ? WHERE id IN ('i-print', 'i-social')", [NOW]);
    expect(await titles(sql, "ws-shared", { removed: true })).toEqual(["Social post"]);
  });
});
