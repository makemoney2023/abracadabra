import { AgentWorkError, saveStaffBrief } from "@/db/agent-work";
import { actionFromLine, applyChannelPlan, dueMillis } from "@/lib/channel-plan";
import { linkSlackChannel, listWorkRequests, setWorkRequestState, workRequestById } from "@/db/conversations";
import {
  addNote,
  cleanRepoName,
  assignRepoProject,
  assignSpaceProject,
  createDraftInvoice,
  completeTask,
  createContact,
  deleteProject,
  deleteTask,
  createMilestone,
  createOrganization,
  createProject,
  createTask,
  listDeals,
  listOrganizations,
  listRepos,
  listTimeline,
  logCall,
  mergeOrganizations,
  moveDealStage,
  organizationById,
  postStatusUpdate,
  saveProjectDescription,
  type LinkedRepo,
  type StatusHealth,
} from "@/db/crm";
import { publishDeliverable } from "@/db/deliverables";
import type { Sql } from "@/db/sql";
import { getBrief } from "@/lib/agent-context";
import { wakeOrganization, type WakeEnv, type WakeReason } from "@/lib/agent-wake";
import { beginDirectClient, scanIntakeBindings, type ScanQueue } from "@/lib/lead-schema";
import { defaultBuildDeps, unblockAnsweredQuestion, type BuildDeps, type GateReason } from "@/lib/cursor-build";
import { moveTaskStage } from "@/lib/task-stage";
import { decideReview } from "@/lib/task-review";
import { columnOf as boardColumnOf } from "@/lib/board-model";
import type { Caller } from "@/lib/authz";
import { itemForPath } from "@/lib/artifact-adapter";
import { workflowSpacePath } from "@/lib/workflow-files";
import { appendBriefWork } from "@/lib/client-plan";
import {
  assignClientWorkflow,
  claimDueWorkflow,
  createClientWorkflow,
  createWorkflowGroup,
  listClientWorkflows,
  resumeQuestionStage,
  storeSwarmReport,
  workflowTaskPlan,
  type WorkflowTaskPlan,
} from "@/lib/client-workflows";
import {
  abandonPipeline,
  acceptWorkflow,
  appendPipelineStage,
  clipPipelineView,
  pipelineStatus,
  startPipeline,
} from "@/lib/specialist-pipeline";
import { packsFromTemplates } from "@/lib/pack-picker";
import { packTemplateId, swarmPackVisible } from "@/lib/pack-templates";
import type { ObjectStore } from "@/lib/store/objects";
import { installationAccessToken } from "@/lib/github/contents";
import { listRepoDirectory, readRepoText, searchRepoCode, type RepoBrowseError } from "@/lib/github/browse";
import { readGithubSecrets } from "@/lib/github/secrets";
import type { GithubSecrets } from "@/lib/github/app";
import { hqToolNeedsApproval } from "@/lib/hq-tool-names";
import { createInvite } from "@/lib/store/invites";
import type { OutboundMail } from "@/lib/session";

export type HqToolResult =
  | { ok: true; value: unknown }
  | { ok: false; error: "unauthorized" | "forbidden" | "missing" | "invalid" | "unknown" | GateReason }
  | { needsApproval: true; preview: string };

type MailGate = {
  origin: string;
  from: string;
  allowlist: readonly string[];
  send: (message: OutboundMail) => Promise<void>;
};

type ToolOptions = {
  wake?: (organizationId: string, reason: WakeReason) => Promise<void | boolean>;
  mail?: MailGate;
  swarm?: { origin: string; fetchImpl?: typeof fetch; wait?: (ms: number) => Promise<void>; store?: ObjectStore };
  imageRun?: (prompt: string) => Promise<{ image?: string }>;
  readSkill?: (skillPath: string) => Promise<string | null>;
  build?: BuildDeps;
  intake?: { queue?: ScanQueue | null; env?: WakeEnv; fetchImpl?: typeof fetch };
  github?: { fetchImpl?: typeof fetch; secrets?: GithubSecrets | null; now?: number };
};

const READS = new Set([
  "search_clients",
  "client_summary",
  "list_deals",
  "list_tasks",
  "list_deliverables",
  "open_questions",
  "recent_activity",
  "get_brief",
  "list_work_requests",
  "list_workflows",
  "list_projects",
  "list_swarm_packs",
  "list_space_files",
  "read_space_file",
  "read_deliverable",
  "list_repos",
  "list_repo_files",
  "read_repo_file",
  "search_repo",
]);

function text(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  return typeof value === "string" ? value.trim() : "";
}

function flag(input: Record<string, unknown>, key: string): boolean {
  const value = input[key];
  return value === true || value === 1 || value === "true" || value === "1";
}

/** Absent stays unset. A present value that is not a whole number is invalid. */
function optionalInteger(input: Record<string, unknown>, key: string): number | undefined | null {
  if (!(key in input) || input[key] == null || input[key] === "") return undefined;
  const value = input[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed)) return null;
  return parsed;
}

function optionalStrings(input: Record<string, unknown>, key: string): string[] | undefined | null {
  if (!(key in input) || input[key] == null || input[key] === "") return undefined;
  const value = input[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) return null;
  return value.map((item) => item.trim());
}

function fromCrm(result: { ok: boolean; value?: unknown; error?: string }): HqToolResult {
  if (result.ok) return { ok: true, value: result.value ?? null };
  if (result.error === "forbidden") return { ok: false, error: "forbidden" };
  if (result.error === "missing") return { ok: false, error: "missing" };
  return { ok: false, error: "invalid" };
}

async function stampChat(sql: Sql, userId: string, now: number): Promise<void> {
  await sql.run(
    `UPDATE activities
     SET data_json = json_set(COALESCE(data_json, '{}'), '$.via', 'hq_chat')
     WHERE actor_id = ? AND actor_kind = 'staff' AND created_at = ?`,
    [userId, now],
  );
}

async function seenOrg(sql: Sql, caller: Caller, organizationId: string) {
  if (!organizationId) return undefined;
  return organizationById(sql, caller, organizationId);
}

async function deletionLabel(sql: Sql, caller: Caller, tool: string, id: string): Promise<string | null> {
  if (tool === "delete_task") {
    const task = await sql.get<{ title: string; organization_id: string | null }>(
      "SELECT title, organization_id FROM tasks WHERE id = ?",
      [id],
    );
    if (!task?.organization_id || !(await seenOrg(sql, caller, task.organization_id))) return null;
    return task.title;
  }
  const project = await sql.get<{ name: string; organization_id: string }>(
    `SELECT p.name, p.organization_id
     FROM projects p
     JOIN organizations o ON o.id = p.organization_id
     WHERE p.id = ? AND o.archived_at IS NULL`,
    [id],
  );
  if (!project || !(await seenOrg(sql, caller, project.organization_id))) return null;
  return project.name;
}

async function listProjectCards(sql: Sql, organizationId: string): Promise<{ id: string; name: string; status: string }[]> {
  return sql.all(
    "SELECT id, name, status FROM projects WHERE organization_id = ? ORDER BY created_at, name",
    [organizationId],
  );
}

