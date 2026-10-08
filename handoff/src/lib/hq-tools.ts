import { AgentWorkError, saveStaffBrief } from "@/db/agent-work";
import { recordAgentRun } from "@/lib/agent-activity";
import { actionFromLine, applyChannelPlan, dueMillis } from "@/lib/channel-plan";
import { linkSlackChannel, listWorkRequests, setWorkRequestState, workRequestById } from "@/db/conversations";
import {
  addNote,
  createDraftInvoice,
  completeTask,
  createContact,
  createMilestone,
  createOrganization,
  createProject,
  createTask,
  listDeals,
  listOrganizations,
  listTimeline,
  logCall,
  mergeOrganizations,
  moveDealStage,
  organizationById,
  postStatusUpdate,
  type StatusHealth,
} from "@/db/crm";
import { publishDeliverable } from "@/db/deliverables";
import type { Sql } from "@/db/sql";
import { getBrief } from "@/lib/agent-context";
import { wakeOrganization, type WakeReason } from "@/lib/agent-wake";
import type { Caller } from "@/lib/authz";
import { appendBriefWork } from "@/lib/client-plan";
import {
  assignClientWorkflow,
  createClientWorkflow,
  createWorkflowGroup,
  listClientWorkflows,
  runClientWorkflow,
  workflowTaskPlan,
  type WorkflowTaskPlan,
} from "@/lib/client-workflows";
import { hqToolNeedsApproval } from "@/lib/hq-tool-names";
import { createInvite } from "@/lib/store/invites";
import type { OutboundMail } from "@/lib/session";

export type HqToolResult =
  | { ok: true; value: unknown }
  | { ok: false; error: "unauthorized" | "forbidden" | "missing" | "invalid" | "unknown" | "brief_not_approved" }
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
  swarm?: { origin: string; fetchImpl?: typeof fetch; wait?: (ms: number) => Promise<void> };
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
]);

