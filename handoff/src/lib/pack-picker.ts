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
