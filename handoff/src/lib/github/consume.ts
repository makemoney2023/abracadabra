import type { Sql } from "@/db/sql";
import { saveInstallation } from "./installs";

export type GithubDelivery = {
  source: "github";
  deliveryId: string;
  event: string;
  payload: unknown;
};

type LinkedRepo = {
  id: string;
  organization_id: string;
  project_id: string | null;
  full_name: string;
  default_branch: string | null;
  archived_at: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isUnique(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE");
}

function loginOf(value: unknown): string {
  const login = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9-]{1,39}$/.test(login)) return "someone";
  return login;
}

function titleOf(value: unknown): string {
  if (typeof value !== "string") return "Untitled";
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) return "Untitled";
  return trimmed.slice(0, 200);
}

function githubUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("https://github.com/")) return null;
  return value;
}

function repoNameOk(value: string): boolean {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) && value.length <= 200;
}

async function nextActivityAt(sql: Sql, organizationId: string, now: number): Promise<number> {
  const row = await sql.get<{ latest: number | null }>(
    "SELECT MAX(created_at) AS latest FROM activities WHERE organization_id = ?",
    [organizationId],
  );
  return Math.max(now, (row?.latest ?? 0) + 1);
}

async function linkedRepo(sql: Sql, githubRepoId: number): Promise<LinkedRepo | undefined> {
  return sql.get<LinkedRepo>(
    `SELECT id, organization_id, project_id, full_name, default_branch, archived_at
     FROM repos WHERE github_repo_id = ?`,
    [githubRepoId],
  );
}

async function writeActivity(
  sql: Sql,
  repo: LinkedRepo,
  input: { kind: string; body: string; data: Record<string, string | number>; now: number },
): Promise<void> {
  if (repo.archived_at != null) return;
  const createdAt = await nextActivityAt(sql, repo.organization_id, input.now);
  await sql.run(
    `INSERT INTO activities (
       id, organization_id, project_id, kind, actor_kind, actor_id, body, data_json, created_at
     ) VALUES (?, ?, ?, ?, 'system', NULL, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      repo.organization_id,
      repo.project_id,
      input.kind,
      input.body,
      JSON.stringify(input.data),
      createdAt,
    ],
  );
}

async function renameRepo(sql: Sql, payload: Record<string, unknown>): Promise<void> {
  const repository = asRecord(payload.repository);
  const id = repository?.id;
  const fullName = repository?.full_name;
  if (typeof id !== "number" || typeof fullName !== "string" || !repoNameOk(fullName)) return;
  await sql.run("UPDATE repos SET full_name = ? WHERE github_repo_id = ?", [fullName, id]);
}

async function onPullRequest(sql: Sql, payload: Record<string, unknown>, now: number): Promise<void> {
  const repository = asRecord(payload.repository);
  const pull = asRecord(payload.pull_request);
  const user = asRecord(pull?.user);
  if (typeof repository?.id !== "number" || !pull) return;
  const repo = await linkedRepo(sql, repository.id);
  if (!repo) return;
  const number = pull.number;
  if (typeof number !== "number") return;
  const title = titleOf(pull.title);
  const author = loginOf(user?.login);
  const url = githubUrl(pull.html_url);
  const data: Record<string, string | number> = { number, author, repo: repo.full_name, title };
  if (url) data.url = url;
  if (payload.action === "opened") {
    await writeActivity(sql, repo, {
      kind: "pr_opened",
      body: `Opened pull request #${number} ${title} in ${repo.full_name} by ${author}`,
      data,
      now,
    });
    return;
  }
  if (payload.action === "closed" && pull.merged === true) {
    await writeActivity(sql, repo, {
      kind: "pr_merged",
      body: `Merged pull request #${number} ${title} in ${repo.full_name} by ${author}`,
      data,
      now,
    });
  }
}

async function onRelease(sql: Sql, payload: Record<string, unknown>, now: number): Promise<void> {
  if (payload.action !== "published") return;
  const repository = asRecord(payload.repository);
  const release = asRecord(payload.release);
  const author = asRecord(release?.author);
  if (typeof repository?.id !== "number" || !release) return;
  const repo = await linkedRepo(sql, repository.id);
  if (!repo) return;
  const title = titleOf(typeof release.name === "string" && release.name.trim() ? release.name : release.tag_name);
  const who = loginOf(author?.login);
  const url = githubUrl(release.html_url);
  const data: Record<string, string | number> = { author: who, repo: repo.full_name, title };
  if (url) data.url = url;
  await writeActivity(sql, repo, {
    kind: "release",
    body: `Published release ${title} in ${repo.full_name} by ${who}`,
    data,
    now,
  });
}

