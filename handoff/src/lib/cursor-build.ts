import type { Sql } from "@/db/sql";
import { publishDeliverableAsSystem, pullDeliverableAsSystem } from "@/db/deliverables";
import type { WakeReason } from "@/lib/agent-wake";
import { installationAccessToken, loadManifestBundle, resolveCommitSha } from "@/lib/github/contents";
import { cursorApiKey, readGithubSecrets } from "@/lib/github/secrets";
import { queueProductEvent } from "@/lib/notifications";

export type GateReason =
  | "brief_not_approved"
  | "design_system_not_approved"
  | "missing_build_brief"
  | "link_a_repo"
  | "repo_create_failed"
  | "repo_name_taken"
  | "cap_reached"
  | "agent_paused"
  | "cursor_start_failed"
  | "prompt_rejected";

export type BuildResult =
  | { ok: true; action: "started"; runId: string; repo: string; branch: string }
  | { ok: true; action: "resumed"; runId: string }
  | { ok: true; action: "waiting"; reason: "cap_reached" }
  | { ok: false; reason: GateReason };

export type BuildWake = (organizationId: string, reason: WakeReason) => Promise<void | boolean>;

export type BuildDeps = {
  fetch: typeof fetch;
  cursorKey: string | null;
  githubToken?: (installationId: number) => Promise<string | null>;
  put: (bytes: Uint8Array) => Promise<string>;
  now: number;
  wake?: BuildWake;
  newId?: () => string;
  origin?: string;
};

type RepoRow = {
  id: string;
  full_name: string;
  default_branch: string | null;
  installation_id: number | null;
  project_id: string | null;
  organization_id: string;
};

type TaskRow = {
  id: string;
  organization_id: string | null;
  project_id: string | null;
  title: string;
  deliverable_id: string | null;
  round: number;
};

const CURSOR = "https://api.cursor.com/v1/agents";
const GITHUB = "https://api.github.com";
const APP_ORIGIN = "https://handoff.abra-ca-dabra.app";

/** The build brief is the whole prompt. A poisoned or empty brief never starts a run. */
export function cursorPrompt(brief: string, extras?: string[]): string | null {
  if (!brief.trim()) return null;
  if (brief.includes("answers_json")) return null;
  if (/^From:/m.test(brief)) return null;
  if (extras?.some((extra) => extra.length > brief.length)) return null;
  return brief;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");
}

/** GitHub repo name from the organization name, then the organization id. */
export function repoSlug(name: string, orgId: string): string {
  return slugify(name) || slugify(orgId) || "repo";
}

function nextRawId(deps: BuildDeps): string {
  return deps.newId ? deps.newId() : crypto.randomUUID();
}

function agentIdFrom(raw: string): string {
  return raw.startsWith("bc-") ? raw : `bc-${raw}`;
}

