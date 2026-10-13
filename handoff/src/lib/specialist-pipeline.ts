import type { Sql, SqlStatement } from "@/db/sql";
import { claimDueWorkflow } from "@/lib/client-workflows";
import { deliverableKind, packTemplateId } from "@/lib/pack-templates";
import type { ObjectStore } from "@/lib/store/objects";
import { nextColumnPosition } from "@/lib/task-position";
import { storeWorkflowOutput } from "@/lib/workflow-files";

export const VISUAL_MODEL = "@cf/black-forest-labs/flux-2-klein-9b";

export const SOCIAL_PIPELINE = [
  ".cursor/skills/plugins/parallel/parallel-web-search/SKILL.md",
  ".cursor/skills/community/marketingskills/copywriting/SKILL.md",
  ".cursor/skills/community/advertising-skills/skills/qa/generic-language-killer/SKILL.md",
  ".cursor/skills/community/visual-skills/image/SKILL.md",
] as const;

async function groupOpen(sql: Sql, projectId: string): Promise<boolean> {
  const row = await sql.get<{ id: string }>(
    `SELECT g.id FROM workflow_groups g
     JOIN client_workflows w ON w.group_id = g.id
     WHERE g.project_id = ? AND g.pipeline IS NOT NULL AND g.pipeline NOT LIKE '%:closed'
       AND w.accepted_at IS NULL AND COALESCE(w.last_status, '') != 'stale'
     LIMIT 1`,
    [projectId],
  );
  return Boolean(row);
}

export async function startPipeline(
  sql: Sql,
  input: {
    organizationId: string;
    projectId: string;
    label: string;
    paths: string[];
    startedBy: string;
    now: number;
    origin?: string;
    fetchImpl?: typeof fetch;
    wait?: (ms: number) => Promise<void>;
    store?: ObjectStore;
    instruction?: string;
    readSkill?: (skillPath: string) => Promise<string | null>;
  },
): Promise<
  | {
      ok: true;
      groupId: string;
      stages: { id: string; kind: string; name: string; taskId: string }[];
      executionId: string;
      status: string;
      output: string;
      waitingOn?: string;
    }
  | { ok: false; error: "invalid" | "missing" | "open" }
> {
  if (!input.paths.length || !input.projectId) return { ok: false, error: "invalid" };
  if (await groupOpen(sql, input.projectId)) return { ok: false, error: "open" };
  const project = await sql.get<{ id: string }>("SELECT id FROM projects WHERE id = ? AND organization_id = ?", [
    input.projectId,
    input.organizationId,
  ]);
  if (!project) return { ok: false, error: "missing" };
  const groupName = (input.label || "Pipeline").trim().slice(0, 120);
  if (!groupName) return { ok: false, error: "invalid" };
  const groupId = crypto.randomUUID();
  const stages: { id: string; kind: string; name: string; taskId: string }[] = [];
  const firstPosition = await nextColumnPosition(sql, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    column: "describe",
  });
  const statements: SqlStatement[] = [
    {
      statement: "INSERT INTO workflow_groups (id, organization_id, project_id, name, created_at) VALUES (?, ?, ?, ?, ?)",
      params: [groupId, input.organizationId, input.projectId, groupName, input.now],
    },
    {
      statement: "UPDATE workflow_groups SET pipeline = ?, started_by = ? WHERE id = ?",
      params: [input.label || "pipeline", input.startedBy, groupId],
    },
  ];
  for (let index = 0; index < input.paths.length; index += 1) {
    const skillPath = input.paths[index]!.trim();
    if (!skillPath || skillPath.includes("..")) return { ok: false, error: "invalid" };
    const id = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    const templateId = (packTemplateId(skillPath) ?? skillPath).slice(0, 120);
    const kind = deliverableKind({ name: skillPath, path: skillPath });
    const name = (skillPath.split("/").at(-2) || `stage-${index}`).slice(0, 120);
    statements.push(
      ...stageRows({
        id,
        groupId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        name,
        templateId,
        now: input.now + index,
        nextRunAt: index === 0 ? input.now : null,
        stageOrder: index,
        kind,
        skillPath,
        taskId,
        position: firstPosition + index,
      }),
    );
    stages.push({ id, kind, name, taskId });
  }
  try {
    await sql.batch(statements);
  } catch {
    return { ok: false, error: "invalid" };
  }
  let executionId = "";
  let status = "none";
  let output = "";
  let waitingOn: string | undefined;
  if (input.origin && stages[0]) {
    const started = await claimDueWorkflow({
      sql,
      organizationId: input.organizationId,
      origin: input.origin,
      now: input.now,
      workflowId: stages[0].id,
      instruction: input.instruction,
      trigger: "chat",
      fetchImpl: input.fetchImpl,
      wait: input.wait,
      store: input.store,
      readSkill: input.readSkill,
    });
    if (!started.ok) {
      status = "error";
      output = started.error;
    } else if (!started.none) {
      executionId = started.executionId;
      status = started.status;
      output = started.output;
      waitingOn = started.waitingOn;
    }
  }
  return { ok: true, groupId, stages, executionId, status, output, ...(waitingOn ? { waitingOn } : {}) };
}

