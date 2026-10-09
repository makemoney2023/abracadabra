import type { Sql } from "@/db/sql";
import { summaryFromChatBody } from "@/lib/ai-gateway";
import { workflowTaskPlan } from "@/lib/client-workflows";
import { choosePackId, type PackCandidate } from "@/lib/pack-picker";
import { templateOnCard } from "@/lib/swarm-ready";

const PACK_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const PACK_SYSTEM = "Return one pack id from the list, or the word none. Do not explain.";

type PackAi = {
  run(model: string, input: unknown, options?: { gateway?: { id: string } }): Promise<unknown>;
};

export function packPrompt(title: string, brief: string, packs: PackCandidate[]): string {
  const lines = packs.map((pack) => `${pack.id} | ${pack.name} | ${pack.description}`).join("\n");
  return [`Task: ${title}`, brief, "", "Packs:", lines, "", "Return one pack id from the list, or none."].join("\n");
}

/** Reads a pack id from the model. An empty string means it did not answer. */
export async function askPackModel(ai: PackAi | undefined, prompt: string, gatewayId = "default"): Promise<string> {
  if (!ai) return "";
  const body = await ai.run(
    PACK_MODEL,
    {
      messages: [
        { role: "system", content: PACK_SYSTEM },
        { role: "user", content: prompt },
      ],
    },
    { gateway: { id: gatewayId } },
  );
  return summaryFromChatBody(body);
}

/** Stores a pack's skill steps on a card. A template with no skill path is refused. */
export async function writeTaskPack(
  sql: Sql,
  taskId: string,
  templateId: string,
  template: unknown,
  now: number,
): Promise<boolean> {
  const plan = workflowTaskPlan(template);
  if (!plan || !templateId.startsWith("pack-")) return false;
  const task = await sql.get<{ id: string }>("SELECT id FROM tasks WHERE id = ?", [taskId]);
  if (!task) return false;
  await sql.run("UPDATE tasks SET skills_json = ?, updated_at = ? WHERE id = ?", [
    JSON.stringify({ ...plan, templateId }),
    now,
    taskId,
  ]);
  return true;
}

/** Puts one pack on each open card that does not have one yet. */
export async function assignOpenTaskPacks(input: {
  sql: Sql;
  projectId: string;
  now: number;
  packs: PackCandidate[];
  ask: (prompt: string) => Promise<string>;
  template: (templateId: string) => Promise<unknown>;
}): Promise<string[]> {
  if (input.packs.length === 0) return [];
  const open = await input.sql.all<{ id: string; title: string; skills_json: string | null; brief: string | null }>(
    `SELECT t.id, t.title, t.skills_json, a.body AS brief
     FROM tasks t
     LEFT JOIN activities a ON a.kind = 'agent.task_brief' AND json_extract(a.data_json, '$.taskId') = t.id
     WHERE t.project_id = ? AND t.status != 'done'
     ORDER BY t.position, t.created_at, t.id`,
    [input.projectId],
  );
  const matched: string[] = [];
  for (const task of open) {
    if (templateOnCard(task.skills_json)) continue;
    const text = [task.title, task.brief ?? ""].filter((part) => part.trim()).join("\n");
    let modelText = "";
    try {
      modelText = await input.ask(packPrompt(task.title, task.brief ?? "", input.packs));
    } catch {
      modelText = "";
    }
    const templateId = choosePackId(modelText, text, input.packs);
    if (!templateId) continue;
    let body: unknown = null;
    try {
      body = await input.template(templateId);
    } catch {
      body = null;
    }
    const wrote = await writeTaskPack(input.sql, task.id, templateId, body, input.now);
    if (wrote) matched.push(task.title);
  }
  return matched;
}
