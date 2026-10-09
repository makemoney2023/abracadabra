import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { runAgentWork } from "@/db/agent-work";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { moveTaskStage } from "@/lib/task-stage";
import { runHqTool } from "@/lib/hq-tools";
import type { Caller } from "@/lib/authz";
import { handleGithubBatch } from "@/lib/github/queue";
import { productPageLink, renderProductEmail } from "@/lib/email-templates";
import {
  cursorPrompt,
  expireCloudRuns,
  ingestPullRequest,
  repoSlug,
  retryCappedBuilds,
  startBuild,
  startRevision,
  unblockAnsweredQuestion,
  type BuildDeps,
} from "@/lib/cursor-build";

const NOW = 1_700_000_000_000;
const SHA = "a".repeat(40);
const SHA2 = "b".repeat(40);
const MANIFEST = {
  title: "Audit",
  kind: "document",
  items: [{ title: "Page", format: "page", copy: "The findings." }],
};

let sql: Sql;

beforeEach(async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  sql = sqliteSql(db);
  await migrate(sql);
});

function briefCopy(deliverableId = "del-doc", round = 1): string {
  return [
    "# Build brief",
    "",
    `Deliverable: ${deliverableId}`,
    "Kind: document",
    "",
    "## Output",
    `Branch handoff/${deliverableId}/r${round}.`,
    "Write deliverables/document/manifest.json.",
    `PR title: Deliverable ${deliverableId} round ${round}`,
    `PR body first line: Deliverable: ${deliverableId}`,
  ].join("\n");
}

