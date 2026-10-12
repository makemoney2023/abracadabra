export const SPECIALIST_ASSIGNMENT_LIMIT = 24_000;
const EXCERPT_LIMIT = 1_500;

/** The first 1500 characters of a skill file. A path that leaves the library is ignored. */
export async function readSkillExcerpt(
  skillPath: string | null | undefined,
  readSkill?: (skillPath: string) => Promise<string | null>,
): Promise<string> {
  const relative = skillPath?.trim() ?? "";
  if (!relative.endsWith("SKILL.md") || relative.includes("..")) return "";
  if (!readSkill) return "";
  const body = await readSkill(relative);
  return (body ?? "").slice(0, EXCERPT_LIMIT);
}

export function buildSpecialistAssignment(input: {
  job: string;
  skillPath: string;
  shape: string;
  excerpt?: string;
  facts?: string;
  banned?: string;
  voice?: string;
  handoff?: string;
  rejected?: string;
}): string {
  const excerpt = (input.excerpt ?? "").trim().slice(0, EXCERPT_LIMIT);
  const head = [
    `Job: ${input.job.trim()}`,
    `Skill: ${input.skillPath.trim()}`,
    `Shape: ${input.shape.trim()}`,
    excerpt ? `Skill notes:\n${excerpt}` : "",
    input.facts?.trim() ? `Facts:\n${input.facts.trim()}` : "",
    input.banned?.trim() ? `Do not use:\n${input.banned.trim()}` : "",
    input.voice?.trim() ? `Voice:\n${input.voice.trim()}` : "",
  ].filter((line) => line.length > 0);
  const tail = "Return JSON only.";
  const prefix = head.join("\n\n");
  const handoff = input.handoff?.trim() ?? "";
  if (!handoff) {
    const text = [prefix, tail].filter((line) => line.length > 0).join("\n\n");
    return text.length > SPECIALIST_ASSIGNMENT_LIMIT ? text.slice(0, SPECIALIST_ASSIGNMENT_LIMIT) : text;
  }
  const label = "Accepted page:\n";
  const room = SPECIALIST_ASSIGNMENT_LIMIT - prefix.length - label.length - tail.length - 4;
  const clipped = clipJson(handoff, Math.max(0, room));
  const text = `${prefix}\n\n${label}${clipped}\n\n${tail}`;
  return text.length > SPECIALIST_ASSIGNMENT_LIMIT ? text.slice(0, SPECIALIST_ASSIGNMENT_LIMIT) : text;
}

function clipJson(value: string, room: number): string {
  if (value.length <= room) return value;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return `${value.slice(0, room)}\n\nrows omitted`;
    const kept = [];
    let used = 2;
    for (const row of parsed) {
      const next = JSON.stringify(row);
      if (used + next.length + 1 > room) break;
      kept.push(row);
      used += next.length + 1;
    }
    const omitted = parsed.length - kept.length;
    return `${JSON.stringify(kept)}\n\n${omitted} rows omitted`;
  } catch {
    return `${value.slice(0, room)}\n\nrows omitted`;
  }
}
