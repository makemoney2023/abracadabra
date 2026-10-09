import { createTask } from "@/db/crm";
import type { Sql } from "@/db/sql";
import { summaryFromChatBody } from "@/lib/ai-gateway";
import type { Caller } from "@/lib/authz";

const MAX_REQUIREMENT_TASKS = 8;

export const REQUIREMENT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const REQUIREMENT_SYSTEM = [
  "You turn project requirements into tasks.",
  'Return JSON only, with no markdown: {"tasks":[{"title":"short concrete task"}]}',
  "Each title is one piece of work the requirements ask for.",
  "Use the words in the requirements. Do not add work they did not ask for.",
  "Do not repeat a task that is already on the project.",
  "Keep each title under 120 characters.",
  'If there is no new work, return {"tasks":[]}.',
].join(" ");

export type RequirementPlan = {
  created: string[];
  reason: "added" | "none" | "cleared" | "unread";
};

type RequirementAi = {
  run(model: string, input: unknown, options?: { gateway?: { id: string } }): Promise<unknown>;
};

/** Task titles from the model's JSON. Extra prose and a fenced block are ignored. */
export function tasksFromRequirementModel(raw: string): string[] {
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
  const titles: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const title = taskTitle(item);
    if (!title) continue;
    const key = title.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
    if (titles.length >= MAX_REQUIREMENT_TASKS) break;
  }
  return titles;
}

function taskTitle(item: unknown): string | null {
  const raw =
    typeof item === "string"
      ? item
      : item && typeof item === "object" && typeof (item as { title?: unknown }).title === "string"
        ? (item as { title: string }).title
        : "";
  const title = raw.replace(/\s+/g, " ").trim();
  if (!title) return null;
  return title.slice(0, 200);
}

export function requirementPrompt(requirements: string, existing: string[]): string {
  const listed = existing.map((title) => title.trim()).filter((title) => title.length > 0);
  return [
    "Project requirements:",
    requirements.trim(),
    "",
    "Tasks already on this project:",
    listed.length > 0 ? listed.map((title) => `- ${title}`).join("\n") : "None.",
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
  if (!requirements) return { created: [], reason: "cleared" };
  const existing = await input.sql.all<{ title: string }>(
    "SELECT title FROM tasks WHERE project_id = ? ORDER BY position, created_at",
    [input.projectId],
  );
  const have = new Set(existing.map((row) => row.title.trim().toLocaleLowerCase()));
  let raw = "";
  try {
    raw = await input.ask(requirementPrompt(requirements, existing.map((row) => row.title)));
  } catch {
    return { created: [], reason: "unread" };
  }
  if (!raw.trim()) return { created: [], reason: "unread" };
  const titles = tasksFromRequirementModel(raw).filter((title) => !have.has(title.toLocaleLowerCase()));
  if (titles.length === 0) return { created: [], reason: "none" };
  const created: string[] = [];
  for (const title of titles) {
    const saved = await createTask(
      input.sql,
      input.caller,
      { projectId: input.projectId, title },
      input.now,
    );
    if (!saved.ok) break;
    created.push(saved.value.title);
  }
  if (created.length === 0) return { created: [], reason: "unread" };
  return { created, reason: "added" };
}