async function seed(options?: { repo?: boolean; install?: "org" | "user" | "none" | "many" | "suspended" }): Promise<void> {
  const install = options?.install ?? "org";
  const withRepo = options?.repo ?? true;
  await sql.run(
    `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-1', 'Northwind', 'client', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at) VALUES ('staff-1', 'staff@example.com', 0, ?, NULL)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO projects (
      id, organization_id, deal_id, name, status, owner_user_id, starts_at, due_at, created_at, updated_at
    ) VALUES ('project-1', 'org-1', NULL, 'Launch', 'active', 'staff-1', NULL, NULL, ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO workspaces (
      id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
      quota_bytes, retention_days, request_digest, status, opened_at, organization_id, project_id
    ) VALUES (
      'ws-1', 'northwind', 'Northwind', 'Northwind', NULL, 'Northwind', 'standard',
      1000, 30, 0, 'active', ?, 'org-1', 'project-1'
    )`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
     VALUES ('mem-owner', 'ws-1', 'user-owner', 'owner@example.com', 'client_owner', ?, NULL)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
     VALUES ('mem-member', 'ws-1', 'user-member', 'member@example.com', 'client_member', ?, NULL)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
     VALUES ('mem-gone', 'ws-1', 'user-gone', 'gone@example.com', 'client_member', ?, ?)`,
    [NOW, NOW],
  );
  await deliverable("del-brief", "brief", "approved");
  await deliverable("del-design", "design_system", "approved");
  await deliverable("del-doc", "document", "draft");
  await sql.run(
    `INSERT INTO deliverable_items (
      id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
    ) VALUES ('item-brief', 'del-doc', 1, NULL, 'page', NULL, 'build-brief.md', ?, '[]', NULL, 'pending', 0)`,
    [briefCopy()],
  );
  await sql.run(
    `INSERT INTO tasks (
      id, project_id, organization_id, title, status, created_at, updated_at, stage, deliverable_id, round, created_by_kind
    ) VALUES ('task-1', 'project-1', 'org-1', 'Audit', 'todo', ?, ?, 'engineer', 'del-doc', 1, 'agent')`,
    [NOW, NOW],
  );
  if (install === "org" || install === "user" || install === "suspended") {
    await sql.run(
      `INSERT INTO github_installations (id, account_login, account_type, organization_id, suspended_at, created_at)
       VALUES (7, 'makemoney2023', ?, NULL, ?, ?)`,
      [install === "user" ? "User" : "Organization", install === "suspended" ? NOW : null, NOW],
    );
  }
  if (install === "many") {
    await sql.run(
      `INSERT INTO github_installations (id, account_login, account_type, suspended_at, created_at)
       VALUES (7, 'makemoney2023', 'Organization', NULL, ?)`,
      [NOW],
    );
    await sql.run(
      `INSERT INTO github_installations (id, account_login, account_type, suspended_at, created_at)
       VALUES (8, 'other', 'Organization', NULL, ?)`,
      [NOW],
    );
  }
  if (withRepo) {
    await sql.run(
      `INSERT INTO repos (
        id, github_repo_id, installation_id, full_name, organization_id, project_id,
        default_branch, is_private, owned_by, linked_by, created_at, archived_at
      ) VALUES (
        'repo-1', 42, 7, 'makemoney2023/northwind', 'org-1', 'project-1',
        'main', 1, 'agency', NULL, ?, NULL
      )`,
      [NOW],
    );
  }
}

async function deliverable(id: string, kind: string, status: string): Promise<void> {
  await sql.run(
    `INSERT INTO deliverables (
      id, organization_id, project_id, workspace_id, title, kind, status, version,
      source_repo_id, source_ref, published_at, actor_kind, actor_id, created_at, updated_at, published_version
    ) VALUES (?, 'org-1', 'project-1', 'ws-1', ?, ?, ?, 1, NULL, NULL, NULL, 'agent', 'key-1', ?, ?, NULL)`,
    [id, id, kind, status, NOW, NOW],
  );
}

type Hit = { url: string; method: string; authorization: string; body: string };

function http(handler: (hit: Hit) => Response): { fetch: typeof fetch; hits: Hit[] } {
  const hits: Hit[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    const hit: Hit = {
      url: String(input),
      method: init?.method ?? "GET",
      authorization: headers.get("authorization") ?? "",
      body: typeof init?.body === "string" ? init.body : "",
    };
    hits.push(hit);
    return handler(hit);
  };
  return { fetch: fetchImpl, hits };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function deps(fetchImpl: typeof fetch, extra: Partial<BuildDeps> = {}): BuildDeps {
  let n = 0;
  return {
    fetch: fetchImpl,
    cursorKey: "cursor-test-key",
    githubToken: async () => "ghs_test",
    put: async () => "object-key",
    now: NOW,
    origin: "https://handoff.abra-ca-dabra.app",
    newId: () => `11111111-1111-4111-8111-${String(++n).padStart(12, "0")}`,
    ...extra,
  };
}

function cursorOk(): Response {
  return json(200, { agent: { id: "bc-1", latestRunId: "run-1" }, run: { id: "run-1", status: "CREATING" } });
}

function manifestFile(): Response {
  return json(200, { content: Buffer.from(JSON.stringify(MANIFEST)).toString("base64"), encoding: "base64" });
}

describe("cursor prompt and repo slug", () => {
  it("rejects a poisoned or empty brief and a longer extra", () => {
    expect(cursorPrompt("Write the page.")).toBe("Write the page.");
    expect(cursorPrompt("")).toBeNull();
    expect(cursorPrompt("   ")).toBeNull();
    expect(cursorPrompt("notes answers_json here")).toBeNull();
    expect(cursorPrompt("Hello\nFrom: someone")).toBeNull();
    expect(cursorPrompt("short", ["this extra is longer than the brief"])).toBeNull();
    expect(cursorPrompt("long enough brief", ["ok"])).toBe("long enough brief");
  });

  it("slugifies an organization name and falls back to the id", () => {
    expect(repoSlug("Northwind", "org-1")).toBe("northwind");
    expect(repoSlug("Acme, Inc.", "org-1")).toBe("acme-inc");
    expect(repoSlug("---", "Org 1")).toBe("org-1");
  });
});

describe("build gate", () => {
  it("blocks when the brief or the design system is not approved", async () => {
    await seed();
    await sql.run("UPDATE deliverables SET status = 'draft' WHERE id = 'del-brief'");
    const quiet = http(() => {
      throw new Error("no call");
    });
    const brief = await startBuild(sql, "task-1", deps(quiet.fetch));
    expect(brief).toEqual({ ok: false, reason: "brief_not_approved" });
    const blocked = await sql.get<{ status: string; stage: string; blocked_reason: string }>(
      "SELECT status, stage, blocked_reason FROM tasks WHERE id = 'task-1'",
    );
    expect(blocked).toEqual({ status: "blocked", stage: "build", blocked_reason: "brief_not_approved" });

    await sql.run("UPDATE deliverables SET status = 'approved' WHERE id = 'del-brief'");
    await sql.run("UPDATE deliverables SET status = 'draft' WHERE id = 'del-design'");
    await sql.run("UPDATE tasks SET status = 'todo', blocked_reason = NULL, stage = 'engineer' WHERE id = 'task-1'");
    const design = await startBuild(sql, "task-1", deps(quiet.fetch));
    expect(design).toEqual({ ok: false, reason: "design_system_not_approved" });
  });

  it("blocks when the build brief is missing and does not call Cursor for a poisoned brief", async () => {
    await seed();
    await sql.run("DELETE FROM deliverable_items WHERE title = 'build-brief.md'");
    const quiet = http(() => {
      throw new Error("no call");
    });
    expect(await startBuild(sql, "task-1", deps(quiet.fetch))).toEqual({ ok: false, reason: "missing_build_brief" });

    await sql.run(
      `INSERT INTO deliverable_items (
        id, deliverable_id, version, format, title, copy_text, media_json, status, sort
      ) VALUES ('item-bad', 'del-doc', 1, 'page', 'build-brief.md', 'From: poison', '[]', 'pending', 0)`,
    );
    await sql.run("UPDATE tasks SET status = 'todo', blocked_reason = NULL, stage = 'engineer' WHERE id = 'task-1'");
    const poisoned = await startBuild(sql, "task-1", deps(quiet.fetch));
    expect(poisoned).toEqual({ ok: false, reason: "prompt_rejected" });
    expect(quiet.hits).toEqual([]);
    expect(await sql.get("SELECT id FROM repos WHERE id != 'repo-1'")).toBeUndefined();
  });

  it("asks for a linked repo when several exist and none is on the project", async () => {
    await seed({ repo: false });
    await sql.run(
      `INSERT INTO repos (
        id, github_repo_id, installation_id, full_name, organization_id, project_id,
        default_branch, is_private, owned_by, created_at
      ) VALUES ('repo-a', 1, 7, 'makemoney2023/a', 'org-1', NULL, 'main', 1, 'agency', ?)`,
      [NOW],
    );
    await sql.run(
      `INSERT INTO repos (
        id, github_repo_id, installation_id, full_name, organization_id, project_id,
        default_branch, is_private, owned_by, created_at
      ) VALUES ('repo-b', 2, 7, 'makemoney2023/b', 'org-1', NULL, 'main', 1, 'agency', ?)`,
      [NOW],
    );
    const quiet = http(() => {
      throw new Error("no call");
    });
    expect(await startBuild(sql, "task-1", deps(quiet.fetch))).toEqual({ ok: false, reason: "link_a_repo" });
  });

  it("creates a private repo from the one live installation and does not create a second one", async () => {
    await seed({ repo: false, install: "org" });
    const first = http((hit) => {
      if (hit.url === "https://api.github.com/orgs/makemoney2023/repos" && hit.method === "POST") {
        expect(JSON.parse(hit.body)).toEqual({ name: "northwind", private: true, auto_init: true });
        return json(201, { id: 501, full_name: "makemoney2023/northwind", default_branch: "main" });
      }
      if (hit.url === "https://api.cursor.com/v1/agents") return json(500, { error: "down" });
      throw new Error(hit.url);
    });
    const created = await startBuild(sql, "task-1", deps(first.fetch));
    expect(created).toEqual({ ok: false, reason: "cursor_start_failed" });
    const repo = await sql.get<{ full_name: string; project_id: string; owned_by: string; is_private: number }>(
      "SELECT full_name, project_id, owned_by, is_private FROM repos",
    );
    expect(repo).toEqual({ full_name: "makemoney2023/northwind", project_id: "project-1", owned_by: "agency", is_private: 1 });
    expect(await sql.get("SELECT kind FROM activities WHERE kind = 'agent.repo_created'")).toEqual({ kind: "agent.repo_created" });

    await sql.run("UPDATE tasks SET status = 'todo', blocked_reason = NULL WHERE id = 'task-1'");
    const second = http((hit) => {
      if (hit.url.includes("api.github.com") && hit.url.includes("/repos") && hit.method === "POST") {
        throw new Error("second repo");
      }
      if (hit.url === "https://api.cursor.com/v1/agents") return cursorOk();
      throw new Error(hit.url);
    });
    const retried = await startBuild(sql, "task-1", deps(second.fetch));
    expect(retried.ok).toBe(true);
    if (retried.ok) expect(retried.action).toBe("started");
    expect(second.hits.some((hit) => hit.method === "POST" && hit.url.includes("api.github.com"))).toBe(false);
  });

  it("creates under the user account when the installation is a user", async () => {
    await seed({ repo: false, install: "user" });
    const routed = http((hit) => {
      if (hit.url === "https://api.github.com/user/repos") {
        return json(201, { id: 502, full_name: "makemoney2023/northwind", default_branch: "main" });
      }
      if (hit.url === "https://api.cursor.com/v1/agents") return cursorOk();
      throw new Error(hit.url);
    });
    expect((await startBuild(sql, "task-1", deps(routed.fetch))).ok).toBe(true);
    expect(routed.hits.some((hit) => hit.url === "https://api.github.com/orgs/makemoney2023/repos")).toBe(false);
  });

  it("refuses repo creation when the name is taken, the token is missing, or the install is not exactly one", async () => {
    await seed({ repo: false });
    const taken = http((hit) => {
      if (hit.method === "POST" && hit.url.endsWith("/repos")) return json(422, { message: "name already exists" });
      throw new Error(hit.url);
    });
    expect(await startBuild(sql, "task-1", deps(taken.fetch))).toEqual({ ok: false, reason: "repo_name_taken" });
    expect(await sql.get("SELECT id FROM agent_questions")).toBeUndefined();

    await sql.run("UPDATE tasks SET status = 'todo', blocked_reason = NULL, stage = 'engineer' WHERE id = 'task-1'");
    let tokenCalls = 0;
    const sameOrg = http((hit) => {
      if (hit.method === "POST" && hit.url.endsWith("/repos")) {
        return json(422, { message: "exists" });
      }
      if (hit.url === "https://api.cursor.com/v1/agents") return cursorOk();
      throw new Error(hit.url);
    });
    await sql.run(
      `INSERT INTO repos (
        id, github_repo_id, installation_id, full_name, organization_id, project_id,
        default_branch, is_private, owned_by, created_at, archived_at
      ) VALUES ('repo-old', 77, 7, 'makemoney2023/northwind', 'org-1', NULL, 'main', 1, 'agency', ?, ?)`,
      [NOW, NOW],
    );
    const reused = await startBuild(
      sql,
      "task-1",
      deps(sameOrg.fetch, {
        githubToken: async () => {
          tokenCalls += 1;
          return "ghs_test";
        },
      }),
    );
    expect(reused.ok).toBe(true);

    await sql.run("DELETE FROM cloud_runs");
    await sql.run("UPDATE tasks SET status = 'todo', blocked_reason = NULL, stage = 'engineer', cursor_agent_id = NULL WHERE id = 'task-1'");
    await sql.run("DELETE FROM repos");
    await sql.run(
      `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-2', 'Other', 'client', ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO repos (
        id, github_repo_id, installation_id, full_name, organization_id, default_branch, is_private, owned_by, created_at
      ) VALUES ('repo-other', 88, 7, 'makemoney2023/northwind', 'org-2', 'main', 1, 'agency', ?)`,
      [NOW],
    );
    expect(await startBuild(sql, "task-1", deps(taken.fetch))).toEqual({ ok: false, reason: "repo_name_taken" });

    await sql.run("UPDATE tasks SET status = 'todo', blocked_reason = NULL, stage = 'engineer' WHERE id = 'task-1'");
    await sql.run("DELETE FROM repos");
    const noToken = http(() => {
      throw new Error("posted");
    });
    expect(await startBuild(sql, "task-1", deps(noToken.fetch, { githubToken: async () => null }))).toEqual({
      ok: false,
      reason: "repo_create_failed",
    });
    expect(await sql.get<{ question: string }>("SELECT question FROM agent_questions")).toBeTruthy();

    await sql.run("DELETE FROM agent_questions");
    await sql.run("UPDATE tasks SET status = 'todo', blocked_reason = NULL, stage = 'engineer' WHERE id = 'task-1'");
    await sql.run("UPDATE github_installations SET suspended_at = ? WHERE id = 7", [NOW]);
    let tokens = 0;
    expect(
      await startBuild(
        sql,
        "task-1",
        deps(noToken.fetch, {
          githubToken: async () => {
            tokens += 1;
            return "ghs_test";
          },
        }),
      ),
    ).toEqual({ ok: false, reason: "repo_create_failed" });
    expect(tokens).toBe(0);
    expect(tokenCalls).toBeGreaterThan(0);
  });

  it("does not create a repo when more than one installation is live", async () => {
    await seed({ repo: false, install: "many" });
    let tokens = 0;
    const quiet = http(() => {
      throw new Error("posted");
    });
    const result = await startBuild(
      sql,
      "task-1",
      deps(quiet.fetch, {
        githubToken: async () => {
          tokens += 1;
          return "ghs_test";
        },
      }),
    );
    expect(result).toEqual({ ok: false, reason: "repo_create_failed" });
    expect(tokens).toBe(0);
    expect(quiet.hits).toEqual([]);
  });

  it("launches a cloud agent with the v1 body and resumes an open run", async () => {
    await seed();
    const routed = http((hit) => {
      if (hit.url === "https://api.cursor.com/v1/agents" && hit.method === "POST") return cursorOk();
      throw new Error(hit.url);
    });
    const result = await startBuild(sql, "task-1", deps(routed.fetch));
    expect(result).toEqual({
      ok: true,
      action: "started",
      runId: "bc-11111111-1111-4111-8111-000000000001",
      repo: "makemoney2023/northwind",
      branch: "handoff/del-doc/r1",
    });
    const body = JSON.parse(routed.hits[0]?.body ?? "{}") as Record<string, unknown>;
    expect(body.branchName).toBeUndefined();
    expect(body.target).toBeUndefined();
    expect(body.autoCreatePR).toBe(true);
    expect(body.skipReviewerRequest).toBe(true);
    expect(body.agentId).toBe("bc-11111111-1111-4111-8111-000000000001");
    expect(body.prompt).toEqual({ text: briefCopy() });
    expect(body.repos).toEqual([{ url: "https://github.com/makemoney2023/northwind", startingRef: "main" }]);
    expect(body.name).toBe("Deliverable del-doc round 1");
    expect(routed.hits[0]?.authorization).toBe(`Basic ${Buffer.from("cursor-test-key:").toString("base64")}`);
    const task = await sql.get<{ status: string; cursor_agent_id: string; blocked_reason: string | null }>(
      "SELECT status, cursor_agent_id, blocked_reason FROM tasks WHERE id = 'task-1'",
    );
    expect(task).toEqual({
      status: "doing",
      cursor_agent_id: "bc-11111111-1111-4111-8111-000000000001",
      blocked_reason: null,
    });
    const run = await sql.get<{ branch: string; deadline_at: number }>("SELECT branch, deadline_at FROM cloud_runs");
    expect(run).toEqual({ branch: "handoff/del-doc/r1", deadline_at: NOW + 2 * 60 * 60 * 1000 });

    const again = http(() => {
      throw new Error("second launch");
    });
    expect(await startBuild(sql, "task-1", deps(again.fetch))).toEqual({
      ok: true,
      action: "resumed",
      runId: "bc-11111111-1111-4111-8111-000000000001",
    });
  });

  it("treats an agent id conflict as the same run and blocks when Cursor refuses", async () => {
    await seed();
    const conflict = http(() => json(409, { error: "agent_id_conflict" }));
    const same = await startBuild(sql, "task-1", deps(conflict.fetch));
    expect(same.ok).toBe(true);
    expect(await sql.get<{ status: string }>("SELECT status FROM cloud_runs")).toEqual({ status: "started" });

    await sql.run("DELETE FROM cloud_runs");
    await sql.run("UPDATE tasks SET status = 'todo', cursor_agent_id = NULL WHERE id = 'task-1'");
    const refused = http(() => json(500, { error: "nope" }));
    expect(await startBuild(sql, "task-1", deps(refused.fetch, { cursorKey: null }))).toEqual({
      ok: false,
      reason: "cursor_start_failed",
    });
    expect(refused.hits).toEqual([]);
    expect(await sql.get<{ status: string; error: string }>("SELECT status, error FROM cloud_runs")).toMatchObject({
      status: "failed",
    });
    const task = await sql.get<{ status: string; blocked_reason: string }>(
      "SELECT status, blocked_reason FROM tasks WHERE id = 'task-1'",
    );
    expect(task).toEqual({ status: "blocked", blocked_reason: "cursor_start_failed" });
    expect(await sql.get("SELECT id FROM agent_questions")).toBeTruthy();
    expect(await sql.get("SELECT kind FROM activities WHERE kind = 'agent.build_failed'")).toBeTruthy();
  });

  it("leaves a capped build as todo and launches it when a slot opens", async () => {
    await seed();
    await sql.run("UPDATE agent_settings SET value = '0' WHERE key = 'max_cloud_runs'");
    const quiet = http(() => {
      throw new Error("capped");
    });
    expect(await startBuild(sql, "task-1", deps(quiet.fetch))).toEqual({ ok: true, action: "waiting", reason: "cap_reached" });
    expect(await sql.get<{ status: string; blocked_reason: string | null; stage: string }>(
      "SELECT status, blocked_reason, stage FROM tasks WHERE id = 'task-1'",
    )).toEqual({ status: "todo", blocked_reason: null, stage: "build" });

    await sql.run("UPDATE agent_settings SET value = '1' WHERE key = 'max_cloud_runs'");
    await sql.run(
      `INSERT INTO cloud_runs (
        id, task_id, deliverable_id, repo_id, round, status, started_at, deadline_at
      ) VALUES ('run-other', 'task-1', 'del-doc', 'repo-1', 9, 'started', ?, ?)`,
      [NOW, NOW + 1000],
    );
    expect(await startBuild(sql, "task-1", deps(quiet.fetch))).toEqual({
      ok: true,
      action: "waiting",
      reason: "cap_reached",
    });
    const waiting = await startBuild(sql, "task-1", deps(quiet.fetch));
    expect(waiting).toEqual({ ok: true, action: "waiting", reason: "cap_reached" });

    await sql.run("DELETE FROM cloud_runs");
    await sql.run("UPDATE tasks SET status = 'todo', stage = 'build', blocked_reason = NULL, cursor_agent_id = NULL WHERE id = 'task-1'");
    await sql.run(
      `INSERT INTO tasks (
        id, project_id, organization_id, title, status, created_at, updated_at, stage, round, created_by_kind
      ) VALUES ('task-hold', 'project-1', 'org-1', 'Hold', 'doing', ?, ?, 'build', 1, 'agent')`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO cloud_runs (
        id, task_id, deliverable_id, repo_id, round, status, started_at, deadline_at
      ) VALUES ('run-hold', 'task-hold', 'del-doc', 'repo-1', 1, 'started', ?, ?)`,
      [NOW, NOW + 1000],
    );
    expect(await startBuild(sql, "task-1", deps(quiet.fetch))).toEqual({ ok: true, action: "waiting", reason: "cap_reached" });
    await sql.run("UPDATE cloud_runs SET status = 'pulled' WHERE id = 'run-hold'");
    const opened = http((hit) => (hit.url === "https://api.cursor.com/v1/agents" ? cursorOk() : json(404, {})));
    await retryCappedBuilds(sql, deps(opened.fetch));
    expect(await sql.get<{ status: string }>("SELECT status FROM tasks WHERE id = 'task-1'")).toEqual({ status: "doing" });
  });

  it("blocks a paused organization after the repo exists", async () => {
    await seed();
    await sql.run("UPDATE organizations SET agent_paused_at = ? WHERE id = 'org-1'", [NOW]);
    const quiet = http(() => {
      throw new Error("paused");
    });
    expect(await startBuild(sql, "task-1", deps(quiet.fetch))).toEqual({ ok: false, reason: "agent_paused" });
    expect(quiet.hits).toEqual([]);
  });

  it("starts from the agent task update and the staff stage tool", async () => {
    await seed();
    const routed = http((hit) => (hit.url === "https://api.cursor.com/v1/agents" ? cursorOk() : json(404, {})));
    const updated = (await runAgentWork(
      sql,
      { keyId: "key-1", organizationId: "org-1" },
      "update_task",
      {
        requestId: "to-build",
        taskId: "task-1",
        stage: "build",
        note: "Wrote the build brief.",
        skills: [{ path: "copywriting", mode: "plan", status: "done" }],
      },
      NOW,
      deps(routed.fetch),
    )) as { taskId: string; stage: string; blockedReason: string | null };
    expect(updated.stage).toBe("build");
    expect(updated.blockedReason).toBeNull();
    const noted = await sql.get<{ body: string; skills_json: string }>(
      `SELECT a.body, t.skills_json
       FROM tasks t JOIN activities a ON a.organization_id = t.organization_id
       WHERE t.id = 'task-1' AND a.kind = 'agent.skill_done'`,
    );
    expect(noted?.body).toBe("Wrote the build brief.");
    expect(noted?.skills_json).toContain("copywriting");
    expect(routed.hits).toHaveLength(1);

    await sql.run("DELETE FROM cloud_runs");
    await sql.run("DELETE FROM idempotency_keys");
    await sql.run("UPDATE tasks SET stage = 'engineer', status = 'todo', cursor_agent_id = NULL WHERE id = 'task-1'");
    await sql.run("UPDATE deliverables SET status = 'draft' WHERE id = 'del-brief'");
    const staff: Caller = { userId: "staff-1", staff: { superAdmin: false }, operatorOf: [], memberships: [] };
    const tool = await runHqTool(
      sql,
      staff,
      { tool: "set_task_stage", input: { taskId: "task-1", stage: "build" }, idempotencyKey: "stage-build", approved: true },
      NOW,
      { build: deps(routed.fetch) },
    );
    expect(tool).toEqual({ ok: false, error: "brief_not_approved" });
    expect(await sql.get<{ stage: string; blocked_reason: string }>("SELECT stage, blocked_reason FROM tasks WHERE id = 'task-1'")).toEqual({
      stage: "engineer",
      blocked_reason: "brief_not_approved",
    });
  });

  it("leaves the plan skill to do when the build move is refused", async () => {
    await seed();
    const skills = JSON.stringify({
      steps: [{ path: "copywriting", mode: "plan", status: "todo" }],
      current: 0,
    });
    await sql.run("UPDATE tasks SET skills_json = ? WHERE id = 'task-1'", [skills]);
    await sql.run("UPDATE deliverables SET status = 'draft' WHERE id = 'del-brief'");
    const quiet = http(() => {
      throw new Error("refused");
    });
    const updated = (await runAgentWork(
      sql,
      { keyId: "key-1", organizationId: "org-1" },
      "update_task",
      {
        requestId: "refused-build",
        taskId: "task-1",
        stage: "build",
        note: "Wrote the build brief.",
        skills: [{ path: "copywriting", mode: "plan", status: "done" }],
      },
      NOW,
      deps(quiet.fetch),
    )) as { stage: string; blockedReason: string | null };
    expect(updated.stage).toBe("engineer");
    expect(updated.blockedReason).toBe("brief_not_approved");
    const row = await sql.get<{ skills_json: string; stage: string }>(
      "SELECT skills_json, stage FROM tasks WHERE id = 'task-1'",
    );
    expect(row?.stage).toBe("engineer");
    expect(row?.skills_json).toBe(skills);
    expect(quiet.hits).toEqual([]);
  });

  it("moves a finished card into Build when a run is already open", async () => {
    await seed();
    await sql.run("UPDATE tasks SET status = 'done', stage = 'run', done_at = ? WHERE id = 'task-1'", [NOW]);
    await sql.run(
      `INSERT INTO cloud_runs (
        id, task_id, deliverable_id, repo_id, round, status, started_at, deadline_at
      ) VALUES ('run-open', 'task-1', 'del-doc', 'repo-1', 1, 'started', ?, ?)`,
      [NOW, NOW + 1000],
    );
    const quiet = http(() => {
      throw new Error("already open");
    });
    const moved = await moveTaskStage(sql, {
      taskId: "task-1",
      to: "build",
      now: NOW + 5,
      actor: { kind: "staff", id: "staff-1" },
      build: deps(quiet.fetch),
    });
    expect(moved).toMatchObject({ ok: true, column: "build", status: "doing" });
    expect(await sql.get("SELECT stage, status, done_at FROM tasks WHERE id = 'task-1'")).toEqual({
      stage: "build",
      status: "doing",
      done_at: null,
    });
    expect(quiet.hits).toEqual([]);
  });

  it("clears done when a finished card waits for a cloud run", async () => {
    await seed();
    await sql.run("UPDATE tasks SET status = 'done', stage = 'run', done_at = ? WHERE id = 'task-1'", [NOW]);
    await sql.run("UPDATE agent_settings SET value = '0' WHERE key = 'max_cloud_runs'");
    const quiet = http(() => {
      throw new Error("capped");
    });
    const moved = await moveTaskStage(sql, {
      taskId: "task-1",
      to: "build",
      now: NOW + 5,
      actor: { kind: "staff", id: "staff-1" },
      build: deps(quiet.fetch),
    });
    expect(moved).toMatchObject({ ok: true, column: "build", status: "todo", waiting: "cap_reached" });
    expect(await sql.get("SELECT stage, status, done_at FROM tasks WHERE id = 'task-1'")).toEqual({
      stage: "build",
      status: "todo",
      done_at: null,
    });
  });

  it("sends the latest build brief when more than one is filed", async () => {
    await seed();
    await sql.run(
      `INSERT INTO deliverable_items (
        id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
      ) VALUES ('item-brief-2', 'del-doc', 1, NULL, 'page', NULL, 'build-brief.md', ?, '[]', NULL, 'pending', 1)`,
      [`${briefCopy()}\nMarker: later-brief`],
    );
    const routed = http((hit) => (hit.url === "https://api.cursor.com/v1/agents" ? cursorOk() : json(404, {})));
    expect(await startBuild(sql, "task-1", deps(routed.fetch))).toMatchObject({ ok: true, action: "started" });
    expect(routed.hits[0]?.body).toContain("later-brief");
  });
});