/** Timeline entry for a tool that writes outside the CRM helpers, so the staff member owns it. */
async function logStaff(
  sql: Sql,
  input: { organizationId: string; userId: string; kind: string; body: string; data?: Record<string, unknown> },
  now: number,
): Promise<void> {
  await sql.run(
    `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, ?, ?, 'staff', ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      input.organizationId,
      input.kind,
      input.userId,
      input.body,
      JSON.stringify({ ...input.data, via: "hq_chat" }),
      now,
    ],
  );
}

type Wake = (organizationId: string, reason: WakeReason) => Promise<void | boolean>;

/**
 * Saves a brief version with the new piece. When staff own brief approval, this approval card approves the
 * version and the agent re-plans now. Otherwise the client sees it on their brief page and approves there.
 */
async function saveAddendum(
  sql: Sql,
  input: {
    organizationId: string;
    organizationName: string;
    userId: string;
    kind: string;
    outcome: string;
    goal: string;
    due: string;
    projectId: string | null;
  },
  now: number,
  wake: Wake,
): Promise<HqToolResult> {
  const brief = await getBrief(sql, input.organizationId, "brief", input.projectId);
  const markdown = appendBriefWork(typeof brief?.body === "string" ? brief.body : "", input);
  const approval = await sql.get<{ brief_approval: string }>("SELECT brief_approval FROM organizations WHERE id = ?", [
    input.organizationId,
  ]);
  try {
    const saved = await saveStaffBrief(
      sql,
      {
        organizationId: input.organizationId,
        userId: input.userId,
        title: typeof brief?.title === "string" ? brief.title : `${input.organizationName} brief`,
        bodyMarkdown: markdown,
        projectId: input.projectId,
      },
      now,
    );
    if (approval?.brief_approval === "staff") {
      await sql.run("UPDATE deliverables SET status = 'approved', updated_at = ? WHERE id = ?", [now, saved.deliverableId]);
      await wake(input.organizationId, "brief_changed");
      return { ok: true, value: { ...saved, waitingFor: null } };
    }
    await sql.run(
      `UPDATE deliverables
       SET published_version = version, published_at = ?, status = 'in_review', updated_at = ?
       WHERE id = ?`,
      [now, now, saved.deliverableId],
    );
    return { ok: true, value: { ...saved, waitingFor: "client" } };
  } catch (error) {
    if (error instanceof AgentWorkError) return { ok: false, error: "invalid" };
    throw error;
  }
}

export async function runHqTool(
  sql: Sql,
  caller: Caller,
  request: { tool: string; input: Record<string, unknown>; idempotencyKey?: string; approved?: boolean },
  now: number,
  options: ToolOptions = {},
): Promise<HqToolResult> {
  if (!caller.staff || !caller.userId) return { ok: false, error: "forbidden" };
  const userId = caller.userId;
  const tool = request.tool;
  const input = request.input ?? {};
  if (!READS.has(tool) && !request.idempotencyKey?.trim()) return { ok: false, error: "invalid" };
  if (request.idempotencyKey) {
    const prior = await sql.get<{ result_json: string }>(
      "SELECT result_json FROM idempotency_keys WHERE actor_id = ? AND key = ?",
      [userId, request.idempotencyKey],
    );
    if (prior) return JSON.parse(prior.result_json) as HqToolResult;
  }
  if (hqToolNeedsApproval(tool) && request.approved !== true) {
    if (tool === "delete_task" || tool === "delete_project") {
      const targetId = tool === "delete_task" ? text(input, "taskId") : text(input, "projectId");
      if (!targetId) return { ok: false, error: "invalid" };
      const label = await deletionLabel(sql, caller, tool, targetId);
      if (!label) return { ok: false, error: "missing" };
      return { needsApproval: true, preview: `Approve ${tool} for ${label}.` };
    }
    const org = await seenOrg(sql, caller, text(input, "organizationId"));
    const label = org?.name || text(input, "organizationId") || text(input, "taskId") || text(input, "id") || "this record";
    return { needsApproval: true, preview: `Approve ${tool} for ${label}.` };
  }
  const wake =
    options.wake ??
    ((organizationId: string, reason: WakeReason) =>
      wakeOrganization(
        { AGENT_URL: process.env.AGENT_URL, AGENT_WAKE_SECRET: process.env.AGENT_WAKE_SECRET },
        organizationId,
        reason,
        now,
      ));
  const result = await perform(sql, caller, tool, input, now, { ...options, wake });
  if (request.idempotencyKey && "ok" in result && result.ok) {
    await sql.run(
      `INSERT INTO idempotency_keys (key, actor_id, tool, result_json, created_at) VALUES (?, ?, ?, ?, ?)`,
      [request.idempotencyKey, userId, tool, JSON.stringify(result), now],
    );
    await stampChat(sql, userId, now);
  }
  return result;
}

async function perform(
  sql: Sql,
  caller: Caller,
  tool: string,
  input: Record<string, unknown>,
  now: number,
  options: ToolOptions & { wake: Wake },
): Promise<HqToolResult> {
  const organizationId = text(input, "organizationId");
  if (tool === "search_clients") {
    const query = text(input, "query").toLowerCase();
    const rows = await listOrganizations(sql, caller);
    const matched = query ? rows.filter((row) => row.name.toLowerCase().includes(query)) : rows;
    return { ok: true, value: matched };
  }
  if (tool === "client_summary") {
    const org = await seenOrg(sql, caller, organizationId);
    if (!org) return { ok: false, error: "missing" };
    const deals = await listDeals(sql, caller, { organizationId });
    const projects = await listProjectCards(sql, organizationId);
    return { ok: true, value: { ...org, deals, projects } };
  }
  if (tool === "list_projects") {
    if (!(await seenOrg(sql, caller, organizationId))) return { ok: false, error: "missing" };
    return { ok: true, value: await listProjectCards(sql, organizationId) };
  }
  if (tool === "list_deals") {
    if (!(await seenOrg(sql, caller, organizationId))) return { ok: false, error: "missing" };
    const deals = await listDeals(sql, caller, { organizationId });
    return { ok: true, value: deals.map((deal) => ({ id: deal.id, title: deal.title, stage: deal.stage })) };
  }
  if (tool === "list_tasks") {
    if (!(await seenOrg(sql, caller, organizationId))) return { ok: false, error: "missing" };
    const rows = await sql.all<{
      id: string; title: string; status: string; stage: string; project_id: string | null;
      review_requested_at: number | null; review_note: string | null;
    }>(
      "SELECT id, title, status, stage, project_id, review_requested_at, review_note FROM tasks WHERE organization_id = ?",
      [organizationId],
    );
    return {
      ok: true,
      value: rows.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        stage: row.stage,
        column: boardColumnOf(row),
        review_note: row.review_note,
        project_id: row.project_id,
      })),
    };
  }
  if (tool === "list_deliverables") {
    if (!(await seenOrg(sql, caller, organizationId))) return { ok: false, error: "missing" };
    const rows = await sql.all(
      "SELECT id, title, kind, status, version FROM deliverables WHERE organization_id = ? AND status != 'archived'",
      [organizationId],
    );
    return { ok: true, value: rows };
  }
  if (tool === "open_questions") {
    if (!(await seenOrg(sql, caller, organizationId))) return { ok: false, error: "missing" };
    const rows = await sql.all(
      `SELECT id, question, task_id, asked_at FROM agent_questions
       WHERE organization_id = ? AND answered_at IS NULL`,
      [organizationId],
    );
    return { ok: true, value: rows };
  }
  if (tool === "recent_activity") {
    if (!(await seenOrg(sql, caller, organizationId))) return { ok: false, error: "missing" };
    return { ok: true, value: await listTimeline(sql, caller, organizationId, 20) };
  }
  if (tool === "get_brief") {
    if (!(await seenOrg(sql, caller, organizationId))) return { ok: false, error: "missing" };
    return { ok: true, value: await getBrief(sql, organizationId, "brief") };
  }
  if (tool === "read_deliverable") return readDeliverable(sql, caller, input);
  if (tool === "list_work_requests") {
    if (!(await seenOrg(sql, caller, organizationId))) return { ok: false, error: "missing" };
    return { ok: true, value: await listWorkRequests(sql, organizationId) };
  }
  if (tool === "create_client") {
    const created = await createOrganization(
      sql,
      caller,
      { name: text(input, "name"), website: text(input, "website") || undefined, kind: "client" },
      now,
    );
    if (created.ok) {
      const bound = scanIntakeBindings();
      await beginDirectClient({
        sql,
        organizationId: created.value.id,
        website: created.value.website ?? "",
        now,
        queue: options.intake?.queue ?? bound.queue,
        env: options.intake?.env ?? bound.env,
        fetchImpl: options.intake?.fetchImpl,
      });
    }
    return fromCrm(created);
  }
  if (tool === "add_contact") {
    return fromCrm(
      await createContact(
        sql,
        caller,
        { organizationId, name: text(input, "name"), email: text(input, "email") || undefined },
        now,
      ),
    );
  }
  if (tool === "add_note") {
    return fromCrm(
      await addNote(sql, caller, { organizationId, body: text(input, "body"), contactId: text(input, "contactId") || undefined }, now),
    );
  }
  if (tool === "log_call") return fromCrm(await logCall(sql, caller, { organizationId, body: text(input, "body") }, now));
  if (tool === "create_task") {
    return fromCrm(await createTask(sql, caller, { organizationId, title: text(input, "title") }, now));
  }
  if (tool === "file_actions") {
    if (!(await seenOrg(sql, caller, organizationId)) || !caller.userId) return { ok: false, error: "missing" };
    const actions = text(input, "title")
      .split("\n")
      .flatMap((line) => {
        const action = actionFromLine(line);
        return action ? [action] : [];
      });
    const brief = text(input, "body") || null;
    const rules = text(input, "rules") || null;
    if (actions.length === 0 && !brief && !rules) return { ok: false, error: "invalid" };
    const projectId = await projectForBrief(sql, organizationId, text(input, "projectId"));
    if (projectId === "missing") return { ok: false, error: "missing" };
    const filed = await applyChannelPlan(
      sql,
      {
        organizationId,
        projectId,
        actions,
        brief,
        rules,
        attribution: { actorKind: "staff", actorId: caller.userId, via: "hq_chat", createdBy: "staff" },
      },
      now,
    );
    await stampChat(sql, caller.userId, now);
    return { ok: true, value: filed };
  }
  if (tool === "complete_task") return fromCrm(await completeTask(sql, caller, { taskId: text(input, "taskId") }, now));
  if (tool === "delete_task") return fromCrm(await deleteTask(sql, caller, { taskId: text(input, "taskId") }, now));
  if (tool === "delete_project") return fromCrm(await deleteProject(sql, caller, { projectId: text(input, "projectId") }, now));
  if (tool === "move_deal") {
    return fromCrm(
      await moveDealStage(
        sql,
        caller,
        { dealId: text(input, "dealId"), stage: text(input, "stage"), lostReason: text(input, "lostReason") || undefined },
        now,
      ),
    );
  }
  if (tool === "set_deal_step") return setDealStep(sql, caller, input, now);
  if (tool === "draft_client_status") {
    return fromCrm(
      await postStatusUpdate(
        sql,
        caller,
        {
          projectId: text(input, "projectId"),
          body: text(input, "body"),
          health: "on_track",
          audience: "client",
        },
        now,
      ),
    );
  }
  if (tool === "create_project") {
    return createProjectTool(sql, caller, organizationId, text(input, "name"), text(input, "description"), now);
  }
  if (tool === "assign_space_project") {
    return fromCrm(
      await assignSpaceProject(
        sql,
        caller,
        { organizationId, workspaceId: text(input, "workspaceId"), projectId: text(input, "projectId") || null },
        now,
      ),
    );
  }
  if (tool === "assign_repo_project") {
    return fromCrm(
      await assignRepoProject(
        sql,
        caller,
        { organizationId, repoId: text(input, "repoId"), projectId: text(input, "projectId") || null },
        now,
      ),
    );
  }
  if (tool === "create_milestone") {
    return fromCrm(await createMilestone(sql, caller, { projectId: text(input, "projectId"), name: text(input, "name") }, now));
  }
  if (tool === "post_internal_status") {
    return fromCrm(
      await postStatusUpdate(
        sql,
        caller,
        { projectId: text(input, "projectId"), body: text(input, "body"), health: (text(input, "health") || "on_track") as StatusHealth, audience: "internal" },
        now,
      ),
    );
  }
  if (tool === "publish_deliverable") return fromCrm(await publishDeliverable(sql, caller, text(input, "deliverableId"), now));
  if (tool === "publish_client_status") {
    return fromCrm(
      await postStatusUpdate(
        sql,
        caller,
        {
          projectId: text(input, "projectId"),
          body: text(input, "body"),
          health: (text(input, "health") || "on_track") as StatusHealth,
          audience: "client",
          publish: true,
        },
        now,
      ),
    );
  }
  if (tool === "invite_person") return invitePerson(sql, caller, input, now, options.mail);
  if (tool === "merge_clients") {
    return fromCrm(await mergeOrganizations(sql, caller, { keepId: text(input, "keepId"), dropId: text(input, "dropId") }, now));
  }
  if (tool === "set_task_stage") return setTaskStage(sql, caller, input, now, options);
  if (tool === "review_task") return reviewTask(sql, caller, input, now, options);
  if (tool === "list_swarm_packs") return listSwarmPacks(options.swarm, text(input, "query"));
  if (tool === "add_work") return addWork(sql, caller, input, now, options.wake);
  if (tool === "revise_brief") return reviseBrief(sql, caller, input, now);
  if (tool === "instruct_task") return instructTask(sql, caller, input, now);
  if (tool === "answer_question") return answerQuestion(sql, caller, input, now, options);
  if (tool === "pause_client") return setPaused(sql, caller, organizationId, now, true);
  if (tool === "resume_client") return resumeClient(sql, caller, organizationId, now, options.wake);
  if (tool === "decide_work_request") return decideWork(sql, caller, input, now, options.wake);
  if (tool === "link_slack_channel") return linkSlack(sql, caller, input, now);
  if (tool === "list_workflows") return listWorkflows(sql, caller, input);
  if (tool === "list_space_files") return listSpaceFiles(sql, caller, input);
  if (tool === "read_space_file") return readSpaceFile(sql, caller, input, options);
  if (tool === "list_repos") return listClientRepos(sql, caller, input);
  if (tool === "list_repo_files") return listClientRepoFiles(sql, caller, input, now, options);
  if (tool === "read_repo_file") return readClientRepoFile(sql, caller, input, now, options);
  if (tool === "search_repo") return searchClientRepo(sql, caller, input, now, options);
  if (tool === "create_workflow_group") return makeWorkflowGroup(sql, caller, input, now);
  if (tool === "create_workflow") return makeWorkflow(sql, caller, input, now, options);
  if (tool === "assign_workflow") return assignWorkflow(sql, caller, input, now);
  if (tool === "start_pipeline") return beginPipeline(sql, caller, input, now, options);
  if (tool === "append_pipeline_stage") return appendStage(sql, caller, input, now);
  if (tool === "abandon_pipeline") return closePipeline(sql, caller, input, now);
  if (tool === "accept_workflow") return acceptStage(sql, caller, input, now, options);
  if (tool === "pipeline_status") return showPipeline(sql, caller, input);
  if (tool === "run_workflow") return runWorkflow(sql, caller, input, now, options);
  if (tool === "save_swarm_report") return saveSwarmReport(sql, caller, input, now, options);
  if (tool === "publish_swarm_report") return publishSwarmReport(sql, caller, input, now, options);
  if (tool === "queue_followup_swarms") return queueFollowupSwarms(sql, caller, input, now, options);
  return { ok: false, error: "unknown" };
}

type RepoChoice = { id: string; fullName: string; projectId: string | null; defaultBranch: string };

function repoChoice(repo: LinkedRepo): RepoChoice {
  return {
    id: repo.id,
    fullName: repo.full_name,
    projectId: repo.project_id,
    defaultBranch: repo.default_branch?.trim() || "main",
  };
}

async function clientRepos(
  sql: Sql,
  caller: Caller,
  input: Record<string, unknown>,
): Promise<{ ok: true; repos: LinkedRepo[] } | { ok: false; error: "missing" }> {
  const organizationId = text(input, "organizationId");
  if (!(await seenOrg(sql, caller, organizationId))) return { ok: false, error: "missing" };
  return { ok: true, repos: await listRepos(sql, caller, organizationId) };
}

function chooseRepo(
  repos: LinkedRepo[],
  input: Record<string, unknown>,
): LinkedRepo | { choices: RepoChoice[] } | null {
  const repoId = text(input, "repoId");
  const projectId = text(input, "projectId");
  const scoped = projectId ? repos.filter((repo) => repo.project_id === projectId) : repos;
  if (repoId) {
    const found = repos.find((repo) => repo.id === repoId);
    if (!found || (projectId && found.project_id !== projectId)) return null;
    return found;
  }
  if (scoped.length === 1) return scoped[0];
  return { choices: scoped.map(repoChoice) };
}

function fromBrowse(result: RepoBrowseError): HqToolResult {
  if (result.error === "unavailable") return { ok: true, value: { unavailable: true } };
  return { ok: false, error: result.error };
}

function githubSecretsFrom(options: ToolOptions): GithubSecrets | null {
  if (options.github && "secrets" in options.github) return options.github.secrets ?? null;
  return readGithubSecrets();
}

async function tokenForRepo(repo: LinkedRepo, now: number, options: ToolOptions): Promise<string | null> {
  if (repo.suspended_at || !repo.installation_id || !cleanRepoName(repo.full_name)) return null;
  const secrets = githubSecretsFrom(options);
  if (!secrets) return null;
  return installationAccessToken({
    appId: secrets.appId,
    privateKey: secrets.privateKey,
    installationId: repo.installation_id,
    fetch: options.github?.fetchImpl ?? fetch,
    now: options.github?.now ?? now,
  });
}

async function listClientRepos(sql: Sql, caller: Caller, input: Record<string, unknown>): Promise<HqToolResult> {
  const loaded = await clientRepos(sql, caller, input);
  if (!loaded.ok) return loaded;
  return { ok: true, value: loaded.repos.map(repoChoice) };
}

async function openAttachedRepo(
  sql: Sql,
  caller: Caller,
  input: Record<string, unknown>,
  now: number,
  options: ToolOptions,
): Promise<{ ok: true; repo: LinkedRepo; token: string; ref: string } | HqToolResult> {
  const loaded = await clientRepos(sql, caller, input);
  if (!loaded.ok) return loaded;
  const picked = chooseRepo(loaded.repos, input);
  if (!picked) return { ok: false, error: "missing" };
  if ("choices" in picked) return { ok: true, value: { repos: picked.choices } };
  const token = await tokenForRepo(picked, now, options);
  if (!token) return { ok: true, value: { unavailable: true } };
  return { ok: true, repo: picked, token, ref: picked.default_branch?.trim() || "main" };
}

async function listClientRepoFiles(
  sql: Sql,
  caller: Caller,
  input: Record<string, unknown>,
  now: number,
  options: ToolOptions,
): Promise<HqToolResult> {
  const opened = await openAttachedRepo(sql, caller, input, now, options);
  if (!("repo" in opened)) return opened;
  const listed = await listRepoDirectory({
    fullName: opened.repo.full_name,
    ref: opened.ref,
    path: text(input, "path"),
    token: opened.token,
    fetch: options.github?.fetchImpl ?? fetch,
  });
  if (!listed.ok) return fromBrowse(listed);
  return {
    ok: true,
    value: {
      repoId: opened.repo.id,
      fullName: opened.repo.full_name,
      ref: opened.ref,
      path: text(input, "path"),
      entries: listed.entries,
      truncated: listed.truncated,
    },
  };
}

async function readClientRepoFile(
  sql: Sql,
  caller: Caller,
  input: Record<string, unknown>,
  now: number,
  options: ToolOptions,
): Promise<HqToolResult> {
  const opened = await openAttachedRepo(sql, caller, input, now, options);
  if (!("repo" in opened)) return opened;
  const read = await readRepoText({
    fullName: opened.repo.full_name,
    ref: opened.ref,
    path: text(input, "path"),
    token: opened.token,
    fetch: options.github?.fetchImpl ?? fetch,
  });
  if (!read.ok) return fromBrowse(read);
  const { ok, ...file } = read;
  void ok;
  return { ok: true, value: { repoId: opened.repo.id, fullName: opened.repo.full_name, ...file } };
}

async function searchClientRepo(
  sql: Sql,
  caller: Caller,
  input: Record<string, unknown>,
  now: number,
  options: ToolOptions,
): Promise<HqToolResult> {
  const opened = await openAttachedRepo(sql, caller, input, now, options);
  if (!("repo" in opened)) return opened;
  const found = await searchRepoCode({
    fullName: opened.repo.full_name,
    query: text(input, "query"),
    token: opened.token,
    fetch: options.github?.fetchImpl ?? fetch,
  });
  if (!found.ok) return fromBrowse(found);
  return {
    ok: true,
    value: { repoId: opened.repo.id, fullName: opened.repo.full_name, hits: found.hits },
  };
}

const SPACE_FILE_LIST = 40;
const SPACE_FILE_TEXT = 20_000;
const SPACE_FILE_BYTES = 500_000;
const TEXT_EXTENSIONS = new Set(["md", "txt", "json", "csv"]);

async function listSpaceFiles(sql: Sql, caller: Caller, input: Record<string, unknown>): Promise<HqToolResult> {
  const organizationId = text(input, "organizationId");
  if (!(await seenOrg(sql, caller, organizationId))) return { ok: false, error: "missing" };
  const prefix = text(input, "path");
  const projectId = text(input, "projectId");
  const rows = await sql.all<{
    id: string;
    workspace_id: string;
    relative_path: string;
    tag: string | null;
    status: string;
    size_bytes: number;
  }>(
    `SELECT f.id, f.workspace_id, f.relative_path, f.tag, f.status, f.size_bytes
     FROM files f
     JOIN workspaces w ON w.id = f.workspace_id
     JOIN batches b ON b.id = f.batch_id
     WHERE w.organization_id = ?
       AND w.status = 'active'
       AND f.object_deleted_at IS NULL
       AND b.deleted_at IS NULL
       AND (? = '' OR w.project_id = ? OR w.project_id IS NULL)
       AND (? = '' OR substr(f.relative_path, 1, length(?)) = ?)
     ORDER BY CASE WHEN substr(f.relative_path, 1, 12) = 'agent/swarm/' THEN 0 ELSE 1 END,
              f.created_at DESC, f.id
     LIMIT ?`,
    [organizationId, projectId, projectId, prefix, prefix, prefix, SPACE_FILE_LIST],
  );
  return {
    ok: true,
    value: rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      path: row.relative_path,
      tag: row.tag,
      status: row.status,
      sizeBytes: row.size_bytes,
    })),
  };
}

async function readSpaceFile(
  sql: Sql,
  caller: Caller,
  input: Record<string, unknown>,
  options: ToolOptions,
): Promise<HqToolResult> {
  const fileId = text(input, "id");
  const path = text(input, "path");
  const organizationId = text(input, "organizationId");
  if (!fileId && !(path && organizationId)) return { ok: false, error: "invalid" };
  const row = fileId
    ? await sql.get<{
        id: string;
        relative_path: string;
        extension: string;
        size_bytes: number;
        object_key: string;
        organization_id: string;
      }>(
        `SELECT f.id, f.relative_path, f.extension, f.size_bytes, f.object_key, w.organization_id
         FROM files f
         JOIN workspaces w ON w.id = f.workspace_id
         JOIN batches b ON b.id = f.batch_id
         WHERE f.id = ? AND f.object_deleted_at IS NULL AND b.deleted_at IS NULL AND w.status = 'active'`,
        [fileId],
      )
    : await sql.get<{
        id: string;
        relative_path: string;
        extension: string;
        size_bytes: number;
        object_key: string;
        organization_id: string;
      }>(
        `SELECT f.id, f.relative_path, f.extension, f.size_bytes, f.object_key, w.organization_id
         FROM files f
         JOIN workspaces w ON w.id = f.workspace_id
         JOIN batches b ON b.id = f.batch_id
         WHERE w.organization_id = ? AND f.relative_path = ?
           AND f.object_deleted_at IS NULL AND b.deleted_at IS NULL AND w.status = 'active'
         ORDER BY f.created_at DESC, f.id
         LIMIT 1`,
        [organizationId, path],
      );
  if (!row || (organizationId && row.organization_id !== organizationId) || !(await seenOrg(sql, caller, row.organization_id))) {
    return { ok: false, error: "missing" };
  }
  if (!TEXT_EXTENSIONS.has(row.extension)) {
    return { ok: true, value: { id: row.id, path: row.relative_path, binary: true, sizeBytes: row.size_bytes } };
  }
  if (row.size_bytes > SPACE_FILE_BYTES) {
    return { ok: true, value: { id: row.id, path: row.relative_path, tooLarge: true, sizeBytes: row.size_bytes } };
  }
  const store = options.swarm?.store;
  if (!store) return { ok: false, error: "invalid" };
  const bytes = await store.read(row.object_key);
  if (!bytes) return { ok: false, error: "missing" };
  const decoded = new TextDecoder().decode(bytes);
  const truncated = decoded.length > SPACE_FILE_TEXT;
  return {
    ok: true,
    value: {
      id: row.id,
      path: row.relative_path,
      body: truncated ? decoded.slice(0, SPACE_FILE_TEXT) : decoded,
      truncated,
    },
  };
}

const FOLLOWUP_LIMIT = 6;

function followupLines(value: string): { name: string; templateId: string }[] {
  const rows: { name: string; templateId: string }[] = [];
  for (const line of value.split("\n")) {
    const parts = line.split("|").map((part) => part.trim());
    const name = parts[0]?.slice(0, 120) ?? "";
    const templateId = parts[1]?.slice(0, 120) ?? "";
    if (!name || !templateId) continue;
    rows.push({ name, templateId });
    if (rows.length >= FOLLOWUP_LIMIT) break;
  }
  return rows;
}

async function readDeliverable(sql: Sql, caller: Caller, input: Record<string, unknown>): Promise<HqToolResult> {
  const id = text(input, "id");
  if (!id) return { ok: false, error: "invalid" };
  const row = await sql.get<{
    id: string;
    organization_id: string;
    title: string;
    kind: string;
    status: string;
    version: number;
  }>("SELECT id, organization_id, title, kind, status, version FROM deliverables WHERE id = ? AND status != 'archived'", [
    id,
  ]);
  const organizationId = text(input, "organizationId");
  if (!row || (organizationId && row.organization_id !== organizationId) || !(await seenOrg(sql, caller, row.organization_id))) {
    return { ok: false, error: "missing" };
  }
  const items = await sql.all<{ copy_text: string | null }>(
    "SELECT copy_text FROM deliverable_items WHERE deliverable_id = ? AND version = ? ORDER BY sort, title",
    [row.id, row.version],
  );
  const body = items
    .map((item) => item.copy_text?.trim() ?? "")
    .filter((item) => item.length > 0)
    .join("\n\n");
  const truncated = body.length > SPACE_FILE_TEXT;
  return {
    ok: true,
    value: {
      id: row.id,
      title: row.title,
      kind: row.kind,
      status: row.status,
      version: row.version,
      body: truncated ? body.slice(0, SPACE_FILE_TEXT) : body,
      truncated,
    },
  };
}

async function publishSwarmReport(
  sql: Sql,
  caller: Caller,
  input: Record<string, unknown>,
  now: number,
  options: ToolOptions,
): Promise<HqToolResult> {
  if (!caller.userId) return { ok: false, error: "missing" };
  const workflow = await sql.get<{
    id: string;
    name: string;
    organization_id: string;
    project_id: string | null;
    last_execution_id: string | null;
    last_output: string | null;
  }>("SELECT id, name, organization_id, project_id, last_execution_id, last_output FROM client_workflows WHERE id = ?", [
    text(input, "id"),
  ]);
  if (!workflow?.last_execution_id || !(await seenOrg(sql, caller, workflow.organization_id))) return { ok: false, error: "missing" };
  const relativePath = workflowSpacePath({ workflow: "swarm", run: workflow.last_execution_id, node: "report" }, "pdf");
  if (!relativePath) return { ok: false, error: "invalid" };
  const loadFile = async () =>
    sql.get<{ id: string; object_key: string; size_bytes: number; workspace_id: string }>(
      `SELECT f.id, f.object_key, f.size_bytes, f.workspace_id
       FROM files f
       JOIN workspaces w ON w.id = f.workspace_id
       JOIN batches b ON b.id = f.batch_id
       WHERE w.organization_id = ? AND f.relative_path = ?
         AND f.object_deleted_at IS NULL AND b.deleted_at IS NULL
       ORDER BY f.created_at DESC
       LIMIT 1`,
      [workflow.organization_id, relativePath],
    );
  let file = await loadFile();
  const origin = options.swarm?.origin?.trim() || process.env.SWARM_ORIGIN?.trim() || "";
  const store = options.swarm?.store;
  if (!file && origin.startsWith("https://") && store) {
    await storeSwarmReport({
      sql,
      store,
      origin,
      organizationId: workflow.organization_id,
      projectId: workflow.project_id,
      executionId: workflow.last_execution_id,
      now,
      fetchImpl: options.swarm?.fetchImpl,
    });
    file = await loadFile();
  }
  if (!file?.object_key) return { ok: false, error: "missing" };
  const existing = await sql.get<{ id: string; status: string }>(
    `SELECT d.id, d.status
     FROM deliverables d
     JOIN deliverable_items i ON i.deliverable_id = d.id AND i.version = d.version
     WHERE d.organization_id = ? AND d.status != 'archived' AND i.title = 'report.pdf'
       AND (? IS NULL OR d.project_id = ?)
     ORDER BY d.updated_at DESC
     LIMIT 1`,
    [workflow.organization_id, workflow.project_id, workflow.project_id],
  );
  if (existing) {
    if (existing.status === "draft") {
      await sql.run(
        "UPDATE deliverables SET published_version = version, published_at = ?, status = 'in_review', updated_at = ? WHERE id = ?",
        [now, now, existing.id],
      );
    }
    return {
      ok: true,
      value: { id: existing.id, status: existing.status === "draft" ? "in_review" : existing.status, path: relativePath },
    };
  }
  const deliverableId = crypto.randomUUID();
  const title = `${workflow.name} report`.slice(0, 200);
  const copy = workflow.last_output?.trim().slice(0, 4_000) || "Swarm report.";
  const media = itemForPath(relativePath, file.object_key);
  let mediaJson = media.mediaJson;
  try {
    const parsed = JSON.parse(mediaJson) as { size?: number }[];
    if (Array.isArray(parsed) && parsed[0]) parsed[0].size = file.size_bytes;
    mediaJson = JSON.stringify(parsed);
  } catch {
    mediaJson = media.mediaJson;
  }
  await sql.exec("BEGIN");
  try {
    await sql.run(
      `INSERT INTO deliverables (
        id, organization_id, project_id, workspace_id, title, kind, status, version,
        source_repo_id, source_ref, published_at, actor_kind, actor_id, created_at, updated_at, published_version
      ) VALUES (?, ?, ?, ?, ?, 'document', 'in_review', 1, NULL, NULL, ?, 'staff', ?, ?, ?, 1)`,
      [deliverableId, workflow.organization_id, workflow.project_id, file.workspace_id, title, now, caller.userId, now, now],
    );
    await sql.run(
      `INSERT INTO deliverable_items (
        id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
      ) VALUES (?, ?, 1, NULL, 'file', NULL, 'report.pdf', ?, ?, NULL, 'pending', 0)`,
      [crypto.randomUUID(), deliverableId, copy, mediaJson],
    );
    await sql.run(
      `INSERT INTO activities (
        id, organization_id, project_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at
      ) VALUES (?, ?, ?, ?, 'deliverable_published', 'staff', ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        workflow.organization_id,
        workflow.project_id,
        file.workspace_id,
        caller.userId,
        title,
        JSON.stringify({ deliverableId, path: relativePath, via: "hq_chat" }),
        now,
      ],
    );
    await sql.exec("COMMIT");
  } catch (error) {
    await sql.exec("ROLLBACK");
    throw error;
  }
  return { ok: true, value: { id: deliverableId, status: "in_review", path: relativePath } };
}