function stageRows(input: {
  id: string;
  groupId: string;
  organizationId: string;
  projectId: string | null;
  name: string;
  templateId: string;
  now: number;
  nextRunAt: number | null;
  stageOrder: number;
  kind: string;
  skillPath: string;
  taskId: string | null;
  position: number;
}): SqlStatement[] {
  const task: SqlStatement[] =
    input.projectId && input.taskId
      ? [
          {
            statement: `INSERT INTO tasks (
               id, project_id, organization_id, title, status, created_at, updated_at, stage, skills_json, round, created_by_kind, position
             ) VALUES (?, ?, ?, ?, 'todo', ?, ?, 'describe', ?, 1, 'agent', ?)`,
            params: [
              input.taskId,
              input.projectId,
              input.organizationId,
              input.name,
              input.now,
              input.now,
              JSON.stringify({ steps: [{ path: input.skillPath, mode: "complete", status: "todo" }], edges: [], current: 0 }),
              input.position,
            ],
          },
        ]
      : [];
  const taskId = task.length ? input.taskId : null;
  return [
    ...task,
    {
      statement: `INSERT INTO client_workflows (
         id, group_id, organization_id, project_id, name, template_id, last_execution_id, last_status, created_at, updated_at,
         next_run_at, every_ms, scheduled_at, mcp_server_ids
       ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, NULL, ?, NULL)`,
      params: [
        input.id,
        input.groupId,
        input.organizationId,
        input.projectId,
        input.name,
        input.templateId,
        input.now,
        input.now,
        input.nextRunAt,
        input.nextRunAt == null ? null : input.now,
      ],
    },
    {
      statement: "UPDATE client_workflows SET stage_order = ?, kind = ?, skill_path = ?, task_id = ? WHERE id = ?",
      params: [input.stageOrder, input.kind, input.skillPath, taskId, input.id],
    },
  ];
}

export async function appendPipelineStage(
  sql: Sql,
  input: { organizationId: string; groupId: string; skillPath: string; now: number },
): Promise<{ ok: true; id: string } | { ok: false; error: "invalid" | "missing" }> {
  const group = await sql.get<{ id: string; project_id: string | null; pipeline: string | null }>(
    "SELECT id, project_id, pipeline FROM workflow_groups WHERE id = ? AND organization_id = ?",
    [input.groupId, input.organizationId],
  );
  if (!group || !group.pipeline || group.pipeline.endsWith(":closed")) return { ok: false, error: "missing" };
  const last = await sql.get<{ stage_order: number }>(
    "SELECT COALESCE(MAX(stage_order), -1) AS stage_order FROM client_workflows WHERE group_id = ?",
    [input.groupId],
  );
  const skillPath = input.skillPath.trim();
  if (!skillPath || skillPath.includes("..")) return { ok: false, error: "invalid" };
  const templateId = (packTemplateId(skillPath) ?? skillPath).slice(0, 120);
  const kind = deliverableKind({ name: skillPath, path: skillPath });
  const name = (skillPath.split("/").at(-2) || "stage").slice(0, 120);
  const id = crypto.randomUUID();
  const position = group.project_id
    ? await nextColumnPosition(sql, { organizationId: input.organizationId, projectId: group.project_id, column: "describe" })
    : 0;
  try {
    await sql.batch([
      ...stageRows({
        id,
        groupId: input.groupId,
        organizationId: input.organizationId,
        projectId: group.project_id,
        name,
        templateId,
        now: input.now,
        nextRunAt: null,
        stageOrder: (last?.stage_order ?? -1) + 1,
        kind,
        skillPath,
        taskId: crypto.randomUUID(),
        position,
      }),
      {
        statement: "UPDATE workflow_groups SET pipeline = pipeline WHERE id = ?",
        params: [input.groupId],
      },
    ]);
  } catch {
    return { ok: false, error: "invalid" };
  }
  return { ok: true, id };
}

