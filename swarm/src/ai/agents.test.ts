import { describe, expect, it } from 'vitest';
import { MAX_OUTPUT_TOKENS, buildSystemPrompt, buildUserPrompt, runAgent } from './agents';

const skill = { path: '.cursor/skills/m/ad-creative/SKILL.md', body: '## Step 1\nCheck platform character limits.' };

describe('buildSystemPrompt', () => {
  it('embeds the full skill body and demands step-by-step execution', () => {
    const prompt = buildSystemPrompt('writer', 'Ad Creative', 'Follow the skill.', skill);
    expect(prompt).toContain('Check platform character limits.');
    expect(prompt).toContain(skill.path);
    expect(prompt).toMatch(/execute every step/i);
    expect(prompt).not.toMatch(/be concise/i);
  });

  it('keeps the generic role prompt for nodes without a skill', () => {
    const prompt = buildSystemPrompt('critic', 'Critic', 'Review it.');
    expect(prompt).toContain('constructive critic');
    expect(prompt).not.toContain('SKILL');
  });
});

describe('buildUserPrompt', () => {
  it('asks skill nodes for deliverables rather than a summary', () => {
    const prompt = buildUserPrompt('writer', 'the brief', skill);
    expect(prompt).toMatch(/deliverables/i);
    expect(prompt).toContain('the brief');
  });

  it('uses the role action for nodes without a skill', () => {
    expect(buildUserPrompt('summarizer', 'text')).toBe('Summarize the following content:\n\ntext');
  });
});

describe('runAgent', () => {
  it('requests a large output budget instead of the 256-token default', async () => {
    const calls: any[] = [];
    const env = {
      AI: {
        run: async (_model: string, params: any) => {
          calls.push(params);
          if (params.stream) throw new Error('no stream');
          return { response: 'done' };
        },
      },
    };
    const result = await runAgent('writer', { input: 'brief', instructions: 'x', name: 'n', skill }, env);
    expect(result.output).toBe('done');
    expect(calls.every((p) => p.max_tokens === MAX_OUTPUT_TOKENS)).toBe(true);
    expect(calls[0].messages[0].content).toContain('Check platform character limits.');
  });
});
