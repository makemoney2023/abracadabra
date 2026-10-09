import { createTask } from "@/db/crm";
import type { Sql } from "@/db/sql";
import { summaryFromChatBody } from "@/lib/ai-gateway";
import type { Caller } from "@/lib/authz";

const MAX_REQUIREMENT_TASKS = 8;

export const REQUIREMENT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const REQUIREMENT_SYSTEM = [
  "You turn project requirements into tasks.",
  'Return JSON only, with no markdown: {"tasks":[{"title":"short concrete task","detail":"what done looks like"}]}',
  "Each title is one piece of work the requirements ask for.",
  "Each detail says what that task must produce, including sizes, counts, and constraints the requirements named.",
  "Use the words in the requirements. Do not add work, dates, or tools they did not ask for.",
  "When tasks are already listed, copy those titles exactly and only fill detail. Do not add or rename a task.",
  "Keep each title under 120 characters and each detail under 600 characters.",
  'If there is no new work, return {"tasks":[]}.',
].join(" ");

const MAX_DETAIL = 1500;

export type RequirementTask = { title: string; detail: string };

export type RequirementPlan = {
  created: string[];
  detailed: string[];
  reason: "added" | "none" | "cleared" | "unread";
};

type RequirementAi = {
  run(model: string, input: unknown, options?: { gateway?: { id: string } }): Promise<unknown>;
};

/** Tasks from the model's JSON. Extra prose and a fenced block are ignored. */
export function tasksFromRequirementModel(raw: string): RequirementTask[] {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const objectAt = text.indexOf("{");
  const arrayAt = text.indexOf("[");
  let parsed: unknown;
  try {
    if (objectAt >= 0 && (arrayAt < 0 || objectAt < arrayAt)) {
      const end = text.lastIndexOf("}");
      if (end < objectAt) return [];
      parsed = JSON.parse(text.slice(objectAt, end + 1));
    } else if (arrayAt >= 0) {
      const end = text.lastIndexOf("]");
      if (end < arrayAt) return [];
      parsed = JSON.parse(text.slice(arrayAt, end + 1));
    } else {
      return [];
    }
  } catch {
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { tasks?: unknown }).tasks)
      ? (parsed as { tasks: unknown[] }).tasks
      : [];
  const tasks: RequirementTask[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const task = requirementTask(item);
    if (!task) continue;
    const key = task.title.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tasks.push(task);
    if (tasks.length >= MAX_REQUIREMENT_TASKS) break;
  }
  return tasks;
}

function requirementTask(item: unknown): RequirementTask | null {
  if (typeof item === "string") {
    const title = cleanLine(item, 200);
    return title ? { title, detail: "" } : null;
  }
  if (!item || typeof item !== "object") return null;
  const row = item as { title?: unknown; detail?: unknown };
  const title = typeof row.title === "string" ? cleanLine(row.title, 200) : "";
  if (!title) return null;
  const detail = typeof row.detail === "string" ? cleanLine(row.detail, MAX_DETAIL) : "";
  return { title, detail };
}

function cleanLine(raw: string, max: number): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, max);
}

export function requirementPrompt(requirements: string, existing: string[]): string {
  const listed = existing.map((title) => title.trim()).filter((title) => title.length > 0);
  return [
    "Project requirements:",
    requirements.trim(),
    "",
    "Tasks already on this project:",
    listed.length > 0
      ? `${listed.map((title) => `- ${title}`).join("\n")}\nCopy each title exactly. Do not add a task.`
      : "None.",
  ].join("\n");
}

/** Reads the requirements and returns the model's text. An empty string means it did not answer. */
export async function askRequirementModel(
  ai: RequirementAi | undefined,
  prompt: string,
  gatewayId = "default",
): Promise<string> {
  if (!ai) return "";
  const body = await ai.run(
    REQUIREMENT_MODEL,
    {
      messages: [
        { role: "system", content: REQUIREMENT_SYSTEM },
        { role: "user", content: prompt },
      ],
    },
    { gateway: { id: gatewayId } },
  );
  return summaryFromChatBody(body);
}

