export const SPECIALIST_ASSIGNMENT_LIMIT = 24_000;
const EXCERPT_LIMIT = 1_500;
const SECTION_START = /^(facts|do not use|voice|answers|job|skill|shape):/i;

/** The body of one labeled section in a brief, stopping at the next known label. */
export function labeledSection(brief: string, label: string): string {
  const lines = brief.split("\n");
  const start = lines.findIndex((line) => line.toLowerCase().startsWith(`${label.toLowerCase()}:`));
  if (start < 0) return "";
  const first = lines[start]!.slice(label.length + 1).trim();
  const rest: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (SECTION_START.test(line)) break;
    rest.push(line);
  }
  return [first, ...rest].filter((line) => line.length > 0).join("\n").trim();
}

/** The brief with the named sections removed, so they are not repeated in the assignment. */
export function withoutSections(brief: string, labels: string[]): string {
  const names = labels.map((label) => `${label.toLowerCase()}:`);
  const kept: string[] = [];
  let skipping = false;
  for (const line of brief.split("\n")) {
    if (SECTION_START.test(line)) skipping = names.some((name) => line.toLowerCase().startsWith(name));
    if (!skipping) kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function stripFrontmatter(body: string): string {
  const match = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(body);
  return match ? body.slice(match[0].length).trimStart() : body;
}

/** The first 1500 characters of a skill file after its frontmatter. A path that leaves the library is ignored. */
export async function readSkillExcerpt(
  skillPath: string | null | undefined,
  readSkill?: (skillPath: string) => Promise<string | null>,
): Promise<string> {
  const relative = skillPath?.trim() ?? "";
  if (!relative.endsWith("SKILL.md") || relative.includes("..")) return "";
  if (!readSkill) return "";
  const body = await readSkill(relative);
  return stripFrontmatter(body ?? "").slice(0, EXCERPT_LIMIT);
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
  answers?: string;
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
    input.answers?.trim() ? `Answers:\n${input.answers.trim()}` : "",
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
