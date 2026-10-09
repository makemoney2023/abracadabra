import { OPENING_PACK_ID } from "./pack-templates";

export type PackCandidate = {
  id: string;
  name: string;
  description: string;
};

export type PackLead = {
  name?: string | null;
  industry?: string | null;
  notes?: string | null;
};

const STOP = new Set(["the", "and", "for", "with", "pack", "skills", "chain", "this", "from", "that", "into"]);

function words(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOP.has(word));
}

/** Packs the live swarm can run. Pipeline templates stay out of the picker. */
export function packsFromTemplates(payload: unknown): PackCandidate[] {
  const rows = Array.isArray(payload) ? payload : [];
  const packs: PackCandidate[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const id = "id" in row && typeof row.id === "string" ? row.id : "";
    if (!id.startsWith("pack-")) continue;
    const name = "name" in row && typeof row.name === "string" && row.name.trim() ? row.name.trim() : id;
    const description = "description" in row && typeof row.description === "string" ? row.description : name;
    packs.push({ id, name, description });
  }
  return packs;
}

/** One pack for a task. No overlap returns null. Schema readiness is not a fallback. */
export function pickTaskPack(text: string, packs: PackCandidate[]): { id: string; name: string } | null {
  const taskWords = new Set(words(text));
  let best: { id: string; name: string; score: number } | null = null;
  for (const pack of packs) {
    let score = 0;
    for (const word of words(`${pack.name} ${pack.description}`)) {
      if (taskWords.has(word)) score += 1;
    }
    if (score <= 0) continue;
    const earlier = best !== null && score === best.score && pack.name.localeCompare(best.name) < 0;
    if (!best || score > best.score || earlier) best = { id: pack.id, name: pack.name, score };
  }
  return best ? { id: best.id, name: best.name } : null;
}

/** A model reply is a pack id only when that id is in the live list. */
export function packIdFromModel(raw: string, packs: PackCandidate[]): string | null {
  const text = raw.trim();
  const ids = new Set(packs.map((pack) => pack.id));
  if (ids.has(text)) return text;
  try {
    const parsed = JSON.parse(text) as { id?: unknown };
    if (typeof parsed.id === "string" && ids.has(parsed.id)) return parsed.id;
  } catch {
    // The model often returns the id as a sentence.
  }
  const match = text.match(/pack-[a-z0-9-]+/i);
  return match && ids.has(match[0]) ? match[0] : null;
}

/** The model's id when it is real. Otherwise the word overlap, or null. */
export function choosePackId(modelText: string, taskText: string, packs: PackCandidate[]): string | null {
  return packIdFromModel(modelText, packs) ?? pickTaskPack(taskText, packs)?.id ?? null;
}

/** The pack whose skills match the lead. No overlap keeps the schema readiness pack. */
export function pickSkillPack(lead: PackLead, packs: PackCandidate[]): { id: string; name: string } {
  const leadWords = new Set(words([lead.industry, lead.notes, lead.name].filter((part) => part && part.trim()).join(" ")));
  let best = { id: OPENING_PACK_ID, name: "Schema readiness", score: 0 };
  for (const pack of packs) {
    if (pack.id === OPENING_PACK_ID) continue;
    let score = 0;
    for (const word of words(`${pack.name} ${pack.description}`)) {
      if (leadWords.has(word)) score += 1;
    }
    const earlier = score === best.score && score > 0 && pack.name.localeCompare(best.name) < 0;
    if (score > best.score || earlier) best = { id: pack.id, name: pack.name, score };
  }
  return { id: best.id, name: best.name };
}
