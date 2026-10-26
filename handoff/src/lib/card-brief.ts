import type { Sql } from "@/db/sql";

/**
 * A card's description, requirements and acceptance criteria. There is no tasks column for these (no schema change):
 * they live on the card's own timeline, in the client_agent.board activity that created it (action create, with
 * description, or its note) and in later describe actions. The newest one wins; older ones stay as history.
 */
export type CardBrief = {
  description: string | null;
  requirements: string[];
  acceptance_criteria: string[];
  /** Who set it last (agent id), and when (ISO). null when the card has no brief. */
  described_by: string | null;
  described_at: string | null;
};

export const EMPTY_BRIEF: CardBrief = { description: null, requirements: [], acceptance_criteria: [], described_by: null, described_at: null };

export const BRIEF_LIMITS = { description: 8000, items: 30, item: 1000 } as const;

export type BriefInput = { description?: string | null; requirements?: string[]; acceptanceCriteria?: string[] };

function cleanText(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

/** Parses description, requirements and acceptance_criteria from a request body. undefined: none were sent. */
export function parseBrief(body: Record<string, unknown>): { ok: true; brief: BriefInput | undefined } | { ok: false; message: string } {
  const has = (key: string) => body[key] !== undefined && body[key] !== null;
  if (!has("description") && !has("requirements") && !has("acceptance_criteria")) return { ok: true, brief: undefined };
  if (has("description") && typeof body.description !== "string") return { ok: false, message: "description must be text." };
  const list = (key: string): string[] | null => {
    if (!has(key)) return [];
    const raw = body[key];
    if (typeof raw === "string") return raw.split("\n").map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim()).filter(Boolean);
    if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string")) return null;
    return (raw as string[]).map((item) => item.trim()).filter(Boolean);
  };
  const requirements = list("requirements");
  if (!requirements) return { ok: false, message: "requirements must be a list of text lines." };
  const acceptance = list("acceptance_criteria");
  if (!acceptance) return { ok: false, message: "acceptance_criteria must be a list of text lines." };
  if (requirements.length > BRIEF_LIMITS.items || acceptance.length > BRIEF_LIMITS.items) {
    return { ok: false, message: `Up to ${BRIEF_LIMITS.items} requirements and ${BRIEF_LIMITS.items} acceptance criteria.` };
  }
  return {
    ok: true,
    brief: {
      description: cleanText(body.description, BRIEF_LIMITS.description),
      requirements: requirements.map((item) => item.slice(0, BRIEF_LIMITS.item)),
      acceptanceCriteria: acceptance.map((item) => item.slice(0, BRIEF_LIMITS.item)),
    },
  };
}

/** The activity data_json fields a brief is stored as. */
export function briefData(brief: BriefInput): Record<string, unknown> {
  return {
    description: brief.description ?? null,
    requirements: brief.requirements ?? [],
    acceptance_criteria: brief.acceptanceCriteria ?? [],
  };
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** Newest brief per card, for cards of these clients. Cards with none are left out (use EMPTY_BRIEF). */
export async function cardBriefs(sql: Sql, input: { organizationIds: string[]; taskIds: string[] }): Promise<Map<string, CardBrief>> {
  const out = new Map<string, CardBrief & { at: number }>();
  if (!input.taskIds.length || !input.organizationIds.length) return new Map();
  const orgMarks = input.organizationIds.map(() => "?").join(", ");
  for (let start = 0; start < input.taskIds.length; start += 80) {
    const chunk = input.taskIds.slice(start, start + 80);
    const rows = await sql.all<{ task_id: string; actor_id: string | null; data_json: string; created_at: number }>(
      `SELECT json_extract(data_json, '$.task_id') AS task_id, actor_id, data_json, created_at FROM activities
       WHERE organization_id IN (${orgMarks}) AND kind = 'client_agent.board'
         AND json_extract(data_json, '$.action') IN ('create', 'describe')
         AND json_extract(data_json, '$.task_id') IN (${chunk.map(() => "?").join(", ")})
       ORDER BY created_at, rowid`,
      [...input.organizationIds, ...chunk],
    );
    for (const row of rows) {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(row.data_json) as Record<string, unknown>;
      } catch {
        continue;
      }
      const description = cleanText(data.description, BRIEF_LIMITS.description) ?? (data.action === "create" ? cleanText(data.note, BRIEF_LIMITS.description) : null);
      const requirements = strings(data.requirements);
      const acceptance = strings(data.acceptance_criteria);
      if (!description && !requirements.length && !acceptance.length) continue;
      const previous = out.get(row.task_id);
      if (previous && previous.at > row.created_at) continue;
      out.set(row.task_id, {
        description,
        requirements,
        acceptance_criteria: acceptance,
        described_by: row.actor_id,
        described_at: new Date(row.created_at).toISOString(),
        at: row.created_at,
      });
    }
  }
  return new Map(
    [...out.entries()].map(([id, entry]) => [
      id,
      { description: entry.description, requirements: entry.requirements, acceptance_criteria: entry.acceptance_criteria, described_by: entry.described_by, described_at: entry.described_at },
    ]),
  );
}
