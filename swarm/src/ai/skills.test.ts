import { describe, expect, it } from 'vitest';
import {
  SKILL_BODY_LIMIT,
  composeNodeInput,
  loadSkill,
  skillObjectKey,
  skillPathFromInstructions,
  stripFrontmatter,
} from './skills';

function bucketWith(objects: Record<string, string>) {
  return {
    async get(key: string) {
      if (!(key in objects)) return null;
      return { text: async () => objects[key] };
    },
  };
}

describe('skillPathFromInstructions', () => {
  it('finds the SKILL.md path in pack node instructions', () => {
    expect(
      skillPathFromInstructions(
        'Follow .cursor/skills/community/marketingskills/skills/ad-creative/SKILL.md. Generate ad creative.',
      ),
    ).toBe('.cursor/skills/community/marketingskills/skills/ad-creative/SKILL.md');
  });

  it('returns null when no skill is referenced', () => {
    expect(skillPathFromInstructions('Write a blog post about cats.')).toBeNull();
  });
});

describe('skillObjectKey', () => {
  it('maps a workspace path to the published R2 key', () => {
    expect(skillObjectKey('.cursor/skills/a/b/SKILL.md')).toBe('skills/a/b/SKILL.md');
    expect(skillObjectKey('skills/a/SKILL.md')).toBe('skills/a/SKILL.md');
  });

  it('rejects unsafe or non-skill paths', () => {
    expect(skillObjectKey('.cursor/skills/../secrets/SKILL.md')).toBeNull();
    expect(skillObjectKey('.cursor/skills/a/README.md')).toBeNull();
  });
});

describe('stripFrontmatter', () => {
  it('removes YAML frontmatter', () => {
    expect(stripFrontmatter('---\nname: x\n---\n# Body\nstep 1')).toBe('# Body\nstep 1');
  });

  it('leaves bodies without frontmatter alone', () => {
    expect(stripFrontmatter('# Body')).toBe('# Body');
  });
});

describe('loadSkill', () => {
  const instructions = 'Follow .cursor/skills/m/ad-creative/SKILL.md. Generate ads.';

  it('loads the full skill body from the bucket', async () => {
    const bucket = bucketWith({ 'skills/m/ad-creative/SKILL.md': '---\nname: ad\n---\n## Step 1\nCheck limits' });
    expect(await loadSkill(bucket, instructions)).toEqual({
      path: '.cursor/skills/m/ad-creative/SKILL.md',
      body: '## Step 1\nCheck limits',
    });
  });

  it('caps very long skill bodies', async () => {
    const bucket = bucketWith({ 'skills/m/ad-creative/SKILL.md': 'x'.repeat(SKILL_BODY_LIMIT + 500) });
    const skill = await loadSkill(bucket, instructions);
    expect(skill!.body.length).toBeLessThanOrEqual(SKILL_BODY_LIMIT + 40);
    expect(skill!.body).toContain('[skill truncated]');
  });

  it('returns null for nodes that do not reference a skill', async () => {
    expect(await loadSkill(bucketWith({}), 'Write a post.')).toBeNull();
  });

  it('fails loudly when the skill is not published', async () => {
    await expect(loadSkill(bucketWith({}), instructions)).rejects.toThrow(/publish:skills/);
  });

  it('fails loudly when the SKILLS binding is missing', async () => {
    await expect(loadSkill(undefined, instructions)).rejects.toThrow(/SKILLS/);
  });
});

describe('composeNodeInput', () => {
  it('passes the brief straight through to root nodes', () => {
    expect(composeNodeInput('the brief', [])).toBe('the brief');
  });

  it('keeps the original brief alongside upstream output', () => {
    const out = composeNodeInput('the brief', ['research A', 'research B']);
    expect(out).toContain('Original brief:\nthe brief');
    expect(out).toContain('research A\n\n---\n\nresearch B');
  });
});