function basicAuth(key: string): string {
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

/** Deps for the dashboard cron and the GitHub queue. Tests pass their own. */
export function defaultBuildDeps(now: number): BuildDeps {
  const origin = (process.env.HANDOFF_APP_ORIGIN ?? APP_ORIGIN).replace(/\/$/, "");
  const fetchImpl = globalThis.fetch.bind(globalThis);
  return {
    fetch: fetchImpl,
    cursorKey: cursorApiKey(),
    now,
    origin,
    githubToken: async (installationId) => {
      const secrets = readGithubSecrets();
      if (!secrets) return null;
      return installationAccessToken({
        appId: secrets.appId,
        privateKey: secrets.privateKey,
        installationId,
        fetch: fetchImpl,
        now,
      });
    },
    put: async (bytes) => {
      const { openObjectStore } = await import("@/lib/store/objects");
      const key = `${crypto.randomUUID()}/${crypto.randomUUID()}/${crypto.randomUUID()}`;
      await openObjectStore().put(key, bytes);
      return key;
    },
  };
}

async function settingNumber(sql: Sql, key: string, fallback: number): Promise<number> {
  const row = await sql.get<{ value: string }>("SELECT value FROM agent_settings WHERE key = ?", [key]);
  if (!row) return fallback;
  const parsed = Number(row.value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function block(sql: Sql, taskId: string, reason: GateReason, now: number): Promise<void> {
  await sql.run(
    `UPDATE tasks SET status = 'blocked', stage = 'build', blocked_reason = ?, updated_at = ? WHERE id = ?`,
    [reason, now, taskId],
  );
}

async function ask(
  sql: Sql,
  organizationId: string,
  taskId: string | null,
  deliverableId: string | null,
  question: string,
  now: number,
): Promise<void> {
  await sql.run(
    `INSERT INTO agent_questions (id, organization_id, task_id, deliverable_id, question, asked_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), organizationId, taskId, deliverableId, question, now],
  );
}

async function act(
  sql: Sql,
  organizationId: string,
  projectId: string | null,
  kind: string,
  data: Record<string, unknown>,
  now: number,
): Promise<void> {
  await sql.run(
    `INSERT INTO activities (
      id, organization_id, project_id, kind, actor_kind, actor_id, body, data_json, created_at
    ) VALUES (?, ?, ?, ?, 'system', 'cursor', NULL, ?, ?)`,
    [crypto.randomUUID(), organizationId, projectId, kind, JSON.stringify(data), now],
  );
}

async function approved(sql: Sql, organizationId: string, kind: "brief" | "design_system"): Promise<boolean> {
  const row = await sql.get<{ id: string }>(
    `SELECT id FROM deliverables WHERE organization_id = ? AND kind = ? AND status = 'approved' LIMIT 1`,
    [organizationId, kind],
  );
  return Boolean(row);
}

async function openRunCount(sql: Sql): Promise<number> {
  const row = await sql.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM cloud_runs WHERE status IN ('started', 'pr_open')`,
  );
  return Number(row?.n ?? 0);
}

async function chooseRepo(sql: Sql, organizationId: string, projectId: string | null): Promise<RepoRow | "create" | "link"> {
  const rows = await sql.all<RepoRow>(
    `SELECT id, full_name, default_branch, installation_id, project_id, organization_id
     FROM repos
     WHERE organization_id = ? AND archived_at IS NULL
     ORDER BY created_at, id`,
    [organizationId],
  );
  if (projectId) {
    const linked = rows.find((row) => row.project_id === projectId);
    if (linked) return linked;
  }
  if (rows.length === 1) return rows[0] as RepoRow;
  if (rows.length === 0) return "create";
  return "link";
}

type Install = { id: number; account_login: string; account_type: string };

async function liveInstall(sql: Sql): Promise<Install | "none" | "many"> {
  const rows = await sql.all<Install>(
    `SELECT id, account_login, account_type FROM github_installations
     WHERE suspended_at IS NULL ORDER BY id`,
  );
  if (rows.length === 1) return rows[0] as Install;
  if (rows.length === 0) return "none";
  return "many";
}

async function createRepo(
  sql: Sql,
  task: TaskRow,
  orgName: string,
  deps: BuildDeps,
): Promise<{ ok: true; repo: RepoRow } | { ok: false; reason: GateReason }> {
  const organizationId = task.organization_id ?? "";
  const install = await liveInstall(sql);
  if (install === "none" || install === "many") {
    await ask(
      sql,
      organizationId,
      task.id,
      task.deliverable_id,
      `Could not create a GitHub repo for ${orgName}. Retry, or take over?`,
      deps.now,
    );
    await block(sql, task.id, "repo_create_failed", deps.now);
    return { ok: false, reason: "repo_create_failed" };
  }
  const token = deps.githubToken ? await deps.githubToken(install.id) : null;
  if (!token) {
    await ask(
      sql,
      organizationId,
      task.id,
      task.deliverable_id,
      `Could not create a GitHub repo for ${orgName}. Retry, or take over?`,
      deps.now,
    );
    await block(sql, task.id, "repo_create_failed", deps.now);
    return { ok: false, reason: "repo_create_failed" };
  }
  const slug = repoSlug(orgName, organizationId);
  const url =
    install.account_type === "Organization"
      ? `${GITHUB}/orgs/${install.account_login}/repos`
      : `${GITHUB}/user/repos`;
  let response: Response;
  try {
    response = await deps.fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "user-agent": "handoff",
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: slug, private: true, auto_init: true }),
    });
  } catch {
    await ask(
      sql,
      organizationId,
      task.id,
      task.deliverable_id,
      `Could not create a GitHub repo for ${orgName}. Retry, or take over?`,
      deps.now,
    );
    await block(sql, task.id, "repo_create_failed", deps.now);
    return { ok: false, reason: "repo_create_failed" };
  }
  if (response.status === 422) {
    const fullName = `${install.account_login}/${slug}`;
    const existing = await sql.get<{ id: string; organization_id: string }>(
      "SELECT id, organization_id FROM repos WHERE full_name = ?",
      [fullName],
    );
    if (!existing || existing.organization_id !== organizationId) {
      await block(sql, task.id, "repo_name_taken", deps.now);
      return { ok: false, reason: "repo_name_taken" };
    }
    await sql.run("UPDATE repos SET archived_at = NULL, project_id = COALESCE(project_id, ?) WHERE id = ?", [
      task.project_id,
      existing.id,
    ]);
    const reused = await sql.get<RepoRow>(
      `SELECT id, full_name, default_branch, installation_id, project_id, organization_id FROM repos WHERE id = ?`,
      [existing.id],
    );
    if (!reused) {
      await block(sql, task.id, "repo_name_taken", deps.now);
      return { ok: false, reason: "repo_name_taken" };
    }
    return { ok: true, repo: reused };
  }
  if (!response.ok) {
    await ask(
      sql,
      organizationId,
      task.id,
      task.deliverable_id,
      `Could not create a GitHub repo for ${orgName}. Retry, or take over?`,
      deps.now,
    );
    await block(sql, task.id, "repo_create_failed", deps.now);
    return { ok: false, reason: "repo_create_failed" };
  }
  const body = (await response.json()) as { id?: unknown; full_name?: unknown; default_branch?: unknown };
  if (typeof body.id !== "number" || typeof body.full_name !== "string") {
    await ask(
      sql,
      organizationId,
      task.id,
      task.deliverable_id,
      `Could not create a GitHub repo for ${orgName}. Retry, or take over?`,
      deps.now,
    );
    await block(sql, task.id, "repo_create_failed", deps.now);
    return { ok: false, reason: "repo_create_failed" };
  }
  const repoId = nextRawId(deps);
  const branch = typeof body.default_branch === "string" && body.default_branch ? body.default_branch : "main";
  await sql.run(
    `INSERT INTO repos (
      id, github_repo_id, installation_id, full_name, organization_id, project_id,
      default_branch, is_private, owned_by, linked_by, created_at, archived_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'agency', NULL, ?, NULL)`,
    [repoId, body.id, install.id, body.full_name, organizationId, task.project_id, branch, deps.now],
  );
  await act(sql, organizationId, task.project_id, "agent.repo_created", { repo: body.full_name }, deps.now);
  return {
    ok: true,
    repo: {
      id: repoId,
      full_name: body.full_name,
      default_branch: branch,
      installation_id: install.id,
      project_id: task.project_id,
      organization_id: organizationId,
    },
  };
}

