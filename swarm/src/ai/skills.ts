/**
 * Loads the full SKILL.md body for a pack node from the `handoff-skills` R2
 * bucket (published by handoff/scripts/publish-skills.ts), so agents execute
 * the skill instead of improvising from its one-line description.
 */

export const SKILL_BODY_LIMIT = 24000;

export interface LoadedSkill {
  path: string;
  body: string;
}

interface SkillBucket {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
}

const SKILL_PATH_RE = /(?:\.cursor\/)?skills\/[^\s"'`]+?\/SKILL\.md/;

export function skillPathFromInstructions(instructions: string): string | null {
  return instructions.match(SKILL_PATH_RE)?.[0] ?? null;
}

/** Mirrors skillObjectKey in handoff/src/lib/skill-library.ts. */
export function skillObjectKey(path: string): string | null {
  const relative = path.replace(/^\.cursor\/skills\//, '').replace(/^skills\//, '');
  if (!relative.endsWith('/SKILL.md') && relative !== 'SKILL.md') return null;
  if (relative.split('/').some((part) => part === '..' || part === '')) return null;
  return `skills/${relative}`;
}

export function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
}

export async function loadSkill(
  bucket: SkillBucket | undefined,
  instructions: string,
): Promise<LoadedSkill | null> {
  const path = skillPathFromInstructions(instructions);
  if (!path) return null;

  const key = skillObjectKey(path);
  if (!key) throw new Error(`Invalid skill path in node instructions: ${path}`);
  if (!bucket) {
    throw new Error(`Node references ${path} but the swarm Worker has no SKILLS R2 binding.`);
  }

  const object = await bucket.get(key);
  if (!object) {
    throw new Error(
      `Skill ${path} is not published to R2 (key ${key}). Run "npm run publish:skills" in handoff/ and retry.`,
    );
  }

  let body = stripFrontmatter(await object.text());
  if (body.length > SKILL_BODY_LIMIT) {
    body = `${body.slice(0, SKILL_BODY_LIMIT)}\n\n[skill truncated]`;
  }
  return { path, body };
}

/**
 * Downstream nodes keep the original brief next to upstream output, so skills
 * can ground their work in the brief's pain points rather than a paraphrase.
 */
export function composeNodeInput(brief: string, parentOutputs: string[]): string {
  if (parentOutputs.length === 0) return brief;
  return `Original brief:\n${brief}\n\n===\n\nUpstream output:\n${parentOutputs.join('\n\n---\n\n')}`;
}