export async function abandonPipeline(
  sql: Sql,
  input: { organizationId: string; groupId: string; now: number },
): Promise<{ ok: true } | { ok: false; error: "missing" }> {
  const group = await sql.get<{ id: string; pipeline: string | null }>(
    "SELECT id, pipeline FROM workflow_groups WHERE id = ? AND organization_id = ?",
    [input.groupId, input.organizationId],
  );
  if (!group?.pipeline || group.pipeline.endsWith(":closed")) return { ok: false, error: "missing" };
  const orphans = await sql.all<{ id: string; task_id: string }>(
    `SELECT w.id, w.task_id FROM client_workflows w JOIN tasks t ON t.id = w.task_id
     WHERE w.group_id = ? AND w.accepted_at IS NULL AND COALESCE(w.last_execution_id, '') = ''
       AND t.status = 'todo' AND t.stage = 'describe'
       AND NOT EXISTS (SELECT 1 FROM agent_questions q WHERE q.task_id = t.id)
       AND NOT EXISTS (SELECT 1 FROM cloud_runs r WHERE r.task_id = t.id)`,
    [input.groupId],
  );
  await sql.batch([
    {
      statement: "UPDATE client_workflows SET last_status = 'stale', updated_at = ? WHERE group_id = ? AND accepted_at IS NULL",
      params: [input.now, input.groupId],
    },
    ...orphans.flatMap((row) => [
      { statement: "UPDATE client_workflows SET task_id = NULL WHERE id = ?", params: [row.id] },
      { statement: "DELETE FROM tasks WHERE id = ?", params: [row.task_id] },
    ]),
    { statement: "UPDATE workflow_groups SET pipeline = pipeline || ':closed' WHERE id = ?", params: [input.groupId] },
  ]);
  return { ok: true };
}

export async function acceptWorkflow(
  sql: Sql,
  input: {
    organizationId: string;
    workflowId: string;
    now: number;
    store?: ObjectStore;
    run?: (prompt: string) => Promise<{ image?: string }>;
  },
): Promise<{ ok: true; kind: string | null; output: string; images?: { stored: number; errors: string[] } } | { ok: false; error: "missing" | "invalid" }> {
  const row = await sql.get<{
    id: string;
    project_id: string | null;
    last_status: string | null;
    kind: string | null;
    last_output: string | null;
    last_receipt: string | null;
    accepted_at: number | null;
  }>(
    "SELECT id, project_id, last_status, kind, last_output, last_receipt, accepted_at FROM client_workflows WHERE id = ? AND organization_id = ?",
    [input.workflowId, input.organizationId],
  );
  if (!row) return { ok: false, error: "missing" };
  if (row.last_status !== "completed") return { ok: false, error: "invalid" };
  if (row.accepted_at != null) return { ok: true, kind: row.kind, output: row.last_output ?? "", images: { stored: 0, errors: [] } };
  await sql.run("UPDATE client_workflows SET accepted_at = ?, updated_at = ? WHERE id = ?", [input.now, input.now, row.id]);
  if (row.kind !== "visual" || !input.run) return { ok: true, kind: row.kind, output: row.last_output ?? "" };
  let images: { stored: number; errors: string[] };
  try {
    images = await renderVisualImages({
      sql,
      store: input.store,
      organizationId: input.organizationId,
      projectId: row.project_id,
      workflowId: row.id,
      output: row.last_output ?? "",
      now: input.now,
      run: input.run,
    });
  } catch (error) {
    images = { stored: 0, errors: [error instanceof Error ? error.message : "image failed"] };
  }
  if (images.errors.length > 0) {
    const receipt = row.last_receipt ? `${row.last_receipt}\n` : "";
    await sql.run("UPDATE client_workflows SET last_receipt = ? WHERE id = ?", [
      `${receipt}image: failed — ${images.errors.join("; ")}`,
      row.id,
    ]);
  }
  return { ok: true, kind: row.kind, output: row.last_output ?? "", images };
}

