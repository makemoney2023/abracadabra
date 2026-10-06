import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { applyGithubDelivery } from "./consume";

const NOW = 1_700_000_000_000;

async function database(): Promise<Sql> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  await sql.run(
    `INSERT INTO organizations (id, name, kind, created_at, updated_at)
     VALUES ('org-1', 'Renew Implants', 'client', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO projects (
       id, organization_id, name, status, created_at, updated_at
     ) VALUES ('proj-1', 'org-1', 'Social preview', 'active', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO github_installations (id, account_login, account_type, created_at)
     VALUES (7, 'abracadabra', 'Organization', ?)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO repos (
       id, github_repo_id, installation_id, full_name, organization_id, project_id,
       default_branch, is_private, owned_by, created_at
     ) VALUES (
       'repo-1', 99, 7, 'renewimplants/social-preview', 'org-1', 'proj-1',
       'main', 1, 'agency', ?
     )`,
    [NOW],
  );
  return sql;
}

function delivery(event: string, payload: unknown, deliveryId = "del-1") {
  return { source: "github" as const, deliveryId, event, payload };
}

describe("applyGithubDelivery", () => {
  it("writes one pull request activity for a linked repo and ignores a repeat", async () => {
    const sql = await database();
    const message = delivery("pull_request", {
      action: "opened",
      pull_request: {
        number: 12,
        title: "Add the preview",
        html_url: "https://github.com/renewimplants/social-preview/pull/12",
        merged: false,
        user: { login: "ada" },
      },
      repository: { id: 99, full_name: "renewimplants/social-preview", default_branch: "main" },
    });
    const first = await applyGithubDelivery(sql, message, NOW);
    const second = await applyGithubDelivery(sql, message, NOW + 1);
    expect(first).toEqual({ ok: true, duplicate: false });
    expect(second).toEqual({ ok: true, duplicate: true });
    const rows = await sql.all<{
      kind: string;
      actor_kind: string;
      body: string;
      project_id: string;
      data_json: string;
    }>("SELECT kind, actor_kind, body, project_id, data_json FROM activities");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("pr_opened");
    expect(rows[0]?.actor_kind).toBe("system");
    expect(rows[0]?.project_id).toBe("proj-1");
    expect(rows[0]?.body).toBe(
      "Opened pull request #12 Add the preview in renewimplants/social-preview by ada",
    );
    expect(JSON.parse(rows[0]?.data_json ?? "{}")).toEqual({
      number: 12,
      url: "https://github.com/renewimplants/social-preview/pull/12",
      author: "ada",
      repo: "renewimplants/social-preview",
      title: "Add the preview",
    });
  });

  it("keeps a receipt and skips activity when the repo is not linked", async () => {
    const sql = await database();
    const result = await applyGithubDelivery(
      sql,
      delivery("pull_request", {
        action: "opened",
        pull_request: { number: 1, title: "Other", html_url: "https://github.com/a/b/pull/1", user: { login: "ada" } },
        repository: { id: 404, full_name: "other/repo", default_branch: "main" },
      }),
      NOW,
    );
    expect(result).toEqual({ ok: true, duplicate: false });
    expect(await sql.all("SELECT id FROM activities")).toEqual([]);
    const receipt = await sql.get<{ source: string }>(
      "SELECT source FROM intake_receipts WHERE external_id = 'del-1'",
    );
    expect(receipt?.source).toBe("github");
  });

  it("records a merge, a release, a deploy, and one default-branch push", async () => {
    const sql = await database();
    await applyGithubDelivery(
      sql,
      delivery(
        "pull_request",
        {
          action: "closed",
          pull_request: {
            number: 12,
            title: "Add the preview",
            html_url: "https://github.com/renewimplants/social-preview/pull/12",
            merged: false,
            user: { login: "ada" },
          },
          repository: { id: 99, full_name: "renewimplants/social-preview", default_branch: "main" },
        },
        "close",
      ),
      NOW,
    );
    await applyGithubDelivery(
      sql,
      delivery(
        "pull_request",
        {
          action: "closed",
          pull_request: {
            number: 12,
            title: "Add the preview",
            html_url: "https://github.com/renewimplants/social-preview/pull/12",
            merged: true,
            user: { login: "ada" },
          },
          repository: { id: 99, full_name: "renewimplants/social-preview", default_branch: "main" },
        },
        "merge",
      ),
      NOW,
    );
    await applyGithubDelivery(
      sql,
      delivery(
        "release",
        {
          action: "published",
          release: {
            tag_name: "v1",
            name: "v1",
            html_url: "https://github.com/renewimplants/social-preview/releases/tag/v1",
            author: { login: "ada" },
          },
          repository: { id: 99, full_name: "renewimplants/social-preview" },
        },
        "rel",
      ),
      NOW,
    );
    await applyGithubDelivery(
      sql,
      delivery(
        "deployment_status",
        {
          deployment_status: {
            state: "success",
            environment: "production",
            target_url: "https://github.com/renewimplants/social-preview/deployments/1",
            creator: { login: "ada" },
          },
          repository: { id: 99, full_name: "renewimplants/social-preview" },
        },
        "dep",
      ),
      NOW,
    );
    await applyGithubDelivery(
      sql,
      delivery(
        "deployment_status",
        {
          deployment_status: { state: "pending", environment: "production" },
          repository: { id: 99, full_name: "renewimplants/social-preview" },
        },
        "pending",
      ),
      NOW,
    );
    await applyGithubDelivery(
      sql,
      delivery(
        "push",
        {
          ref: "refs/heads/feature",
          repository: { id: 99, full_name: "renewimplants/social-preview", default_branch: "main" },
          pusher: { name: "ada" },
          commits: [{ id: "abc", added: ["secret.txt"], message: "do not store" }],
        },
        "branch",
      ),
      NOW,
    );
    await applyGithubDelivery(
      sql,
      delivery(
        "push",
        {
          ref: "refs/heads/main",
          compare: "https://github.com/renewimplants/social-preview/compare/a...b",
          repository: { id: 99, full_name: "renewimplants/social-preview", default_branch: "main" },
          pusher: { name: "ada" },
          commits: [{ id: "abc", added: ["secret.txt"], message: "do not store" }],
        },
        "push",
      ),
      NOW,
    );
    const kinds = await sql.all<{ kind: string; data_json: string }>(
      "SELECT kind, data_json FROM activities ORDER BY created_at, kind",
    );
    expect(kinds.map((row) => row.kind)).toEqual(["pr_merged", "release", "deploy", "push"]);
    const push = kinds.find((row) => row.kind === "push");
    expect(JSON.parse(push?.data_json ?? "{}")).toEqual({
      url: "https://github.com/renewimplants/social-preview/compare/a...b",
      author: "ada",
      repo: "renewimplants/social-preview",
    });
    expect(push?.data_json.includes("secret.txt")).toBe(false);
  });

  it("renames a repo and marks an install suspended, then clears it", async () => {
    const sql = await database();
    await applyGithubDelivery(
      sql,
      delivery(
        "repository",
        {
          action: "renamed",
          repository: { id: 99, full_name: "renewimplants/preview", default_branch: "main" },
        },
        "rename",
      ),
      NOW,
    );
    await applyGithubDelivery(
      sql,
      delivery(
        "installation",
        { action: "suspend", installation: { id: 7, account: { login: "abracadabra", type: "Organization" } } },
        "suspend",
      ),
      NOW,
    );
    const renamed = await sql.get<{ full_name: string }>("SELECT full_name FROM repos WHERE id = 'repo-1'");
    const suspended = await sql.get<{ suspended_at: number | null }>(
      "SELECT suspended_at FROM github_installations WHERE id = 7",
    );
    expect(renamed?.full_name).toBe("renewimplants/preview");
    expect(suspended?.suspended_at).toBe(NOW);
    await applyGithubDelivery(
      sql,
      delivery(
        "installation",
        { action: "unsuspend", installation: { id: 7, account: { login: "abracadabra", type: "Organization" } } },
        "unsuspend",
      ),
      NOW + 5,
    );
    const clear = await sql.get<{ suspended_at: number | null }>(
      "SELECT suspended_at FROM github_installations WHERE id = 7",
    );
    expect(clear?.suspended_at).toBeNull();
  });

  it("stores a new install and does nothing else for ping", async () => {
    const sql = await database();
    await applyGithubDelivery(
      sql,
      delivery(
        "installation",
        { action: "created", installation: { id: 8, account: { login: "agency", type: "Organization" } } },
        "install",
      ),
      NOW,
    );
    await applyGithubDelivery(sql, delivery("ping", { zen: "ok" }, "ping"), NOW);
    const row = await sql.get<{ account_login: string; organization_id: string | null }>(
      "SELECT account_login, organization_id FROM github_installations WHERE id = 8",
    );
    expect(row).toEqual({ account_login: "agency", organization_id: null });
    expect(await sql.all("SELECT id FROM activities")).toEqual([]);
  });
});