describe("pull request ingest", () => {
  async function openRun(): Promise<void> {
    await seed();
    await sql.run("UPDATE tasks SET status = 'doing', stage = 'build' WHERE id = 'task-1'");
    await sql.run(
      `INSERT INTO cloud_runs (
        id, task_id, deliverable_id, repo_id, round, status, branch, started_at, deadline_at
      ) VALUES ('bc-run', 'task-1', 'del-doc', 'repo-1', 1, 'started', 'handoff/del-doc/r1', ?, ?)`,
      [NOW, NOW + 1000],
    );
  }

  function pr(action: string, extra?: { sha?: string; ref?: string; merged?: boolean; body?: string }) {
    return {
      action,
      repository: { id: 42, full_name: "makemoney2023/northwind" },
      pull_request: {
        number: 7,
        title: "Deliverable del-doc round 1",
        body: extra?.body ?? "Deliverable: del-doc\n\nReady.",
        merged: extra?.merged ?? false,
        html_url: "https://github.com/makemoney2023/northwind/pull/7",
        user: { login: "cursor" },
        head: { sha: extra?.sha ?? SHA, ref: extra?.ref ?? "cursor/generated" },
      },
    };
  }

  function github(files: Response): { fetch: typeof fetch; hits: Hit[] } {
    return http((hit) => {
      if (hit.url.includes("/commits/")) return json(200, { sha: hit.url.endsWith(SHA2) ? SHA2 : SHA });
      if (hit.url.includes("/contents/")) {
        expect(hit.url).toContain("deliverables/document/manifest.json");
        return files;
      }
      throw new Error(hit.url);
    });
  }

  it("pulls, publishes, and mails every current member once", async () => {
    await openRun();
    const routed = github(manifestFile());
    await ingestPullRequest(sql, pr("opened"), deps(routed.fetch));
    expect(await sql.get<{ status: string; head_sha: string }>("SELECT status, head_sha FROM cloud_runs")).toEqual({
      status: "pulled",
      head_sha: SHA,
    });
    const task = await sql.get<{ status: string; stage: string }>("SELECT status, stage FROM tasks WHERE id = 'task-1'");
    expect(task).toEqual({ status: "done", stage: "run" });
    expect(await sql.get<{ status: string; published_version: number }>(
      "SELECT status, published_version FROM deliverables WHERE id = 'del-doc'",
    )).toEqual({ status: "in_review", published_version: 1 });
    const notices = await sql.all("SELECT deliverable_id, version FROM deliverable_notices");
    expect(notices).toEqual([{ deliverable_id: "del-doc", version: 1 }]);
    const mail = await sql.all<{ recipient_email: string; event: string; idempotency_key: string; payload: string }>(
      "SELECT recipient_email, event, idempotency_key, payload FROM notifications ORDER BY recipient_email",
    );
    expect(mail.map((row) => row.recipient_email)).toEqual(["member@example.com", "owner@example.com"]);
    expect(mail[0]?.event).toBe("deliverable.published");
    expect(mail[0]?.idempotency_key).toBe("deliverable:del-doc:v1:member@example.com");
    const payload = JSON.parse(mail[0]?.payload ?? "{}") as { title: string; slug: string; deliverableId: string; displayName: string };
    expect(payload.deliverableId).toBe("del-doc");
    const letter = renderProductEmail({
      from: "studio@example.com",
      to: "owner@example.com",
      event: "deliverable.published",
      origin: "https://handoff.abra-ca-dabra.app",
      payload,
    });
    expect(letter.subject).toBe("Northwind: del-doc is ready");
    expect(letter.text).toContain("del-doc is ready for you to look at.");
    expect(productPageLink("https://handoff.abra-ca-dabra.app", "deliverable.published", payload)).toBe(
      "https://handoff.abra-ca-dabra.app/w/northwind/work/del-doc",
    );
    expect(await sql.get("SELECT kind FROM activities WHERE kind = 'agent.published'")).toBeTruthy();

    const before = routed.hits.length;
    await ingestPullRequest(sql, pr("opened"), deps(routed.fetch));
    expect(routed.hits.length).toBe(before);
    expect(await sql.all("SELECT version FROM deliverable_notices")).toHaveLength(1);
  });

  it("leaves a draft and skips mail when auto publish is off", async () => {
    await openRun();
    await sql.run("UPDATE organizations SET auto_publish_built = 0 WHERE id = 'org-1'");
    const routed = github(manifestFile());
    await ingestPullRequest(sql, pr("opened"), deps(routed.fetch));
    expect(await sql.get<{ status: string }>("SELECT status FROM deliverables WHERE id = 'del-doc'")).toEqual({ status: "draft" });
    expect(await sql.get("SELECT id FROM notifications")).toBeUndefined();
    expect(await sql.get("SELECT kind FROM activities WHERE kind = 'agent.ready_to_publish'")).toBeTruthy();
  });

  it("blocks a rejected manifest and ignores a closed or foreign pull request", async () => {
    await openRun();
    const bad = github(json(200, { content: Buffer.from("{").toString("base64"), encoding: "base64" }));
    await ingestPullRequest(sql, pr("opened"), deps(bad.fetch));
    expect(await sql.get<{ status: string; error: string }>("SELECT status, error FROM cloud_runs")).toMatchObject({
      status: "failed",
    });
    expect(await sql.get<{ blocked_reason: string }>("SELECT blocked_reason FROM tasks WHERE id = 'task-1'")).toEqual({
      blocked_reason: "manifest_rejected",
    });
    expect(await sql.get("SELECT id FROM notifications")).toBeUndefined();

    await sql.run("UPDATE cloud_runs SET status = 'pr_open', error = NULL WHERE id = 'bc-run'");
    await sql.run("UPDATE tasks SET status = 'doing', blocked_reason = NULL, stage = 'build' WHERE id = 'task-1'");
    await ingestPullRequest(sql, pr("closed", { merged: false }), deps(http(() => json(500, {})).fetch));
    expect(await sql.get<{ blocked_reason: string }>("SELECT blocked_reason FROM tasks WHERE id = 'task-1'")).toEqual({
      blocked_reason: "pr_closed",
    });

    await sql.run("UPDATE cloud_runs SET status = 'pr_open', error = NULL WHERE id = 'bc-run'");
    await sql.run("UPDATE tasks SET status = 'doing', blocked_reason = NULL WHERE id = 'task-1'");
    const before = await sql.get("SELECT status, published_version FROM deliverables WHERE id = 'del-doc'");
    await ingestPullRequest(sql, pr("closed", { merged: true }), deps(http(() => json(500, {})).fetch));
    expect(await sql.get("SELECT status, published_version FROM deliverables WHERE id = 'del-doc'")).toEqual(before);

    await sql.run(
      `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-2', 'Other', 'client', ?, ?)`,
      [NOW, NOW],
    );
    await sql.run("UPDATE repos SET organization_id = 'org-2' WHERE id = 'repo-1'");
    await sql.run("UPDATE cloud_runs SET status = 'started' WHERE id = 'bc-run'");
    await sql.run("UPDATE tasks SET status = 'doing', blocked_reason = NULL WHERE id = 'task-1'");
    await ingestPullRequest(sql, pr("opened"), deps(http(() => json(200, {})).fetch));
    const mismatch = await sql.get<{ data_json: string }>(
      "SELECT data_json FROM activities WHERE kind = 'agent.build_failed' ORDER BY created_at DESC LIMIT 1",
    );
    expect(mismatch?.data_json).toContain("repo_org_mismatch");
  });

  it("pulls from the queue after the delivery is stored", async () => {
    await openRun();
    const routed = github(manifestFile());
    let acked = 0;
    await handleGithubBatch(
      [
        {
          body: {
            source: "github",
            deliveryId: "delivery-1",
            event: "pull_request",
            payload: pr("opened"),
          },
          ack: () => {
            acked += 1;
          },
          retry: () => {
            throw new Error("retry");
          },
        },
      ],
      sql,
      NOW,
      deps(routed.fetch),
    );
    expect(acked).toBe(1);
    expect(await sql.get<{ status: string }>("SELECT status FROM cloud_runs")).toEqual({ status: "pulled" });
  });
});