async function onDeploy(sql: Sql, payload: Record<string, unknown>, now: number): Promise<void> {
  const status = asRecord(payload.deployment_status);
  const repository = asRecord(payload.repository);
  const creator = asRecord(status?.creator);
  if (typeof repository?.id !== "number" || !status) return;
  const state = status.state;
  const failed = state === "failure" || state === "failed";
  if (state !== "success" && !failed) return;
  const repo = await linkedRepo(sql, repository.id);
  if (!repo) return;
  const author = loginOf(creator?.login);
  const url = githubUrl(status.target_url);
  const data: Record<string, string | number> = { author, repo: repo.full_name };
  if (url) data.url = url;
  const word = failed ? "failed" : "succeeded";
  await writeActivity(sql, repo, {
    kind: "deploy",
    body: `Deploy ${word} in ${repo.full_name} by ${author}`,
    data,
    now,
  });
}

async function onPush(sql: Sql, payload: Record<string, unknown>, now: number): Promise<void> {
  const repository = asRecord(payload.repository);
  const pusher = asRecord(payload.pusher);
  if (typeof repository?.id !== "number" || typeof payload.ref !== "string") return;
  const repo = await linkedRepo(sql, repository.id);
  if (!repo) return;
  const fromPayload = typeof repository.default_branch === "string" ? repository.default_branch : "";
  const branch = fromPayload || repo.default_branch || "main";
  if (payload.ref !== `refs/heads/${branch}`) return;
  const author = loginOf(pusher?.name);
  const url = githubUrl(payload.compare);
  const data: Record<string, string | number> = { author, repo: repo.full_name };
  if (url) data.url = url;
  await writeActivity(sql, repo, {
    kind: "push",
    body: `Pushed to ${branch} in ${repo.full_name} by ${author}`,
    data,
    now,
  });
}

async function onInstallation(sql: Sql, payload: Record<string, unknown>, now: number): Promise<void> {
  const installation = asRecord(payload.installation);
  const account = asRecord(installation?.account);
  if (typeof installation?.id !== "number" || typeof account?.login !== "string" || typeof account.type !== "string") {
    return;
  }
  const action = payload.action;
  const suspension = action === "suspend" || action === "deleted" ? "set" : action === "unsuspend" ? "clear" : "leave";
  if (action !== "created" && suspension === "leave") return;
  await saveInstallation(sql, {
    id: installation.id,
    accountLogin: account.login,
    accountType: account.type,
    now,
    suspension,
  });
}

async function applyEvent(sql: Sql, message: GithubDelivery, now: number): Promise<void> {
  const payload = asRecord(message.payload);
  if (!payload) return;
  if (message.event === "pull_request") await onPullRequest(sql, payload, now);
  else if (message.event === "release") await onRelease(sql, payload, now);
  else if (message.event === "deployment_status") await onDeploy(sql, payload, now);
  else if (message.event === "push") await onPush(sql, payload, now);
  else if (message.event === "repository" && (payload.action === "renamed" || payload.action === "transferred")) {
    await renameRepo(sql, payload);
  } else if (message.event === "installation") await onInstallation(sql, payload, now);
}

/** One delivery. A repeat delivery id is ignored. A failed write rolls the receipt back. */
export async function applyGithubDelivery(
  sql: Sql,
  message: GithubDelivery,
  now: number,
): Promise<{ ok: true; duplicate: boolean }> {
  await sql.exec("BEGIN");
  try {
    await sql.run(
      "INSERT INTO intake_receipts (source, external_id, received_at) VALUES ('github', ?, ?)",
      [message.deliveryId, now],
    );
  } catch (error) {
    await sql.exec("ROLLBACK");
    if (isUnique(error)) return { ok: true, duplicate: true };
    throw error;
  }
  try {
    await applyEvent(sql, message, now);
    await sql.exec("COMMIT");
    return { ok: true, duplicate: false };
  } catch (error) {
    await sql.exec("ROLLBACK");
    throw error;
  }
}