export const PIPELINE_STAGE_CAP = 600;
export const PIPELINE_RESULT_CAP = 6000;

function clipText(value: string | null, cap: number): string | null {
  if (value == null || value.length <= cap) return value;
  const note = (hidden: number) => `… (${hidden} more characters, open the workflow to read all)`;
  let room = cap;
  let suffix = note(value.length - room);
  while (room > 0 && room + suffix.length > cap) {
    room -= 1;
    suffix = note(value.length - room);
  }
  if (suffix.length >= cap) return suffix.slice(0, cap);
  return `${value.slice(0, cap - suffix.length)}${suffix}`;
}

/** Short previews for chat. Each page stays within 600 characters and the whole payload within 6000. */
export function clipPipelineView<T extends { last_output: string | null }>(stages: T[]): T[] {
  let cap = PIPELINE_STAGE_CAP;
  let clipped = stages.map((stage) => ({ ...stage, last_output: clipText(stage.last_output, cap) }));
  while (JSON.stringify(clipped).length > PIPELINE_RESULT_CAP && cap > 48) {
    cap = Math.floor(cap / 2);
    clipped = stages.map((stage) => ({ ...stage, last_output: clipText(stage.last_output, cap) }));
  }
  return clipped;
}

export async function pipelineStatus(sql: Sql, organizationId: string, groupId: string): Promise<{
  id: string;
  name: string;
  kind: string | null;
  stage_order: number;
  last_status: string | null;
  accepted: boolean;
  last_receipt: string | null;
  last_output: string | null;
}[]> {
  return sql.all(
    `SELECT id, name, kind, stage_order, last_status, accepted_at IS NOT NULL AS accepted, last_receipt, last_output
     FROM client_workflows WHERE organization_id = ? AND group_id = ? ORDER BY stage_order, created_at`,
    [organizationId, groupId],
  );
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

function decodeBase64(value: string): Uint8Array {
  const payload = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function renderVisualImages(input: {
  sql: Sql;
  store?: ObjectStore;
  organizationId: string;
  projectId: string | null;
  workflowId: string;
  output: string;
  now: number;
  run: (prompt: string) => Promise<{ image?: string }>;
}): Promise<{ stored: number; errors: string[] }> {
  let rows: { imagePrompt?: string; videoPrompt?: string }[] = [];
  try {
    const parsed = JSON.parse(input.output) as unknown;
    if (Array.isArray(parsed)) rows = parsed;
  } catch {
    return { stored: 0, errors: ["visual page is not json"] };
  }
  const errors: string[] = [];
  let stored = 0;
  const files = [];
  for (const row of rows.slice(0, 7)) {
    const prompt = row.imagePrompt?.trim();
    if (!prompt) continue;
    try {
      const image = await input.run(prompt);
      if (!image.image) {
        errors.push("image missing");
        continue;
      }
      const bytes = decodeBase64(image.image);
      if (bytes.byteLength < 8 || PNG_MAGIC.some((byte, index) => bytes[index] !== byte)) {
        errors.push("image was not a png");
        continue;
      }
      files.push({ workflow: "visual", run: input.workflowId, node: `image-${stored + 1}`, body: prompt, bytes });
      stored += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "image failed");
    }
  }
  if (input.store && files.length > 0) {
    await storeWorkflowOutput({
      sql: input.sql,
      store: input.store,
      organizationId: input.organizationId,
      projectId: input.projectId,
      files,
      now: input.now,
    });
  }
  return { stored, errors };
}