describe("expiry, answers, and revisions", () => {
  it("waits one cycle for a finished run with no pull request, then expires it", async () => {
    await seed();
    await sql.run("UPDATE tasks SET status = 'doing', stage = 'build', title = 'Audit' WHERE id = 'task-1'");
    await sql.run(
      `INSERT INTO cloud_runs (
        id, task_id, deliverable_id, repo_id, round, status, started_at, deadline_at
      ) VALUES ('bc-old', 'task-1', 'del-doc', 'repo-1', 1, 'started', ?, ?)`,
      [NOW - 10_000, NOW - 1],
    );
    const finished = http((hit) => {
      if (hit.url === "https://api.cursor.com/v1/agents/bc-old") {
        return json(200, { id: "bc-old", latestRunId: "run-9", status: "IDLE" });
      }
      if (hit.url.endsWith("/runs/run-9")) return json(200, { id: "run-9", status: "FINISHED", git: { branches: [] } });
      throw new Error(hit.url);
    });
    await expireCloudRuns(sql, deps(finished.fetch));
    expect(await sql.get<{ status: string; error: string }>("SELECT status, error FROM cloud_runs")).toEqual({
      status: "started",
      error: "awaiting_pr",
    });
    await expireCloudRuns(sql, deps(finished.fetch));
    expect(await sql.get<{ status: string }>("SELECT status FROM cloud_runs")).toEqual({ status: "expired" });
    expect(await sql.get<{ blocked_reason: string }>("SELECT blocked_reason FROM tasks WHERE id = 'task-1'")).toEqual({
      blocked_reason: "expired",
    });
    expect(await sql.get<{ question: string }>("SELECT question FROM agent_questions")).toEqual({
      question: "Run for Audit did not produce a PR. Retry, or take over?",
    });
  });

  it("fails a run Cursor marks as an error", async () => {
    await seed();
    await sql.run("UPDATE tasks SET status = 'doing', stage = 'build' WHERE id = 'task-1'");
    await sql.run(
      `INSERT INTO cloud_runs (
        id, task_id, deliverable_id, repo_id, round, status, started_at, deadline_at
      ) VALUES ('bc-bad', 'task-1', 'del-doc', 'repo-1', 1, 'started', ?, ?)`,
      [NOW - 10_000, NOW - 1],
    );
    const errored = http((hit) => {
      if (hit.url.endsWith("/agents/bc-bad")) return json(200, { latestRunId: "run-err" });
      if (hit.url.endsWith("/runs/run-err")) return json(200, { status: "ERROR" });
      throw new Error(hit.url);
    });
    await expireCloudRuns(sql, deps(errored.fetch));
    expect(await sql.get<{ status: string; blocked_reason: string }>(
      `SELECT cloud_runs.status, tasks.blocked_reason
       FROM cloud_runs JOIN tasks ON tasks.id = cloud_runs.task_id`,
    )).toEqual({ status: "failed", blocked_reason: "failed" });
  });

  it("clears any block when a question is answered and wakes work", async () => {
    await seed();
    await sql.run("UPDATE tasks SET status = 'blocked', blocked_reason = 'manifest_rejected', stage = 'build' WHERE id = 'task-1'");
    await sql.run(
      `INSERT INTO agent_questions (id, organization_id, task_id, question, asked_at)
       VALUES ('q-1', 'org-1', 'task-1', 'What now?', ?)`,
      [NOW],
    );
    const reasons: string[] = [];
    await unblockAnsweredQuestion(sql, "q-1", NOW + 5, async (_org, reason) => {
      reasons.push(reason);
    });
    expect(await sql.get<{ status: string; blocked_reason: string | null }>(
      "SELECT status, blocked_reason FROM tasks WHERE id = 'task-1'",
    )).toEqual({ status: "todo", blocked_reason: null });
    expect(reasons).toEqual(["work"]);
    expect(await sql.get("SELECT kind FROM activities WHERE kind = 'agent.answered'")).toBeTruthy();
  });

  it("opens the next round from copywriting and ignores a brief or an approval", async () => {
    await seed();
    await sql.run("UPDATE deliverables SET status = 'changes_requested' WHERE id = 'del-doc'");
    const skills = {
      steps: [
        { path: "research/market", mode: "complete", status: "done" },
        { path: "skills/copywriting/headline", mode: "complete", status: "done" },
        { path: "skills/design/layout", mode: "complete", status: "done" },
      ],
      current: 3,
    };
    await sql.run("UPDATE tasks SET skills_json = ?, stage = 'run', status = 'done' WHERE id = 'task-1'", [JSON.stringify(skills)]);
    const reasons: string[] = [];
    const opened = await startRevision(sql, "del-doc", NOW + 9, async (_org, reason) => {
      reasons.push(reason);
    });
    expect(opened?.taskId).toBeTruthy();
    const next = await sql.get<{ round: number; stage: string; status: string; skills_json: string }>(
      "SELECT round, stage, status, skills_json FROM tasks WHERE round = 2",
    );
    expect(next?.round).toBe(2);
    expect(next?.stage).toBe("engineer");
    expect(next?.status).toBe("todo");
    const parsed = JSON.parse(next?.skills_json ?? "{}") as { steps: { path: string; status: string }[]; current: number };
    expect(parsed.steps.map((step) => step.status)).toEqual(["done", "todo", "todo"]);
    expect(parsed.current).toBe(1);
    expect(reasons).toEqual(["changes_requested"]);
    expect(await startRevision(sql, "del-doc", NOW + 10, async () => {})).toBeNull();

    expect(await startRevision(sql, "del-brief", NOW, async () => {})).toBeNull();
    await sql.run("UPDATE deliverables SET status = 'approved' WHERE id = 'del-doc'");
    expect(await startRevision(sql, "del-doc", NOW, async () => {})).toBeNull();
  });
});