/** Adds tasks the requirements ask for that this project does not already have. */
export async function fileRequirementTasks(input: {
  sql: Sql;
  caller: Caller;
  projectId: string;
  requirements: string;
  ask: (prompt: string) => Promise<string>;
  now: number;
}): Promise<RequirementPlan> {
  const requirements = input.requirements.trim();
  if (!requirements) return { created: [], detailed: [], reason: "cleared" };
  const project = await input.sql.get<{ organization_id: string }>(
    "SELECT organization_id FROM projects WHERE id = ?",
    [input.projectId],
  );
  if (!project) return { created: [], detailed: [], reason: "unread" };
  const existing = await input.sql.all<{ id: string; title: string; status: string; brief: string | null }>(
    `SELECT t.id, t.title, t.status, a.body AS brief
     FROM tasks t
     LEFT JOIN activities a ON a.kind = 'agent.task_brief'
       AND json_extract(a.data_json, '$.taskId') = t.id
     WHERE t.project_id = ?
     ORDER BY t.position, t.created_at`,
    [input.projectId],
  );
  const open = existing.filter((row) => row.status !== "done");
  const byTitle = new Map(open.map((row) => [row.title.trim().toLocaleLowerCase(), row]));
  let raw = "";
  try {
    raw = await input.ask(requirementPrompt(requirements, existing.map((row) => row.title)));
  } catch {
    return { created: [], detailed: [], reason: "unread" };
  }
  if (!raw.trim()) return { created: [], detailed: [], reason: "unread" };
  const planned = tasksFromRequirementModel(raw);
  const created: string[] = [];
  const detailed: string[] = [];
  const matched = new Set<string>();
  const leftovers: RequirementTask[] = [];
  for (const task of planned) {
    const prior = byTitle.get(task.title.toLocaleLowerCase());
    if (prior) {
      matched.add(prior.id);
      if (task.detail && task.detail !== (prior.brief ?? "")) {
        await writeTaskBrief(input.sql, {
          organizationId: project.organization_id,
          projectId: input.projectId,
          taskId: prior.id,
          detail: task.detail,
          now: input.now,
        });
        detailed.push(prior.title);
      }
      continue;
    }
    leftovers.push(task);
  }
  if (open.length > 0) {
    const waiting = open.filter((row) => !matched.has(row.id));
    for (let index = 0; index < waiting.length && index < leftovers.length; index += 1) {
      const prior = waiting[index];
      const detail = leftovers[index]?.detail ?? "";
      if (!prior || !detail || detail === (prior.brief ?? "")) continue;
      await writeTaskBrief(input.sql, {
        organizationId: project.organization_id,
        projectId: input.projectId,
        taskId: prior.id,
        detail,
        now: input.now,
      });
      detailed.push(prior.title);
    }
  } else {
    for (const task of leftovers) {
      const saved = await createTask(
        input.sql,
        input.caller,
        { projectId: input.projectId, title: task.title },
        input.now,
      );
      if (!saved.ok) break;
      created.push(saved.value.title);
      if (!task.detail) continue;
      await writeTaskBrief(input.sql, {
        organizationId: saved.value.organization_id,
        projectId: input.projectId,
        taskId: saved.value.id,
        detail: task.detail,
        now: input.now,
      });
      detailed.push(saved.value.title);
    }
  }
  if (created.length === 0 && detailed.length === 0) return { created, detailed, reason: "none" };
  return { created, detailed, reason: "added" };
}

async function writeTaskBrief(
  sql: Sql,
  input: { organizationId: string; projectId: string; taskId: string; detail: string; now: number },
): Promise<void> {
  const current = await sql.get<{ id: string }>(
    "SELECT id FROM activities WHERE kind = 'agent.task_brief' AND json_extract(data_json, '$.taskId') = ? LIMIT 1",
    [input.taskId],
  );
  if (current) {
    await sql.run("UPDATE activities SET body = ?, created_at = ? WHERE id = ?", [input.detail, input.now, current.id]);
    return;
  }
  await sql.run(
    `INSERT INTO activities (
       id, organization_id, project_id, kind, actor_kind, actor_id, body, data_json, created_at
     ) VALUES (?, ?, ?, 'agent.task_brief', 'agent', NULL, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      input.organizationId,
      input.projectId,
      input.detail,
      JSON.stringify({ taskId: input.taskId }),
      input.now,
    ],
  );
}