async function failStart(
  sql: Sql,
  task: TaskRow,
  runId: string,
  deps: BuildDeps,
): Promise<BuildResult> {
  await sql.run(`UPDATE cloud_runs SET status = 'failed', error = 'cursor_start_failed', finished_at = ? WHERE id = ?`, [
    deps.now,
    runId,
  ]);
  await block(sql, task.id, "cursor_start_failed", deps.now);
  if (task.organization_id) {
    await ask(
      sql,
      task.organization_id,
      task.id,
      task.deliverable_id,
      `Could not start the cloud run for ${task.title}. Retry, or take over?`,
      deps.now,
    );
    await act(sql, task.organization_id, task.project_id, "agent.build_failed", { runId, reason: "cursor_start_failed" }, deps.now);
  }
  return { ok: false, reason: "cursor_start_failed" };
}

/** Start or resume the cloud run for a task that has reached build. */
export async function startBuild(sql: Sql, taskId: string, deps: BuildDeps): Promise<BuildResult> {
  const task = await sql.get<TaskRow>(
    `SELECT id, organization_id, project_id, title, deliverable_id, round FROM tasks WHERE id = ?`,
    [taskId],
  );
  if (!task) return { ok: false, reason: "missing_build_brief" };
  if (!task.organization_id) {
    await block(sql, task.id, "missing_build_brief", deps.now);
    return { ok: false, reason: "missing_build_brief" };
  }
  if (!(await approved(sql, task.organization_id, "brief"))) {
    await block(sql, task.id, "brief_not_approved", deps.now);
    return { ok: false, reason: "brief_not_approved" };
  }
  if (!(await approved(sql, task.organization_id, "design_system"))) {
    await block(sql, task.id, "design_system_not_approved", deps.now);
    return { ok: false, reason: "design_system_not_approved" };
  }
  if (!task.deliverable_id) {
    await block(sql, task.id, "missing_build_brief", deps.now);
    return { ok: false, reason: "missing_build_brief" };
  }
  const brief = await sql.get<{ copy_text: string | null }>(
    `SELECT deliverable_items.copy_text
     FROM deliverable_items
     JOIN deliverables ON deliverables.id = deliverable_items.deliverable_id
     WHERE deliverable_items.deliverable_id = ?
       AND deliverable_items.title = 'build-brief.md'
       AND deliverable_items.version = deliverables.version
     ORDER BY deliverable_items.sort
     LIMIT 1`,
    [task.deliverable_id],
  );
  if (!brief) {
    await block(sql, task.id, "missing_build_brief", deps.now);
    return { ok: false, reason: "missing_build_brief" };
  }
  const prompt = cursorPrompt(brief.copy_text ?? "");
  if (!prompt) {
    await block(sql, task.id, "prompt_rejected", deps.now);
    return { ok: false, reason: "prompt_rejected" };
  }
  const org = await sql.get<{ name: string; agent_paused_at: number | null }>(
    "SELECT name, agent_paused_at FROM organizations WHERE id = ?",
    [task.organization_id],
  );
  const chosen = await chooseRepo(sql, task.organization_id, task.project_id);
  let repo: RepoRow;
  if (chosen === "link") {
    await block(sql, task.id, "link_a_repo", deps.now);
    return { ok: false, reason: "link_a_repo" };
  }
  if (chosen === "create") {
    const created = await createRepo(sql, task, org?.name?.trim() || task.organization_id, deps);
    if (!created.ok) return created;
    repo = created.repo;
  } else {
    repo = chosen;
  }
  const open = await sql.get<{ id: string }>(
    `SELECT id FROM cloud_runs
     WHERE task_id = ? AND round = ? AND status IN ('started', 'pr_open')
     ORDER BY started_at DESC LIMIT 1`,
    [task.id, task.round],
  );
  if (open) {
    await sql.run("UPDATE tasks SET stage = 'build', updated_at = ? WHERE id = ?", [deps.now, task.id]);
    return { ok: true, action: "resumed", runId: open.id };
  }
  const cap = await settingNumber(sql, "max_cloud_runs", 4);
  if ((await openRunCount(sql)) >= cap) {
    await sql.run(
      `UPDATE tasks SET status = 'todo', stage = 'build', blocked_reason = NULL, updated_at = ? WHERE id = ?`,
      [deps.now, task.id],
    );
    return { ok: true, action: "waiting", reason: "cap_reached" };
  }
  if (org?.agent_paused_at != null) {
    await block(sql, task.id, "agent_paused", deps.now);
    return { ok: false, reason: "agent_paused" };
  }
  const hours = await settingNumber(sql, "build_deadline_hours", 2);
  const deadline = deps.now + hours * 3_600_000;
  const runId = agentIdFrom(nextRawId(deps));
  const branch = `handoff/${task.deliverable_id}/r${task.round}`;
  if (!deps.cursorKey) {
    await sql.run(
      `INSERT INTO cloud_runs (
        id, task_id, deliverable_id, repo_id, round, status, branch, started_at, deadline_at, finished_at, error
      ) VALUES (?, ?, ?, ?, ?, 'failed', ?, ?, ?, ?, 'missing_key')`,
      [runId, task.id, task.deliverable_id, repo.id, task.round, branch, deps.now, deadline, deps.now],
    );
    await block(sql, task.id, "cursor_start_failed", deps.now);
    await ask(
      sql,
      task.organization_id,
      task.id,
      task.deliverable_id,
      `Could not start the cloud run for ${task.title}. Retry, or take over?`,
      deps.now,
    );
    await act(sql, task.organization_id, task.project_id, "agent.build_failed", { runId, reason: "cursor_start_failed" }, deps.now);
    return { ok: false, reason: "cursor_start_failed" };
  }
  await sql.run(
    `INSERT INTO cloud_runs (
      id, task_id, deliverable_id, repo_id, round, status, branch, started_at, deadline_at
    ) VALUES (?, ?, ?, ?, ?, 'started', ?, ?, ?)`,
    [runId, task.id, task.deliverable_id, repo.id, task.round, branch, deps.now, deadline],
  );
  await sql.run(
    `UPDATE tasks SET status = 'doing', stage = 'build', cursor_agent_id = ?, blocked_reason = NULL, updated_at = ? WHERE id = ?`,
    [runId, deps.now, task.id],
  );
  const name = `Deliverable ${task.deliverable_id} round ${task.round}`.slice(0, 100);
  let response: Response;
  try {
    response = await deps.fetch(CURSOR, {
      method: "POST",
      headers: {
        authorization: basicAuth(deps.cursorKey),
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        prompt: { text: prompt },
        repos: [{ url: `https://github.com/${repo.full_name}`, startingRef: repo.default_branch || "main" }],
        autoCreatePR: true,
        skipReviewerRequest: true,
        name,
        agentId: runId,
      }),
    });
  } catch {
    return failStart(sql, task, runId, deps);
  }
  if (response.status !== 409 && !response.ok) return failStart(sql, task, runId, deps);
  await act(sql, task.organization_id, task.project_id, "agent.build_started", { runId, repo: repo.full_name, branch }, deps.now);
  return { ok: true, action: "started", runId, repo: repo.full_name, branch };
}

