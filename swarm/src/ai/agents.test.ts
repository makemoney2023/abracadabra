import { describe, expect, it } from 'vitest';
import { MAX_OUTPUT_TOKENS, buildSystemPrompt, buildUserPrompt, finalAnswer, runAgent, specialistModels } from './agents';

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

describe('finalAnswer', () => {
  it('drops a tool call and keeps the prose around it', () => {
    const answer = finalAnswer('Finding.\n[TOOL_CALL]{"server":"portal","tool":"parallel-search_web_search","arguments":{}}[/TOOL_CALL]\nDone.');
    expect(answer).toContain('Finding.');
    expect(answer).toContain('Done.');
    expect(answer).not.toContain('TOOL_CALL');
  });

  it('rejects a step whose only output is a tool call', () => {
    expect(() =>
      finalAnswer('[TOOL_CALL]{"server":"portal","tool":"parallel-search_web_search","arguments":{"q":"buyers"}}[/TOOL_CALL]'),
    ).toThrow(/tool call/i);
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

  it('uses Llama 3.3 70B and one GLM retry', () => {
    expect(specialistModels()).toEqual([
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      '@cf/zai-org/glm-4.7-flash',
    ]);
    expect(specialistModels().join(' ')).not.toContain('llama-3.1-8b');
    expect(specialistModels().join(' ')).not.toContain('llama-3.2-3b');
  });

  it('stops when Parallel is missing or the tool throws', async () => {
    const env = { AI: { run: async () => ({ response: '[TOOL_CALL]{"tool":"parallel_search"}[/TOOL_CALL]\nInvented.' }) } };
    const missing = await runAgent('researcher', {
      input: 'brief',
      instructions: 'search',
      name: 'research',
      requireParallel: true,
      mcpTools: [{ serverId: 'portal', serverName: 'portal', name: 'other_tool' }],
      executeTool: async () => 'nope',
    }, env);
    expect(missing.status).toBe('tool_failed');
    expect(missing.output).not.toMatch(/what you know/i);
    const printed = await runAgent('researcher', {
      input: 'brief',
      instructions: 'search',
      name: 'research',
      requireParallel: true,
      mcpTools: [{ serverId: 'portal', serverName: 'Parallel', name: 'parallel_search' }],
      executeTool: async () => 'unused',
    }, env);
    expect(printed.status).toBe('tool_failed');

    let calls = 0;
    const throwing = {
      AI: {
        run: async () => {
          calls += 1;
          return { tool_calls: [{ name: 'parallel_search', arguments: { q: 'ottawa' } }] };
        },
      },
    };
    const failed = await runAgent('researcher', {
      input: 'brief',
      instructions: 'search',
      name: 'research',
      requireParallel: true,
      mcpTools: [{ serverId: 'portal', serverName: 'Parallel', name: 'parallel_search' }],
      executeTool: async () => {
        throw new Error('Parallel is down');
      },
    }, throwing);
    expect(failed.status).toBe('tool_failed');
    expect(failed.output).not.toMatch(/what you know/i);
    expect(calls).toBe(1);
  });

  it('writes the page after a tool when the next reply is only a tool call', async () => {
    let round = 0;
    const env = {
      AI: {
        run: async (_model: string, params: { tools?: unknown }) => {
          round += 1;
          if (params.tools) {
            if (round === 1) return { tool_calls: [{ name: 'parallel_search', arguments: { q: 'ottawa' } }] };
            return { response: '[TOOL_CALL]{"tool":"parallel_search","arguments":{"q":"again"}}[/TOOL_CALL]' };
          }
          return { response: '[{"name":"Ottawa","fact":"Open Sunday","source":"https://ottawa.example"}]' };
        },
      },
    };
    const result = await runAgent('researcher', {
      input: 'brief',
      instructions: 'search',
      name: 'research',
      requireParallel: true,
      mcpTools: [{ serverId: 'portal', serverName: 'Parallel', name: 'parallel_search' }],
      executeTool: async () => 'Open Sunday. https://ottawa.example',
    }, env);
    expect(result.status).toBe('completed');
    expect(result.output).toContain('Open Sunday');
    expect(result.toolsUsed).toEqual([{ server: 'portal', tool: 'parallel_search' }]);
  });

  it('falls back to the next model when the closed-tools reply is still a tool call', async () => {
    const seen: { model: string; prompt: string }[] = [];
    const env = {
      AI: {
        run: async (model: string, params: { tools?: unknown; messages: { content: string }[] }) => {
          if (params.tools) {
            if (!seen.length && !params.messages.some((m) => m.content.startsWith('Observation from'))) {
              return { tool_calls: [{ name: 'parallel_search', arguments: { q: 'ottawa' } }] };
            }
            return { response: '[TOOL_CALL]{"tool":"parallel_search","arguments":{"q":"again"}}[/TOOL_CALL]' };
          }
          seen.push({ model, prompt: params.messages.map((m) => m.content).join('\n') });
          if (seen.length === 1) return { response: '[TOOL_CALL]{"tool":"parallel_search"}[/TOOL_CALL]' };
          return { response: '[{"name":"Ottawa","fact":"Open Sunday","source":"https://ottawa.example"}]' };
        },
      },
    };
    const result = await runAgent('researcher', {
      input: 'brief',
      instructions: 'search',
      name: 'research',
      requireParallel: true,
      mcpTools: [{ serverId: 'portal', serverName: 'Parallel', name: 'parallel_search' }],
      executeTool: async () => 'Open Sunday. https://ottawa.example',
    }, env);
    expect(result.status).toBe('completed');
    expect(result.output).toContain('Open Sunday');
    expect(seen.map((call) => call.model)).toEqual(specialistModels());
    expect(seen[0].prompt).toContain('Tool results you already have');
    expect(seen[0].prompt).toContain('Open Sunday. https://ottawa.example');
  });

  it('returns model_failed when both specialist models throw', async () => {
    const env = { AI: { run: async () => { throw new Error('down'); } } };
    const result = await runAgent('writer', { input: 'brief', instructions: 'x', name: 'n' }, env);
    expect(result.status).toBe('model_failed');
  });
});