async function saveSwarmReport(
  sql: Sql,
  caller: Caller,
  input: Record<string, unknown>,
  now: number,
  options: ToolOptions,
): Promise<HqToolResult> {
  const row = await sql.get<{
    organization_id: string;
    project_id: string | null;
    last_execution_id: string | null;
  }>("SELECT organization_id, project_id, last_execution_id FROM client_workflows WHERE id = ?", [text(input, "id")]);
  if (!row?.last_execution_id || !(await seenOrg(sql, caller, row.organization_id))) return { ok: false, error: "missing" };
  const origin = options.swarm?.origin?.trim() || process.env.SWARM_ORIGIN?.trim() || "";
  const store = options.swarm?.store;
  if (!origin.startsWith("https://") || !store) return { ok: false, error: "invalid" };
  const path = await storeSwarmReport({
    sql,
    store,
    origin,
    organizationId: row.organization_id,
    projectId: row.project_id,
    executionId: row.last_execution_id,
    now,
    fetchImpl: options.swarm?.fetchImpl,
  });
  if (!path) return { ok: false, error: "missing" };
  return { ok: true, value: { path, executionId: row.last_execution_id } };
}

async function beginPipeline(
  sql: Sql,
  caller: Caller,
  input: Record<string, unknown>,
  now: number,
  options: ToolOptions,
): Promise<HqToolResult> {
  const organizationId = text(input, "organizationId");
  if (!(await seenOrg(sql, caller, organizationId)) || !caller.userId) return { ok: false, error: "missing" };
  const paths = (text(input, "paths") || text(input, "title")).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const started = await startPipeline(sql, {
    organizationId,
    projectId: text(input, "projectId"),
    label: text(input, "name") || "pipeline",
    paths,
    startedBy: caller.userId,
    now,
    origin: options.swarm?.origin?.trim() || process.env.SWARM_ORIGIN?.trim() || "",
    instruction: text(input, "body"),
    fetchImpl: options.swarm?.fetchImpl,
    wait: options.swarm?.wait,
    store: options.swarm?.store,
    readSkill: options.readSkill,
    auto: flag(input, "auto"),
    imageRun: options.imageRun,
  });
  if (!started.ok) {
    if (started.error === "open") {
      return {
        ok: true,
        value: { refused: "A pipeline is still open. Accept the last page or call abandon_pipeline." },
      };
    }
    if (started.error === "unknown_skill") return unknownSkills(started.unknown);
    return { ok: false, error: started.error };
  }
  await logStaff(
    sql,
    {
      organizationId,
      userId: caller.userId,
      kind: "pipeline.started",
      body: started.stages[0]?.name || groupName(input),
      data: { groupId: started.groupId, stage: started.stages[0]?.name || groupName(input) },
    },
    now,
  );
  return {
    ok: true,
    value: {
      groupId: started.groupId,
      stages: started.stages,
      executionId: started.executionId,
      status: started.status,
      output: started.output,
      auto: started.auto,
      ...(started.waitingOn ? { waitingOn: started.waitingOn } : {}),
      ...(started.paused ? { paused: started.paused } : {}),
    },
  };
}