/** Launch builds that were waiting because every cloud-run slot was full. */
export async function retryCappedBuilds(sql: Sql, deps: BuildDeps): Promise<void> {
  const rows = await sql.all<{ id: string }>(
    `SELECT id FROM tasks
     WHERE stage = 'build' AND status = 'todo' AND blocked_reason IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM cloud_runs
         WHERE cloud_runs.task_id = tasks.id
           AND cloud_runs.round = tasks.round
           AND cloud_runs.status IN ('started', 'pr_open')
       )
     ORDER BY updated_at, id`,
  );
  for (const row of rows) {
    const result = await startBuild(sql, row.id, deps);
    if (result.ok && result.action === "waiting") return;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function deliverableFromPull(payload: Record<string, unknown>): string | null {
  const pull = asRecord(payload.pull_request);
  const body = typeof pull?.body === "string" ? pull.body : "";
  const first = body.split(/\r?\n/, 1)[0] ?? "";
  const line = /^Deliverable:\s*(\S+)\s*$/.exec(first);
  if (line?.[1]) return line[1];
  const ref = asRecord(pull?.head)?.ref;
  if (typeof ref === "string") {
    const branch = /^handoff\/([^/]+)\/r\d+$/.exec(ref);
    if (branch?.[1]) return branch[1];
  }
  return null;
}

function manifestPath(brief: string, kind: string): string {
  const match = /Write deliverables\/([a-z0-9-]+)\/manifest\.json\./.exec(brief);
  const folder = match?.[1] ?? kind.replaceAll("_", "-");
  return `deliverables/${folder}/manifest.json`;
}

type RunJoin = {
  id: string;
  task_id: string;
  deliverable_id: string;
  repo_id: string;
  status: string;
  head_sha: string | null;
  github_repo_id: number;
  full_name: string;
  installation_id: number | null;
  repo_org: string;
  deliverable_org: string;
  deliverable_title: string;
  kind: string;
  workspace_id: string;
  project_id: string | null;
  task_title: string;
  auto_publish_built: number;
};

async function rejectManifest(sql: Sql, run: RunJoin, now: number): Promise<void> {
  await sql.run(
    `UPDATE cloud_runs SET status = 'failed', error = 'The manifest was rejected.', finished_at = ? WHERE id = ?`,
    [now, run.id],
  );
  await sql.run(
    `UPDATE tasks SET status = 'blocked', blocked_reason = 'manifest_rejected', updated_at = ? WHERE id = ?`,
    [now, run.task_id],
  );
}

/** Pull a cloud run when a pull request names its deliverable. */
export async function ingestPullRequest(sql: Sql, payload: unknown, deps: BuildDeps): Promise<void> {
  const record = asRecord(payload);
  if (!record) return;
  const deliverableId = deliverableFromPull(record);
  if (!deliverableId) return;
  const run = await sql.get<RunJoin>(
    `SELECT cloud_runs.id, cloud_runs.task_id, cloud_runs.deliverable_id, cloud_runs.repo_id, cloud_runs.status,
            cloud_runs.head_sha, repos.github_repo_id, repos.full_name, repos.installation_id,
            repos.organization_id AS repo_org, deliverables.organization_id AS deliverable_org,
            deliverables.title AS deliverable_title, deliverables.kind, deliverables.workspace_id,
            deliverables.project_id, tasks.title AS task_title, organizations.auto_publish_built
     FROM cloud_runs
     JOIN repos ON repos.id = cloud_runs.repo_id
     JOIN deliverables ON deliverables.id = cloud_runs.deliverable_id
     JOIN tasks ON tasks.id = cloud_runs.task_id
     JOIN organizations ON organizations.id = deliverables.organization_id
     WHERE cloud_runs.deliverable_id = ?
     ORDER BY CASE WHEN cloud_runs.status IN ('started', 'pr_open') THEN 0 ELSE 1 END, cloud_runs.round DESC
     LIMIT 1`,
    [deliverableId],
  );
  if (!run) return;
  const repository = asRecord(record.repository);
  if (typeof repository?.id !== "number" || repository.id !== run.github_repo_id) return;
  const pull = asRecord(record.pull_request);
  if (!pull) return;
  const action = typeof record.action === "string" ? record.action : "";
  if (action === "closed" && pull.merged === true) return;
  if (action === "closed") {
    await sql.run(`UPDATE cloud_runs SET status = 'failed', error = 'pr_closed', finished_at = ? WHERE id = ?`, [
      deps.now,
      run.id,
    ]);
    await sql.run(
      `UPDATE tasks SET status = 'blocked', blocked_reason = 'pr_closed', updated_at = ? WHERE id = ?`,
      [deps.now, run.task_id],
    );
    return;
  }
  if (action !== "opened" && action !== "synchronize") return;
  const head = asRecord(pull.head);
  const sha = typeof head?.sha === "string" ? head.sha : "";
  const ref = typeof head?.ref === "string" ? head.ref : "";
  if (run.status === "pulled" && run.head_sha === sha && sha) return;
  if (run.repo_org !== run.deliverable_org) {
    await act(sql, run.deliverable_org, run.project_id, "agent.build_failed", { error: "repo_org_mismatch" }, deps.now);
    return;
  }
  const number = typeof pull.number === "number" ? pull.number : null;
  await sql.run(`UPDATE cloud_runs SET status = 'pr_open', pr_number = ?, branch = ? WHERE id = ?`, [number, ref, run.id]);
  if (run.installation_id == null || !deps.githubToken) return;
  const token = await deps.githubToken(run.installation_id);
  if (!token || !sha) return;
  const resolved = await resolveCommitSha({ fullName: run.full_name, ref: sha, token, fetch: deps.fetch });
  if (!resolved) return;
  const brief = await sql.get<{ copy_text: string | null }>(
    `SELECT copy_text FROM deliverable_items
     WHERE deliverable_id = ? AND title = 'build-brief.md'
     ORDER BY version DESC, sort LIMIT 1`,
    [run.deliverable_id],
  );
  const bundle = await loadManifestBundle({
    fullName: run.full_name,
    ref: sha,
    manifestPath: manifestPath(brief?.copy_text ?? "", run.kind),
    token,
    fetch: deps.fetch,
  });
  if (!bundle.ok && bundle.error === "unavailable") return;
  if (!bundle.ok) {
    await rejectManifest(sql, run, deps.now);
    return;
  }
  const title = run.deliverable_title;
  const pulled = await pullDeliverableAsSystem(
    sql,
    {
      deliverableId: run.deliverable_id,
      repoId: run.repo_id,
      commit: resolved,
      manifest: bundle.value.manifest,
      files: bundle.value.files,
    },
    deps.now,
    deps.put,
  );
  if (!pulled.ok) {
    await rejectManifest(sql, run, deps.now);
    return;
  }
  await sql.run(
    `UPDATE cloud_runs SET status = 'pulled', head_sha = ?, finished_at = ?, error = NULL WHERE id = ?`,
    [resolved, deps.now, run.id],
  );
  await sql.run(
    `UPDATE tasks SET status = 'done', stage = 'run', done_at = ?, blocked_reason = NULL, updated_at = ? WHERE id = ?`,
    [deps.now, deps.now, run.task_id],
  );
  await act(sql, run.deliverable_org, run.project_id, "agent.build_pulled", { deliverableId: run.deliverable_id, runId: run.id }, deps.now);
  if (Number(run.auto_publish_built) === 0) {
    await act(sql, run.deliverable_org, run.project_id, "agent.ready_to_publish", { deliverableId: run.deliverable_id }, deps.now);
    return;
  }
  const published = await publishDeliverableAsSystem(sql, run.deliverable_id, deps.now);
  if (!published.ok) return;
  const version = published.value.version;
  const notice = await sql.get<{ deliverable_id: string }>(
    "SELECT deliverable_id FROM deliverable_notices WHERE deliverable_id = ? AND version = ?",
    [run.deliverable_id, version],
  );
  if (notice) return;
  await sql.run(`INSERT INTO deliverable_notices (deliverable_id, version, sent_at) VALUES (?, ?, ?)`, [
    run.deliverable_id,
    version,
    deps.now,
  ]);
  const members = await sql.all<{ email: string }>(
    `SELECT email FROM memberships WHERE workspace_id = ? AND revoked_at IS NULL ORDER BY email`,
    [run.workspace_id],
  );
  await queueProductEvent(
    sql,
    { kind: "deliverable.published", deliverableId: run.deliverable_id, version, title },
    deps.now,
  );
  await act(
    sql,
    run.deliverable_org,
    run.project_id,
    "agent.published",
    { deliverableId: run.deliverable_id, version, recipients: members.length },
    deps.now,
  );
}

function branchesOf(value: unknown): { prUrl?: unknown }[] {
  const git = asRecord(value)?.git;
  const branches = asRecord(git)?.branches;
  return Array.isArray(branches) ? (branches as { prUrl?: unknown }[]) : [];
}

function hasPullRequest(agent: unknown, run: unknown): boolean {
  return [...branchesOf(agent), ...branchesOf(run)].some(
    (branch) => typeof branch?.prUrl === "string" && branch.prUrl.length > 0,
  );
}

async function failCloudRun(
  sql: Sql,
  row: { id: string; task_id: string; organization_id: string; deliverable_id: string; title: string },
  status: "failed" | "expired",
  blockedReason: "failed" | "expired",
  now: number,
): Promise<void> {
  await sql.run(`UPDATE cloud_runs SET status = ?, finished_at = ? WHERE id = ?`, [status, now, row.id]);
  await sql.run(`UPDATE tasks SET status = 'blocked', blocked_reason = ?, updated_at = ? WHERE id = ?`, [
    blockedReason,
    now,
    row.task_id,
  ]);
  await ask(
    sql,
    row.organization_id,
    row.task_id,
    row.deliverable_id,
    `Run for ${row.title} did not produce a PR. Retry, or take over?`,
    now,
  );
}

/** Expire a started run that missed its deadline, after one look for a pull request. */
export async function expireCloudRuns(sql: Sql, deps: BuildDeps): Promise<void> {
  const rows = await sql.all<{
    id: string;
    task_id: string;
    error: string | null;
    deliverable_id: string;
    title: string;
    organization_id: string;
  }>(
    `SELECT cloud_runs.id, cloud_runs.task_id, cloud_runs.error, cloud_runs.deliverable_id, tasks.title, tasks.organization_id
     FROM cloud_runs
     JOIN tasks ON tasks.id = cloud_runs.task_id
     WHERE cloud_runs.status = 'started' AND cloud_runs.deadline_at <= ?`,
    [deps.now],
  );
  for (const row of rows) {
    if (!row.organization_id) continue;
    if (!deps.cursorKey) {
      await failCloudRun(sql, row, "failed", "failed", deps.now);
      continue;
    }
    let agentResponse: Response;
    try {
      agentResponse = await deps.fetch(`${CURSOR}/${encodeURIComponent(row.id)}`, {
        headers: { authorization: basicAuth(deps.cursorKey), accept: "application/json" },
      });
    } catch {
      await failCloudRun(sql, row, "failed", "failed", deps.now);
      continue;
    }
    if (!agentResponse.ok) {
      await failCloudRun(sql, row, "failed", "failed", deps.now);
      continue;
    }
    const agent = (await agentResponse.json()) as { latestRunId?: unknown; git?: unknown };
    if (typeof agent.latestRunId !== "string" || !agent.latestRunId) {
      await failCloudRun(sql, row, "failed", "failed", deps.now);
      continue;
    }
    let runResponse: Response;
    try {
      runResponse = await deps.fetch(`${CURSOR}/${encodeURIComponent(row.id)}/runs/${encodeURIComponent(agent.latestRunId)}`, {
        headers: { authorization: basicAuth(deps.cursorKey), accept: "application/json" },
      });
    } catch {
      await failCloudRun(sql, row, "failed", "failed", deps.now);
      continue;
    }
    if (!runResponse.ok) {
      await failCloudRun(sql, row, "failed", "failed", deps.now);
      continue;
    }
    const runBody = (await runResponse.json()) as { status?: unknown; git?: unknown };
    if (hasPullRequest(agent, runBody)) continue;
    const status = typeof runBody.status === "string" ? runBody.status : "";
    if (status === "CREATING" || status === "RUNNING") continue;
    if (status === "FINISHED") {
      if (row.error === "awaiting_pr") await failCloudRun(sql, row, "expired", "expired", deps.now);
      else await sql.run("UPDATE cloud_runs SET error = 'awaiting_pr' WHERE id = ?", [row.id]);
      continue;
    }
    if (status === "ERROR" || status === "CANCELLED") {
      await failCloudRun(sql, row, "failed", "failed", deps.now);
      continue;
    }
    if (status === "EXPIRED") await failCloudRun(sql, row, "expired", "expired", deps.now);
  }
}

/** Clear whatever block a staff answer was waiting on, and wake the client agent. */
export async function unblockAnsweredQuestion(sql: Sql, questionId: string, now: number, wake?: BuildWake): Promise<void> {
  const row = await sql.get<{ organization_id: string; task_id: string | null }>(
    "SELECT organization_id, task_id FROM agent_questions WHERE id = ?",
    [questionId],
  );
  if (!row) return;
  if (row.task_id) {
    await sql.run(
      `UPDATE tasks SET status = 'todo', blocked_reason = NULL, updated_at = ? WHERE id = ? AND status = 'blocked'`,
      [now, row.task_id],
    );
  }
  await act(sql, row.organization_id, null, "agent.answered", { questionId }, now);
  if (wake) await wake(row.organization_id, "work");
}

function reviseSkills(raw: string | null): string {
  let record: Record<string, unknown> = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) record = parsed as Record<string, unknown>;
    } catch {
      record = {};
    }
  }
  const steps = Array.isArray(record.steps) ? record.steps : [];
  const paths = steps.map((step) => (step && typeof step === "object" ? String((step as { path?: unknown }).path ?? "") : ""));
  const copyIndex = paths.findIndex((path) => path.includes("copywriting"));
  const next = steps.map((step, index) => {
    const current = step && typeof step === "object" ? (step as Record<string, unknown>) : {};
    const path = paths[index] ?? "";
    const research = path.includes("research");
    if (copyIndex === -1) return { ...current, status: research ? "done" : "todo" };
    if (index < copyIndex) return research ? { ...current, status: "done" } : current;
    return { ...current, status: "todo" };
  });
  const current = next.findIndex((step) => step.status !== "done");
  return JSON.stringify({ ...record, steps: next, current: current === -1 ? next.length : current });
}