function text(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  return typeof value === "string" ? value.trim() : "";
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
  input: { organizationId: string; organizationName: string; userId: string; kind: string; outcome: string; goal: string; due: string },
  now: number,
  wake: Wake,
): Promise<HqToolResult> {
  const brief = await getBrief(sql, input.organizationId, "brief");
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
    return { ok: true, value: { ...org, deals } };
  }
  if (tool === "list_deals") {
    if (!(await seenOrg(sql, caller, organizationId))) return { ok: false, error: "missing" };
    const deals = await listDeals(sql, caller, { organizationId });
    return { ok: true, value: deals.map((deal) => ({ id: deal.id, title: deal.title, stage: deal.stage })) };
  }
  if (tool === "list_tasks") {
    if (!(await seenOrg(sql, caller, organizationId))) return { ok: false, error: "missing" };
    const rows = await sql.all("SELECT id, title, status, stage FROM tasks WHERE organization_id = ?", [organizationId]);
    return { ok: true, value: rows };
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
  if (tool === "list_work_requests") {
    if (!(await seenOrg(sql, caller, organizationId))) return { ok: false, error: "missing" };
    return { ok: true, value: await listWorkRequests(sql, organizationId) };
  }
  if (tool === "create_client") return fromCrm(await createOrganization(sql, caller, { name: text(input, "name") }, now));
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
    const filed = await applyChannelPlan(
      sql,
      {
        organizationId,
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
    return fromCrm(await createProject(sql, caller, { organizationId, name: text(input, "name") }, now));
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
  if (tool === "set_task_stage") return setTaskStage(sql, caller, input, now);
  if (tool === "add_work") return addWork(sql, caller, input, now, options.wake);
  if (tool === "revise_brief") return reviseBrief(sql, caller, input, now);
  if (tool === "instruct_task") return instructTask(sql, caller, input, now);
  if (tool === "answer_question") return answerQuestion(sql, caller, input, now);
  if (tool === "pause_client") return setPaused(sql, caller, organizationId, now, true);
  if (tool === "resume_client") return resumeClient(sql, caller, organizationId, now, options.wake);
  if (tool === "decide_work_request") return decideWork(sql, caller, input, now, options.wake);
  if (tool === "link_slack_channel") return linkSlack(sql, caller, input, now);
  if (tool === "list_workflows") return listWorkflows(sql, caller, input);
  if (tool === "create_workflow_group") return makeWorkflowGroup(sql, caller, input, now);
  if (tool === "create_workflow") return makeWorkflow(sql, caller, input, now, options);
  if (tool === "assign_workflow") return assignWorkflow(sql, caller, input, now);
  if (tool === "run_workflow") return runWorkflow(sql, caller, input, now, options.swarm);
  return { ok: false, error: "unknown" };
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
  const templateId = text(input, "templateId");
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

async function runWorkflow(
  sql: Sql,
  caller: Caller,
  input: Record<string, unknown>,
  now: number,
  swarm: ToolOptions["swarm"],
): Promise<HqToolResult> {
  const workflowId = text(input, "id");
  const row = await sql.get<{ organization_id: string; name: string; template_id: string }>(
    "SELECT organization_id, name, template_id FROM client_workflows WHERE id = ?",
    [workflowId],
  );
  if (!row || !(await seenOrg(sql, caller, row.organization_id)) || !caller.userId) return { ok: false, error: "missing" };
  const origin = swarm?.origin?.trim() || process.env.SWARM_ORIGIN?.trim() || "";
  const started = await runClientWorkflow({
    sql,
    workflowId,
    brief: text(input, "body"),
    origin,
    now,
    fetchImpl: swarm?.fetchImpl,
    wait: swarm?.wait,
  });
  await recordAgentRun(sql, {
    organizationId: row.organization_id,
    kind: "agent.swarm_run",
    body: started.ok ? started.output.slice(0, 500) || row.name : "The swarm did not start.",
    status: started.ok ? started.status : "failed",
    data: {
      trigger: "chat",
      packId: row.template_id,
      packName: row.name,
      executionId: started.ok ? started.executionId : "",
      workflowId,
    },
    now,
  });
  if (!started.ok) return { ok: false, error: started.error };
  await logStaff(
    sql,
    {
      organizationId: row.organization_id,
      userId: caller.userId,
      kind: "staff.workflow_run",
      body: started.output.slice(0, 500) || row.name,
      data: { workflowId, executionId: started.executionId, status: started.status },
    },
    now,
  );
  return { ok: true, value: { workflowId, executionId: started.executionId, status: started.status, output: started.output } };
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

async function setTaskStage(sql: Sql, caller: Caller, input: Record<string, unknown>, now: number): Promise<HqToolResult> {
  const stage = text(input, "stage");
  if (!["describe", "engineer", "build", "run"].includes(stage)) return { ok: false, error: "invalid" };
  const task = await sql.get<{ id: string; organization_id: string | null }>(
    "SELECT id, organization_id FROM tasks WHERE id = ?",
    [text(input, "taskId")],
  );
  if (!task?.organization_id || !(await seenOrg(sql, caller, task.organization_id)) || !caller.userId) {
    return { ok: false, error: "missing" };
  }
  if (stage === "build") {
    const brief = await getBrief(sql, task.organization_id, "brief");
    if (!brief || brief.status !== "approved") return { ok: false, error: "brief_not_approved" };
  }
  await sql.run("UPDATE tasks SET stage = ?, updated_at = ? WHERE id = ?", [stage, now, task.id]);
  await logStaff(
    sql,
    { organizationId: task.organization_id, userId: caller.userId, kind: "staff.task_stage", body: `Moved to ${stage}.`, data: { taskId: task.id, stage } },
    now,
  );
  return { ok: true, value: { taskId: task.id, stage } };
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
  return saveAddendum(sql, { organizationId, organizationName: org.name, userId: caller.userId, kind, outcome, goal, due }, now, wake);
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

async function answerQuestion(sql: Sql, caller: Caller, input: Record<string, unknown>, now: number): Promise<HqToolResult> {
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
  if (row.task_id) {
    await sql.run(
      `UPDATE tasks SET status = 'todo', blocked_reason = NULL, updated_at = ?
       WHERE id = ? AND blocked_reason = 'waiting_on_staff'`,
      [now, row.task_id],
    );
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