function unknownSkills(unknown: string[]): HqToolResult {
  return {
    ok: true,
    value: {
      refused: `Nothing was created. These are not skill paths: ${unknown.join(", ") || "(empty)"}. Pass the full .cursor/skills/.../SKILL.md path from list_swarm_packs or search_skills.`,
      unknown,
    },
  };
}

function groupName(input: Record<string, unknown>): string {
  return text(input, "name") || "pipeline";
}

async function appendStage(sql: Sql, caller: Caller, input: Record<string, unknown>, now: number): Promise<HqToolResult> {
  const organizationId = text(input, "organizationId");
  if (!(await seenOrg(sql, caller, organizationId))) return { ok: false, error: "missing" };
  const skillPath = (text(input, "paths") || text(input, "title") || text(input, "templateId")).split("\n")[0]?.trim() ?? "";
  const added = await appendPipelineStage(sql, {
    organizationId,
    groupId: text(input, "groupId") || text(input, "id"),
    skillPath,
    now,
  });
  if (!added.ok) return added.error === "unknown_skill" ? unknownSkills(added.unknown) : { ok: false, error: added.error };
  const stage = skillPath.split("/").at(-2) || skillPath;
  await logStaff(
    sql,
    {
      organizationId,
      userId: caller.userId!,
      kind: "pipeline.stage_added",
      body: stage,
      data: { groupId: text(input, "groupId") || text(input, "id"), stage },
    },
    now,
  );
  return { ok: true, value: added };
}