/** Open the next round when a client asks for changes on a built deliverable. */
export async function startRevision(
  sql: Sql,
  deliverableId: string,
  now: number,
  wake?: BuildWake,
): Promise<{ taskId: string } | null> {
  const deliverable = await sql.get<{ id: string; kind: string; status: string; organization_id: string }>(
    "SELECT id, kind, status, organization_id FROM deliverables WHERE id = ?",
    [deliverableId],
  );
  if (!deliverable || deliverable.kind === "brief" || deliverable.kind === "design_system") return null;
  if (deliverable.status !== "changes_requested") return null;
  const task = await sql.get<{
    id: string;
    title: string;
    project_id: string | null;
    organization_id: string | null;
    round: number;
    status: string;
    skills_json: string | null;
  }>(
    `SELECT id, title, project_id, organization_id, round, status, skills_json
     FROM tasks WHERE deliverable_id = ? ORDER BY round DESC LIMIT 1`,
    [deliverableId],
  );
  if (!task || task.status !== "done") return null;
  const existing = await sql.get<{ id: string }>("SELECT id FROM tasks WHERE deliverable_id = ? AND round = ?", [
    deliverableId,
    task.round + 1,
  ]);
  if (existing) return null;
  const taskId = crypto.randomUUID();
  await sql.run(
    `INSERT INTO tasks (
      id, project_id, organization_id, title, status, created_at, updated_at,
      stage, deliverable_id, round, created_by_kind, skills_json
    ) VALUES (?, ?, ?, ?, 'todo', ?, ?, 'engineer', ?, ?, 'agent', ?)`,
    [
      taskId,
      task.project_id,
      task.organization_id,
      task.title,
      now,
      now,
      deliverableId,
      task.round + 1,
      reviseSkills(task.skills_json),
    ],
  );
  if (task.organization_id) {
    await act(sql, task.organization_id, task.project_id, "agent.revision_started", { deliverableId, taskId, round: task.round + 1 }, now);
    if (wake) await wake(task.organization_id, "changes_requested");
  }
  return { taskId };
}
