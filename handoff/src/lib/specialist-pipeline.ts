import type { Sql } from "@/db/sql";
import { claimDueWorkflow, createClientWorkflow, createWorkflowGroup } from "@/lib/client-workflows";
import { deliverableKind, packTemplateId } from "@/lib/pack-templates";
import type { ObjectStore } from "@/lib/store/objects";
import { storeWorkflowOutput } from "@/lib/workflow-files";

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
  },
): Promise<{ ok: true; groupId: string; stages: { id: string; kind: string; name: string }[]; executionId: string } | { ok: false; error: "invalid" | "missing" | "open" }> {
  if (!input.paths.length || !input.projectId) return { ok: false, error: "invalid" };
  if (await groupOpen(sql, input.projectId)) return { ok: false, error: "open" };
  const created = await createWorkflowGroup(sql, {
    organizationId: input.organizationId,
    name: input.label || "Pipeline",
    projectId: input.projectId,
    now: input.now,
  });
  if (!created.ok) return { ok: false, error: created.error };
  await sql.run("UPDATE workflow_groups SET pipeline = ?, started_by = ? WHERE id = ?", [
    input.label || "pipeline",
    input.startedBy,
    created.group.id,
  ]);
  const stages: { id: string; kind: string; name: string }[] = [];
  for (let index = 0; index < input.paths.length; index += 1) {
    const skillPath = input.paths[index]!.trim();
    const templateId = packTemplateId(skillPath) ?? skillPath;
    const kind = deliverableKind({ name: skillPath, path: skillPath });
    const name = skillPath.split("/").at(-2) || `stage-${index}`;
    const workflow = await createClientWorkflow(sql, {
      organizationId: input.organizationId,
      groupId: created.group.id,
      name,
      templateId,
      projectId: input.projectId,
      dueAt: index === 0 ? input.now : null,
      now: input.now + index,
    });
    if (!workflow.ok) return { ok: false, error: workflow.error };
    await sql.run("UPDATE client_workflows SET stage_order = ?, kind = ?, skill_path = ? WHERE id = ?", [
      index,
      kind,
      skillPath,
      workflow.workflow.id,
    ]);
    stages.push({ id: workflow.workflow.id, kind, name });
  }
  let executionId = "";
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
    });
    if (started.ok && !started.none) executionId = started.executionId;
  }
  return { ok: true, groupId: created.group.id, stages, executionId };
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
  const templateId = packTemplateId(input.skillPath) ?? input.skillPath;
  const kind = deliverableKind({ name: input.skillPath, path: input.skillPath });
  const name = input.skillPath.split("/").at(-2) || "stage";
  const workflow = await createClientWorkflow(sql, {
    organizationId: input.organizationId,
    groupId: input.groupId,
    name,
    templateId,
    projectId: group.project_id,
    now: input.now,
  });
  if (!workflow.ok) return { ok: false, error: workflow.error };
  await sql.run("UPDATE client_workflows SET stage_order = ?, kind = ?, skill_path = ? WHERE id = ?", [
    (last?.stage_order ?? -1) + 1,
    kind,
    input.skillPath,
    workflow.workflow.id,
  ]);
  return { ok: true, id: workflow.workflow.id };
}

export async function abandonPipeline(
  sql: Sql,
  input: { organizationId: string; groupId: string; now: number },
): Promise<{ ok: true } | { ok: false; error: "missing" }> {
  const group = await sql.get<{ id: string }>(
    "SELECT id FROM workflow_groups WHERE id = ? AND organization_id = ?",
    [input.groupId, input.organizationId],
  );
  if (!group) return { ok: false, error: "missing" };
  await sql.run(
    "UPDATE client_workflows SET last_status = 'stale', updated_at = ? WHERE group_id = ? AND accepted_at IS NULL",
    [input.now, input.groupId],
  );
  await sql.run("UPDATE workflow_groups SET pipeline = pipeline || ':closed' WHERE id = ?", [input.groupId]);
  return { ok: true };
}

export async function acceptWorkflow(
  sql: Sql,
  input: {
    organizationId: string;
    workflowId: string;
    now: number;
    store?: ObjectStore;
    run?: (model: string, body: { prompt: string }) => Promise<{ image?: string }>;
  },
): Promise<{ ok: true; kind: string | null; output: string; images?: { stored: number; errors: string[] } } | { ok: false; error: "missing" | "invalid" }> {
  const row = await sql.get<{
    id: string;
    project_id: string | null;
    last_status: string | null;
    kind: string | null;
    last_output: string | null;
    last_receipt: string | null;
  }>(
    "SELECT id, project_id, last_status, kind, last_output, last_receipt FROM client_workflows WHERE id = ? AND organization_id = ?",
    [input.workflowId, input.organizationId],
  );
  if (!row) return { ok: false, error: "missing" };
  if (row.last_status !== "completed") return { ok: false, error: "invalid" };
  await sql.run("UPDATE client_workflows SET accepted_at = ?, updated_at = ? WHERE id = ?", [input.now, input.now, row.id]);
  if (row.kind !== "visual" || !input.run) return { ok: true, kind: row.kind, output: row.last_output ?? "" };
  const images = await renderVisualImages({
    sql,
    store: input.store,
    organizationId: input.organizationId,
    projectId: row.project_id,
    workflowId: row.id,
    output: row.last_output ?? "",
    now: input.now,
    run: input.run,
  });
  if (images.errors.length > 0) {
    const receipt = row.last_receipt ? `${row.last_receipt}\n` : "";
    await sql.run("UPDATE client_workflows SET last_receipt = ? WHERE id = ?", [
      `${receipt}images: ${images.errors.join("; ")}`,
      row.id,
    ]);
  }
  return { ok: true, kind: row.kind, output: row.last_output ?? "", images };
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
  const binary = atob(value);
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
  run: (model: string, body: { prompt: string }) => Promise<{ image?: string }>;
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
      const image = await input.run("@cf/black-forest-labs/flux-2-klein-9b", { prompt });
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