async function closePipeline(sql: Sql, caller: Caller, input: Record<string, unknown>, now: number): Promise<HqToolResult> {
  const organizationId = text(input, "organizationId");
  if (!(await seenOrg(sql, caller, organizationId))) return { ok: false, error: "missing" };
  const closed = await abandonPipeline(sql, { organizationId, groupId: text(input, "groupId") || text(input, "id"), now });
  if (!closed.ok) return { ok: false, error: closed.error };
  const groupId = text(input, "groupId") || text(input, "id");
  const stage = await sql.get<{ name: string }>(
    "SELECT name FROM client_workflows WHERE group_id = ? ORDER BY stage_order DESC LIMIT 1",
    [groupId],
  );
  await logStaff(
    sql,
    {
      organizationId,
      userId: caller.userId!,
      kind: "pipeline.abandoned",
      body: stage?.name || "pipeline",
      data: { groupId, stage: stage?.name || "pipeline" },
    },
    now,
  );
  return { ok: true, value: { groupId, status: "closed" } };
}

async function acceptStage(
  sql: Sql,
  caller: Caller,
  input: Record<string, unknown>,
  now: number,
  options: ToolOptions,
): Promise<HqToolResult> {
  const row = await sql.get<{ organization_id: string }>("SELECT organization_id FROM client_workflows WHERE id = ?", [
    text(input, "id"),
  ]);
  if (!row || !(await seenOrg(sql, caller, row.organization_id))) return { ok: false, error: "missing" };
  const accepted = await acceptWorkflow(sql, {
    organizationId: row.organization_id,
    workflowId: text(input, "id"),
    now,
    store: options.swarm?.store,
    run: options.imageRun,
  });
  if (!accepted.ok) return { ok: false, error: accepted.error };
  const stage = await sql.get<{ name: string; group_id: string }>(
    "SELECT name, group_id FROM client_workflows WHERE id = ?",
    [text(input, "id")],
  );
  if (stage && caller.userId) {
    await logStaff(
      sql,
      {
        organizationId: row.organization_id,
        userId: caller.userId,
        kind: "pipeline.stage_accepted",
        body: stage.name,
        data: { groupId: stage.group_id, stage: stage.name },
      },
      now,
    );
  }
  return { ok: true, value: accepted };
}

