import { generateKeyPairSync } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { linkChosenRepo } from "./link";

const NOW = 1_700_000_000_000;

const staff: Caller = {
  userId: "staff-1",
  staff: { superAdmin: false },
  operatorOf: [],
  memberships: [],
};

function secrets() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    appId: "99",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    webhookSecret: "hook",
  };
}

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
    `INSERT INTO organizations (id, name, kind, created_at, updated_at)
     VALUES ('org-2', 'Other', 'client', ?, ?)`,
    [NOW, NOW],
  );
  return sql;
}

function githubFetch(repoId: number): typeof fetch {
  return async (input) => {
    const url = String(input);
    if (url.endsWith("/app/installations")) {
      return Response.json([{ id: 7, account: { login: "abracadabra", type: "Organization" }, suspended_at: null }]);
    }
    if (url.endsWith("/access_tokens")) return Response.json({ token: "ghs_test" });
    return Response.json({
      repositories: [
        {
          id: repoId,
          full_name: "renewimplants/social-preview",
          private: true,
          default_branch: "main",
        },
      ],
    });
  };
}

describe("linkChosenRepo", () => {
  it("stores the name GitHub returned", async () => {
    const sql = await database();
    const linked = await linkChosenRepo(
      sql,
      staff,
      {
        organizationId: "org-1",
        githubRepoId: 99,
        now: NOW,
        secrets: secrets(),
        fetch: githubFetch(99),
      },
    );
    expect(linked.ok).toBe(true);
    const row = await sql.get<{ full_name: string; installation_id: number }>(
      "SELECT full_name, installation_id FROM repos WHERE github_repo_id = 99",
    );
    expect(row).toEqual({ full_name: "renewimplants/social-preview", installation_id: 7 });
  });

  it("refuses a missing app, a GitHub failure, a hidden repo, and a repo on another client", async () => {
    const sql = await database();
    const missing = await linkChosenRepo(sql, staff, {
      organizationId: "org-1",
      githubRepoId: 99,
      now: NOW,
      secrets: null,
    });
    expect(missing).toEqual({ ok: false, message: "The GitHub App is not connected yet." });

    const down = await linkChosenRepo(sql, staff, {
      organizationId: "org-1",
      githubRepoId: 99,
      now: NOW,
      secrets: secrets(),
      fetch: async () => new Response("no", { status: 500 }),
    });
    expect(down).toEqual({ ok: false, message: "GitHub did not answer. Try again." });

    const hidden = await linkChosenRepo(sql, staff, {
      organizationId: "org-1",
      githubRepoId: 404,
      now: NOW,
      secrets: secrets(),
      fetch: githubFetch(99),
    });
    expect(hidden).toEqual({ ok: false, message: "That repo is not one this app can see." });

    const first = await linkChosenRepo(sql, staff, {
      organizationId: "org-1",
      githubRepoId: 99,
      now: NOW,
      secrets: secrets(),
      fetch: githubFetch(99),
    });
    expect(first.ok).toBe(true);
    const taken = await linkChosenRepo(sql, staff, {
      organizationId: "org-2",
      githubRepoId: 99,
      now: NOW,
      secrets: secrets(),
      fetch: githubFetch(99),
    });
    expect(taken).toEqual({ ok: false, message: "That repo is already linked to another client." });
  });
});