async function showPipeline(sql: Sql, caller: Caller, input: Record<string, unknown>): Promise<HqToolResult> {
  const organizationId = text(input, "organizationId");
  if (!(await seenOrg(sql, caller, organizationId))) return { ok: false, error: "missing" };
  const stages = await pipelineStatus(sql, organizationId, text(input, "groupId") || text(input, "id"));
  if (stages.length === 0) return { ok: false, error: "missing" };
  return { ok: true, value: clipPipelineView(stages) };
}

async function queueFollowupSwarms(
  sql: Sql,
  caller: Caller,
  input: Record<string, unknown>,
  now: number,
  options: ToolOptions,
): Promise<HqToolResult> {
  const organizationId = text(input, "organizationId");
  if (!(await seenOrg(sql, caller, organizationId)) || !caller.userId) return { ok: false, error: "missing" };
  const source = await sql.get<{
    id: string;
    organization_id: string;
    project_id: string | null;
    name: string;
    last_status: string | null;
    last_output: string | null;
  }>("SELECT id, organization_id, project_id, name, last_status, last_output FROM client_workflows WHERE id = ?", [
    text(input, "id"),
  ]);
  if (!source || source.organization_id !== organizationId) return { ok: false, error: "missing" };
  const output = source.last_output?.trim() ?? "";
  if (source.last_status !== "completed" || output.length === 0 || output.includes("still going")) return { ok: false, error: "invalid" };
  const lines = followupLines(text(input, "title"));
  if (lines.length === 0) return { ok: false, error: "invalid" };
  const requested = await projectForBrief(sql, organizationId, text(input, "projectId") || source.project_id || "");
  if (requested === "missing") return { ok: false, error: "missing" };
  const groupName = (text(input, "name") || `After ${source.name}`).slice(0, 200);
  const created = await createWorkflowGroup(sql, {
    organizationId,
    name: groupName,
    projectId: requested,
    now,
  });
  if (!created.ok) return { ok: false, error: created.error };
  const workflowIds: string[] = [];
  const taskIds: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const plan = await workflowPlan(line.templateId, options);
    const workflow = await createClientWorkflow(sql, {
      organizationId,
      groupId: created.group.id,
      name: line.name,
      templateId: line.templateId,
      projectId: requested,
      plan,
      dueAt: index === 0 ? now : null,
      now: now + index,
    });
    if (!workflow.ok) return { ok: false, error: workflow.error };
    workflowIds.push(workflow.workflow.id);
    if (workflow.workflow.taskId) taskIds.push(workflow.workflow.taskId);
  }
  await logStaff(
    sql,
    {
      organizationId,
      userId: caller.userId,
      kind: "staff.workflow_group",
      body: groupName,
      data: { groupId: created.group.id, projectId: requested, sourceWorkflowId: source.id },
    },
    now,
  );
  return {
    ok: true,
    value: {
      groupId: created.group.id,
      workflowIds,
      taskIds,
      executionId: "",
      status: "queued",
    },
  };
}

async function listWorkflows(sql: Sql, caller: Caller, input: Record<string, unknown>): Promise<HqToolResult> {
  const organizationId = text(input, "organizationId");
  if (!(await seenOrg(sql, caller, organizationId))) return { ok: false, error: "missing" };
  return { ok: true, value: await listClientWorkflows(sql, organizationId, text(input, "projectId") || null) };
}

async function makeWorkflowGroup(sql: Sql, caller: Caller, input: Record<string, unknown>, now: number): Promise<HqToolResult> {
  const organizationId = text(input, "organizationId");
  if (!(await seenOrg(sql, caller, organizationId)) || !caller.userId) return { ok: false, error: "missing" };
  const created = await createWorkflowGroup(sql, {
    organizationId,
    name: text(input, "name"),
    projectId: text(input, "projectId") || null,
    now,
  });
  if (!created.ok) return { ok: false, error: created.error };
  await logStaff(
    sql,
    { organizationId, userId: caller.userId, kind: "staff.workflow_group", body: created.group.name, data: { groupId: created.group.id, projectId: created.group.projectId } },
    now,
  );
  return { ok: true, value: created.group };
}

async function workflowPlan(templateId: string, options: ToolOptions): Promise<WorkflowTaskPlan | null> {
  const origin = options.swarm?.origin || process.env.SWARM_ORIGIN || "";
  if (!origin || !templateId) return null;
  const load = options.swarm?.fetchImpl ?? fetch;
  try {
    const response = await load(`${origin.replace(/\/$/, "")}/api/template?id=${encodeURIComponent(templateId)}`);
    if (!response.ok) return null;
    return workflowTaskPlan(await response.json());
  } catch {
    return null;
  }
}

async function makeWorkflow(
  sql: Sql,
  caller: Caller,
  input: Record<string, unknown>,
  now: number,
  options: ToolOptions,
): Promise<HqToolResult> {
  const organizationId = text(input, "organizationId");
  if (!(await seenOrg(sql, caller, organizationId)) || !caller.userId) return { ok: false, error: "missing" };
  const requestedTemplate = text(input, "templateId");
  const templateId =
    requestedTemplate.includes("SKILL.md") || requestedTemplate.includes(".cursor/skills/")
      ? packTemplateId(requestedTemplate) ?? ""
      : requestedTemplate;
  const dueAt = optionalInteger(input, "dueAt");
  const everyMs = optionalInteger(input, "everyMs");
  const mcpServerIds = optionalStrings(input, "mcpServerIds");
  if (dueAt === null || everyMs === null || mcpServerIds === null) return { ok: false, error: "invalid" };
  const created = await createClientWorkflow(sql, {
    organizationId,
    groupId: text(input, "groupId"),
    name: text(input, "name"),
    templateId,
    projectId: text(input, "projectId") || null,
    plan: await workflowPlan(templateId, options),
    dueAt,
    everyMs,
    mcpServerIds,
    now,
  });
  if (!created.ok) return { ok: false, error: created.error };
  await logStaff(
    sql,
    {
      organizationId,
      userId: caller.userId,
      kind: "staff.workflow",
      body: text(input, "name"),
      data: { workflowId: created.workflow.id, projectId: created.workflow.projectId, templateId: text(input, "templateId") },
    },
    now,
  );
  return { ok: true, value: created.workflow };
}

async function assignWorkflow(sql: Sql, caller: Caller, input: Record<string, unknown>, now: number): Promise<HqToolResult> {
  const workflowId = text(input, "id");
  const projectId = text(input, "projectId");
  const row = await sql.get<{ organization_id: string; name: string }>(
    "SELECT organization_id, name FROM client_workflows WHERE id = ?",
    [workflowId],
  );
  if (!row || !(await seenOrg(sql, caller, row.organization_id)) || !caller.userId) return { ok: false, error: "missing" };
  const assigned = await assignClientWorkflow(sql, { workflowId, projectId, now });
  if (!assigned.ok) return { ok: false, error: "missing" };
  await logStaff(
    sql,
    { organizationId: row.organization_id, userId: caller.userId, kind: "staff.workflow_assigned", body: row.name, data: { workflowId, projectId } },
    now,
  );
  return { ok: true, value: assigned };
}

async function projectHome(sql: Sql, organizationId: string, projectId: string) {
  const [spaces, repos, looseSpaces, looseRepos] = await Promise.all([
    sql.all<{ id: string; name: string }>(
      "SELECT id, display_name AS name FROM workspaces WHERE project_id = ? AND status != 'purged' ORDER BY display_name",
      [projectId],
    ),
    sql.all<{ id: string; name: string }>(
      "SELECT id, full_name AS name FROM repos WHERE project_id = ? AND archived_at IS NULL ORDER BY full_name",
      [projectId],
    ),
    sql.all<{ id: string; name: string }>(
      `SELECT id, display_name AS name FROM workspaces
       WHERE organization_id = ? AND project_id IS NULL AND status != 'purged' ORDER BY display_name`,
      [organizationId],
    ),
    sql.all<{ id: string; name: string }>(
      `SELECT id, full_name AS name FROM repos
       WHERE organization_id = ? AND project_id IS NULL AND archived_at IS NULL ORDER BY full_name`,
      [organizationId],
    ),
  ]);
  return { spaces, repos, looseSpaces, looseRepos };
}

async function createProjectTool(
  sql: Sql,
  caller: Caller,
  organizationId: string,
  name: string,
  description: string,
  now: number,
): Promise<HqToolResult> {
  const created = await createProject(sql, caller, { organizationId, name }, now);
  if (!created.ok) return fromCrm(created);
  const note = description.trim().slice(0, 4_000);
  let projectDescription = created.value.description;
  if (note && !projectDescription?.trim() && caller.userId) {
    try {
      await saveStaffBrief(
        sql,
        { organizationId, userId: caller.userId, title: name.slice(0, 200), bodyMarkdown: note, projectId: created.value.id },
        now,
      );
      projectDescription = note;
    } catch (error) {
      if (!(error instanceof AgentWorkError)) throw error;
      const saved = await saveProjectDescription(sql, caller, { projectId: created.value.id, description: note }, now);
      if (saved.ok) projectDescription = note;
    }
  }
  return {
    ok: true,
    value: { ...created.value, description: projectDescription, ...(await projectHome(sql, organizationId, created.value.id)) },
  };
}

function swarmLaunch(options: ToolOptions): ToolOptions["swarm"] | undefined {
  const origin = options.swarm?.origin?.trim() || process.env.SWARM_ORIGIN?.trim() || "";
  if (!origin.startsWith("https://")) return undefined;
  return {
    origin,
    fetchImpl: options.swarm?.fetchImpl,
    wait: options.swarm?.wait,
    store: options.swarm?.store,
  };
}

async function runWorkflow(
  sql: Sql,
  caller: Caller,
  input: Record<string, unknown>,
  now: number,
  options: ToolOptions & { wake: Wake },
): Promise<HqToolResult> {
  const workflowId = text(input, "id");
  const row = await sql.get<{ organization_id: string; name: string; template_id: string; task_id: string | null }>(
    "SELECT organization_id, name, template_id, task_id FROM client_workflows WHERE id = ?",
    [workflowId],
  );
  if (!row || !(await seenOrg(sql, caller, row.organization_id)) || !caller.userId) return { ok: false, error: "missing" };
  if (row.task_id) {
    const moved = await moveTaskStage(sql, {
      taskId: row.task_id,
      to: "run",
      now,
      actor: { kind: "staff", id: caller.userId },
      wake: options.wake,
      swarm: swarmLaunch(options),
      instruction: text(input, "body"),
      readSkill: options.readSkill,
    });
    if (!moved.ok) return { ok: false, error: moved.error };
    return {
      ok: true,
      value: {
        workflowId,
        taskId: row.task_id,
        stage: "run",
        ...(moved.swarmStatus === "queued"
          ? { status: "queued", waitingOn: moved.waitingOn }
          : moved.executionId
            ? {
                executionId: moved.executionId,
                status: moved.swarmStatus,
                output: moved.output,
                startedWorkflowId: moved.startedWorkflowId,
              }
            : {}),
      },
    };
  }
  const swarm = options.swarm;
  const origin = swarm?.origin?.trim() || process.env.SWARM_ORIGIN?.trim() || "";
  const started = await claimDueWorkflow({
    sql,
    organizationId: row.organization_id,
    origin,
    now,
    workflowId,
    instruction: text(input, "body"),
    trigger: "chat",
    fetchImpl: swarm?.fetchImpl,
    wait: swarm?.wait,
    store: swarm?.store,
    readSkill: options.readSkill,
    imageRun: options.imageRun,
  });
  if (!started.ok) return { ok: false, error: started.error };
  if (started.none) return { ok: false, error: "missing" };
  if (started.status === "running" || started.status === "queued" || started.more) {
    await options.wake(row.organization_id, "due");
  }
  await logStaff(
    sql,
    {
      organizationId: row.organization_id,
      userId: caller.userId,
      kind: "staff.workflow_run",
      body: started.output.slice(0, 500) || row.name,
      data: { workflowId: started.workflowId, executionId: started.executionId, status: started.status },
    },
    now,
  );
  return {
    ok: true,
    value: {
      workflowId: started.workflowId,
      executionId: started.executionId,
      status: started.status,
      output: started.output,
      ...(started.waitingOn ? { waitingOn: started.waitingOn } : {}),
    },
  };
}

async function setDealStep(sql: Sql, caller: Caller, input: Record<string, unknown>, now: number): Promise<HqToolResult> {
  const deal = await sql.get<{ id: string; organization_id: string }>(
    "SELECT id, organization_id FROM deals WHERE id = ?",
    [text(input, "dealId")],
  );
  if (!deal || !(await seenOrg(sql, caller, deal.organization_id)) || !caller.userId) return { ok: false, error: "missing" };
  const step = text(input, "body");
  if (!step) return { ok: false, error: "invalid" };
  const dueText = text(input, "due");
  const nextStepAt = dueText ? dueMillis(dueText, now) : null;
  if (dueText && nextStepAt === null) return { ok: false, error: "invalid" };
  await sql.run("UPDATE deals SET next_step = ?, next_step_at = ?, updated_at = ? WHERE id = ?", [
    step,
    nextStepAt,
    now,
    deal.id,
  ]);
  await logStaff(
    sql,
    { organizationId: deal.organization_id, userId: caller.userId, kind: "staff.deal_step", body: step, data: { dealId: deal.id } },
    now,
  );
  return { ok: true, value: { id: deal.id, nextStep: step, nextStepAt } };
}

async function listSwarmPacks(swarm: ToolOptions["swarm"], query = ""): Promise<HqToolResult> {
  const origin = swarm?.origin?.trim() || process.env.SWARM_ORIGIN?.trim() || "";
  if (!origin.startsWith("https://")) return { ok: false, error: "invalid" };
  const load = swarm?.fetchImpl ?? fetch;
  const response = await load(`${origin.replace(/\/$/, "")}/api/templates`);
  if (!response.ok) return { ok: false, error: "invalid" };
  const packs = packsFromTemplates(await response.json())
    .filter((pack) => swarmPackVisible(pack, query))
    .map((pack) => ({
      id: pack.id,
      name: pack.name,
      description: pack.description,
    }));
  return { ok: true, value: packs };
}

async function setTaskStage(
  sql: Sql,
  caller: Caller,
  input: Record<string, unknown>,
  now: number,
  options: ToolOptions & { wake: Wake },
): Promise<HqToolResult> {
  const stage = text(input, "stage");
  if (stage !== "describe" && stage !== "engineer" && stage !== "build" && stage !== "run" && stage !== "review") {
    return { ok: false, error: "invalid" };
  }
  const task = await sql.get<{ id: string; organization_id: string | null }>(
    "SELECT id, organization_id FROM tasks WHERE id = ?",
    [text(input, "taskId")],
  );
  if (!task?.organization_id || !(await seenOrg(sql, caller, task.organization_id)) || !caller.userId) {
    return { ok: false, error: "missing" };
  }
  const moved = await moveTaskStage(sql, {
    taskId: task.id,
    to: stage,
    note: stage === "review" ? text(input, "note") || undefined : undefined,
    now,
    actor: { kind: "staff", id: caller.userId },
    build: options.build ?? defaultBuildDeps(now),
    wake: options.wake,
    swarm: stage === "run" ? swarmLaunch(options) : undefined,
    readSkill: options.readSkill,
  });
  if (!moved.ok) return { ok: false, error: moved.error };
  if (moved.waiting) return { ok: true, value: { taskId: task.id, stage: "build", waiting: "cap_reached" } };
  if (moved.runId) return { ok: true, value: { taskId: task.id, stage: "build", runId: moved.runId } };
  if (stage === "run") {
    return {
      ok: true,
      value: {
        taskId: task.id,
        stage,
        workflowId: moved.workflowId ?? null,
        ...(moved.executionId ? { executionId: moved.executionId, status: moved.swarmStatus, output: moved.output } : {}),
      },
    };
  }
  return { ok: true, value: { taskId: task.id, stage } };
}

async function reviewTask(
  sql: Sql,
  caller: Caller,
  input: Record<string, unknown>,
  now: number,
  options: ToolOptions & { wake: Wake },
): Promise<HqToolResult> {
  const decision = text(input, "decision");
  if (decision !== "approve" && decision !== "progress" && decision !== "build") return { ok: false, error: "invalid" };
  const task = await sql.get<{ id: string; organization_id: string | null }>(
    "SELECT id, organization_id FROM tasks WHERE id = ?",
    [text(input, "taskId")],
  );
  if (!task?.organization_id || !(await seenOrg(sql, caller, task.organization_id)) || !caller.userId) {
    return { ok: false, error: "missing" };
  }
  const decided = await decideReview(sql, {
    taskId: task.id,
    decision,
    note: text(input, "note") || undefined,
    now,
    actor: { kind: "staff", id: caller.userId },
    build: options.build ?? defaultBuildDeps(now),
    wake: options.wake,
    readSkill: options.readSkill,
  });
  // not_in_review and note_required come back as invalid: the description says a send back needs a note.
  if (!decided.ok) {
    return { ok: false, error: decided.error === "not_in_review" || decided.error === "note_required" ? "invalid" : decided.error };
  }
  return {
    ok: true,
    value: {
      taskId: task.id,
      column: decided.column,
      stage: decided.stage,
      status: decided.status,
      ...(decided.runId ? { runId: decided.runId } : {}),
      ...(decided.waiting ? { waiting: decided.waiting } : {}),
      ...(decided.handedTo !== undefined ? { handedTo: decided.handedTo } : {}),
    },
  };
}

async function projectForBrief(sql: Sql, organizationId: string, requested: string): Promise<string | null | "missing"> {
  if (requested) {
    const row = await sql.get<{ id: string }>("SELECT id FROM projects WHERE id = ? AND organization_id = ?", [
      requested,
      organizationId,
    ]);
    return row ? requested : "missing";
  }
  const rows = await sql.all<{ id: string }>(
    `SELECT id FROM projects
     WHERE organization_id = ? AND status IN ('planned', 'active', 'waiting_on_client')
     ORDER BY created_at`,
    [organizationId],
  );
  return rows.length === 1 ? rows[0].id : null;
}

async function addWork(sql: Sql, caller: Caller, input: Record<string, unknown>, now: number, wake: Wake): Promise<HqToolResult> {
  const organizationId = text(input, "organizationId");
  const org = await seenOrg(sql, caller, organizationId);
  if (!org || !caller.userId) return { ok: false, error: "missing" };
  const kind = text(input, "kind");
  const outcome = text(input, "outcome");
  const goal = text(input, "goal");
  const due = text(input, "due");
  if (!kind || !outcome || !goal || !due) return { ok: false, error: "invalid" };
  const projectId = await projectForBrief(sql, organizationId, text(input, "projectId"));
  if (projectId === "missing") return { ok: false, error: "missing" };
  return saveAddendum(
    sql,
    { organizationId, organizationName: org.name, userId: caller.userId, kind, outcome, goal, due, projectId },
    now,
    wake,
  );
}

async function reviseBrief(sql: Sql, caller: Caller, input: Record<string, unknown>, now: number): Promise<HqToolResult> {
  const organizationId = text(input, "organizationId");
  if (!(await seenOrg(sql, caller, organizationId)) || !caller.userId) return { ok: false, error: "missing" };
  const note = text(input, "body");
  if (!note) return { ok: false, error: "invalid" };
  const brief = await getBrief(sql, organizationId, "brief");
  if (!brief || typeof brief.deliverableId !== "string") return { ok: false, error: "invalid" };
  await sql.run(
    `INSERT INTO deliverable_feedback (
      id, deliverable_id, item_id, version, author_kind, author_id, decision, body, created_at
    ) VALUES (?, ?, NULL, ?, 'staff', ?, 'changes', ?, ?)`,
    [crypto.randomUUID(), brief.deliverableId, brief.version, caller.userId, note, now],
  );
  await logStaff(
    sql,
    { organizationId, userId: caller.userId, kind: "staff.brief_changes", body: note, data: { deliverableId: brief.deliverableId } },
    now,
  );
  return { ok: true, value: { deliverableId: brief.deliverableId } };
}

async function instructTask(sql: Sql, caller: Caller, input: Record<string, unknown>, now: number): Promise<HqToolResult> {
  const task = await sql.get<{ id: string; organization_id: string | null }>(
    "SELECT id, organization_id FROM tasks WHERE id = ?",
    [text(input, "taskId")],
  );
  if (!task?.organization_id || !(await seenOrg(sql, caller, task.organization_id))) return { ok: false, error: "missing" };
  return fromCrm(
    await addNote(
      sql,
      caller,
      { organizationId: task.organization_id, body: text(input, "body"), asInstruction: true, taskId: task.id },
      now,
    ),
  );
}

async function answerQuestion(
  sql: Sql,
  caller: Caller,
  input: Record<string, unknown>,
  now: number,
  options: ToolOptions & { wake: Wake },
): Promise<HqToolResult> {
  const row = await sql.get<{ id: string; organization_id: string; task_id: string | null }>(
    "SELECT id, organization_id, task_id FROM agent_questions WHERE id = ? AND answered_at IS NULL",
    [text(input, "id")],
  );
  if (!row || !(await seenOrg(sql, caller, row.organization_id)) || !caller.userId) return { ok: false, error: "missing" };
  const answer = text(input, "answer");
  if (!answer) return { ok: false, error: "invalid" };
  await sql.run("UPDATE agent_questions SET answer = ?, answered_by = ?, answered_at = ? WHERE id = ?", [
    answer,
    caller.userId,
    now,
    row.id,
  ]);
  await unblockAnsweredQuestion(sql, row.id, now, options.wake);
  const origin = options.swarm?.origin?.trim() || process.env.SWARM_ORIGIN?.trim() || "";
  if (origin && row.task_id) {
    await resumeQuestionStage({
      sql,
      organizationId: row.organization_id,
      taskId: row.task_id,
      answer,
      now,
      origin,
      fetchImpl: options.swarm?.fetchImpl,
      wait: options.swarm?.wait,
      store: options.swarm?.store,
      readSkill: options.readSkill,
      imageRun: options.imageRun,
    });
  }
  await logStaff(
    sql,
    { organizationId: row.organization_id, userId: caller.userId, kind: "staff.question_answered", body: answer, data: { questionId: row.id } },
    now,
  );
  return { ok: true, value: { id: row.id } };
}

async function setPaused(sql: Sql, caller: Caller, organizationId: string, now: number, paused: boolean): Promise<HqToolResult> {
  if (!(await seenOrg(sql, caller, organizationId)) || !caller.userId) return { ok: false, error: "missing" };
  await sql.run("UPDATE organizations SET agent_paused_at = ?, updated_at = ? WHERE id = ?", [
    paused ? now : null,
    now,
    organizationId,
  ]);
  await logStaff(
    sql,
    {
      organizationId,
      userId: caller.userId,
      kind: paused ? "staff.agent_paused" : "staff.agent_resumed",
      body: paused ? "Paused the agent." : "Resumed the agent.",
    },
    now,
  );
  return { ok: true, value: { organizationId, paused } };
}

async function resumeClient(sql: Sql, caller: Caller, organizationId: string, now: number, wake: Wake): Promise<HqToolResult> {
  const result = await setPaused(sql, caller, organizationId, now, false);
  if ("ok" in result && result.ok) await wake(organizationId, "work");
  return result;
}

async function invitePerson(
  sql: Sql,
  caller: Caller,
  input: Record<string, unknown>,
  now: number,
  mail: MailGate | undefined,
): Promise<HqToolResult> {
  if (!mail) return { ok: false, error: "invalid" };
  try {
    const created = await createInvite({
      sql,
      caller,
      workspaceId: text(input, "workspaceId"),
      email: text(input, "email"),
      role: text(input, "role") || "client_member",
      now,
      origin: mail.origin,
      from: mail.from,
      allowlist: mail.allowlist,
      send: mail.send,
    });
    if (!created.ok) return { ok: false, error: "invalid" };
    return { ok: true, value: created.value };
  } catch {
    return { ok: false, error: "invalid" };
  }
}

async function linkSlack(sql: Sql, caller: Caller, input: Record<string, unknown>, now: number): Promise<HqToolResult> {
  const organizationId = text(input, "organizationId");
  if (!(await seenOrg(sql, caller, organizationId)) || !caller.userId) return { ok: false, error: "missing" };
  const channelId = text(input, "channelId");
  if (!/^[CG][A-Z0-9]{6,}$/.test(channelId)) return { ok: false, error: "invalid" };
  await linkSlackChannel(sql, channelId, organizationId, now);
  await logStaff(sql, { organizationId, userId: caller.userId, kind: "staff.slack_linked", body: channelId, data: { channelId } }, now);
  return { ok: true, value: { organizationId, channelId } };
}

/** Staff name the piece on approval (`kind`, `outcome`). A client email only says what they want. */
async function decideWork(sql: Sql, caller: Caller, input: Record<string, unknown>, now: number, wake: Wake): Promise<HqToolResult> {
  const row = await workRequestById(sql, text(input, "id"));
  const org = row ? await seenOrg(sql, caller, row.organization_id) : undefined;
  if (!row || !org || !caller.userId) return { ok: false, error: "missing" };
  if (row.state === "approved" || row.state === "declined") return { ok: false, error: "invalid" };
  const decision = text(input, "decision");
  const log = (body: string, state: string) =>
    logStaff(sql, { organizationId: row.organization_id, userId: caller.userId!, kind: "staff.work_request", body, data: { requestId: row.id, state } }, now);
  if (decision === "declined") {
    const reason = text(input, "body");
    if (!reason) return { ok: false, error: "invalid" };
    await setWorkRequestState(sql, row.id, { state: "declined", decidedBy: caller.userId, declineReason: reason }, now);
    await log(reason, "declined");
    return { ok: true, value: { id: row.id, state: "declined" } };
  }
  if (decision !== "approved") return { ok: false, error: "invalid" };
  const named = row.piece_title?.split(": ") ?? [];
  const kind = text(input, "kind") || named[0] || "";
  const outcome = text(input, "outcome") || named.slice(1).join(": ");
  if (!kind || !outcome) return { ok: false, error: "invalid" };
  const projectId = await projectForBrief(sql, row.organization_id, text(input, "projectId"));
  if (projectId === "missing") return { ok: false, error: "missing" };
  const saved = await saveAddendum(
    sql,
    {
      organizationId: row.organization_id,
      organizationName: org.name,
      userId: caller.userId,
      kind,
      outcome,
      goal: text(input, "goal") || row.goal || "Not stated.",
      due: text(input, "due") || row.due_text || "No rush.",
      projectId,
    },
    now,
    wake,
  );
  if (!("ok" in saved) || !saved.ok) return saved;
  const version = (saved.value as { version?: number }).version;
  await setWorkRequestState(
    sql,
    row.id,
    { state: "approved", decidedBy: caller.userId, pieceTitle: `${kind}: ${outcome}`, briefVersion: version },
    now,
  );
  await log(`${kind}: ${outcome}`, "approved");
  const invoice = await createDraftInvoice(
    sql,
    { organizationId: row.organization_id, description: `${kind}: ${outcome}`, sourceId: row.id, createdBy: caller.userId },
    now,
  );
  return { ok: true, value: { id: row.id, state: "approved", invoice, ...(saved.value as object) } };
}
