import type { AgentType } from '../types';
import { formatToolsForPrompt, type McpToolDef } from '../mcp/client';
import { MODEL_STEP_TIMEOUT_MS, STEP_TIMEOUT_MESSAGE, shouldTryNextModel, withStepTimeout } from '../do/resume';
import { providerError } from './check';
import type { LoadedSkill } from './skills';

/** Workers AI defaults to 256 output tokens, which truncates skill deliverables. */
export const MAX_OUTPUT_TOKENS = 4096;
const MAX_OUTPUT_CHARS = 16000;

interface AgentRunOptions {
  input: string;
  instructions: string;
  name: string;
  onToken?: (token: string) => void;
  /** Tools exposed by the workflow's MCP servers for this node. */
  mcpTools?: McpToolDef[];
  executeTool?: (serverId: string, tool: string, args: Record<string, unknown>) => Promise<string>;
  onToolEvent?: (e: { server: string; tool: string; phase: 'call' | 'result'; summary?: string }) => void;
  maxToolRounds?: number;
  /** Full skill body loaded from R2 when the node's instructions reference a SKILL.md. */
  skill?: LoadedSkill | null;
  /** Research must call Parallel through function calling. */
  requireParallel?: boolean;
}

export interface AgentResult {
  output: string;
  toolsUsed: { server: string; tool: string }[];
  status?: 'completed' | 'tool_failed' | 'model_failed';
}

/** Every specialist. A thrown call retries once on the second model. */
export function specialistModels(): readonly string[] {
  return ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/zai-org/glm-4.7-flash'];
}

const MODELS = specialistModels();

function extractToken(parsed: any): string {
  if (!parsed || typeof parsed !== 'object') return '';
  if (typeof parsed.response === 'string') return parsed.response;
  const choice = parsed.choices?.[0];
  const delta = choice?.delta?.content;
  if (typeof delta === 'string') return delta;
  const message = choice?.message?.content;
  if (typeof message === 'string') return message;
  return '';
}

async function runModelStream(model: string, messages: any[], env: any, onToken?: (token: string) => void): Promise<string> {
  return withStepTimeout(readModelStream(model, messages, env, onToken), MODEL_STEP_TIMEOUT_MS, STEP_TIMEOUT_MESSAGE);
}

async function readModelStream(model: string, messages: any[], env: any, onToken?: (token: string) => void): Promise<string> {
  const stream = await env.AI.run(model, { messages, stream: true, max_tokens: MAX_OUTPUT_TOKENS });
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let fullOutput = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));

    for (const line of lines) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;

      try {
        const token = extractToken(JSON.parse(data));
        if (token) {
          fullOutput += token;
          onToken?.(token);
        }
      } catch {
        // skip malformed chunks
      }
    }
  }

  return fullOutput.trim();
}

async function runModelOnce(model: string, messages: any[], env: any): Promise<string> {
  return withStepTimeout(readModelOnce(model, messages, env), MODEL_STEP_TIMEOUT_MS, STEP_TIMEOUT_MESSAGE);
}

async function readModelOnce(model: string, messages: any[], env: any): Promise<string> {
  const response = await env.AI.run(model, { messages, max_tokens: MAX_OUTPUT_TOKENS });
  const output = extractToken(response)?.trim();
  if (!output) {
    throw new Error(`Model ${model} returned no output.`);
  }
  return output;
}
export async function runAgent(type: AgentType, options: AgentRunOptions, env: any): Promise<AgentResult> {
  const { input, instructions, name, onToken, skill } = options;

  if (!env || !env.AI) {
    throw new Error('Workers AI binding is not available.');
  }

  const tools = options.mcpTools ?? [];
  const canUseTools = tools.length > 0 && typeof options.executeTool === 'function';

  const systemPrompt = buildSystemPrompt(type, name, instructions, skill)
    + (canUseTools ? buildToolPrompt(tools) : '');
  const userPrompt = buildUserPrompt(type, input, skill);

  // Fast path: no tools — preserve the original stream-first behavior.
  if (!canUseTools) {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    let lastError: unknown = new Error('No models configured.');

    for (const model of MODELS) {
      try {
        const streamed = await runModelStream(model, messages, env, onToken);
        if (streamed && !providerError(streamed)) {
          return { output: finalAnswer(streamed), toolsUsed: [] };
        }
        if (streamed) lastError = new Error(streamed);
      } catch (error) {
        if (!shouldTryNextModel(error)) throw error;
        lastError = error;
      }

      try {
        const output = await runModelOnce(model, messages, env);
        if (!providerError(output)) return { output: finalAnswer(output), toolsUsed: [] };
        lastError = new Error(output);
      } catch (error) {
        if (!shouldTryNextModel(error)) throw error;
        lastError = error;
      }
    }

    const message = lastError instanceof Error && providerError(lastError.message) ? lastError.message : 'The model did not answer.';
    return { output: message, toolsUsed: [], status: 'model_failed' };
  }

  // Tool path: native function calls. A printed tool-call block is not a call.
  return runToolLoop(type, options, env, systemPrompt, userPrompt, tools);
}

async function runToolLoop(
  _type: AgentType,
  options: AgentRunOptions,
  env: any,
  systemPrompt: string,
  userPrompt: string,
  tools: McpToolDef[],
): Promise<AgentResult> {
  const { onToken, executeTool, onToolEvent } = options;
  const maxRounds = Math.max(1, Math.min(options.maxToolRounds ?? 4, 8));
  const toolsUsed: { server: string; tool: string }[] = [];
  const seen = new Set<string>();

  const messages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const recordUse = (server: string, tool: string) => {
    const key = `${server}/${tool}`;
    if (!seen.has(key)) {
      seen.add(key);
      toolsUsed.push({ server, tool });
    }
  };

  if (options.requireParallel && !tools.some((tool) => /parallel/i.test(`${tool.name} ${tool.serverName}`))) {
    return { output: 'Parallel Search is not available.', toolsUsed, status: 'tool_failed' };
  }

  for (let round = 1; round <= maxRounds; round++) {
    let response: any;
    try {
      response = await runOnceRaw(messages, env, tools);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The model did not answer.';
      if (toolsUsed.length > 0 && providerError(message)) {
        const page = await pageFromReply('', messages, env, true);
        if (page.ok) return { output: finalize(page.text, onToken), toolsUsed, status: 'completed' };
        return { output: page.message, toolsUsed, status: 'model_failed' };
      }
      return { output: message, toolsUsed, status: 'model_failed' };
    }
    const text = extractToken(response) || (typeof response === 'string' ? response : '');
    const calls = nativeToolCalls(response, tools).slice(0, 3);
    if (calls.length === 0) {
      if (options.requireParallel && toolsUsed.length === 0) {
        return { output: 'Parallel Search was not called.', toolsUsed, status: 'tool_failed' };
      }
      const page = await pageFromReply(text, messages, env, toolsUsed.length > 0);
      if (page.ok) return { output: finalize(page.text, onToken), toolsUsed, status: 'completed' };
      return { output: page.message, toolsUsed, status: 'model_failed' };
    }

    messages.push({ role: 'assistant', content: text || JSON.stringify(calls) });
    for (const call of calls) {
      onToolEvent?.({ server: call.server, tool: call.tool, phase: 'call' });
      try {
        const observation = await executeTool!(call.server, call.tool, call.args);
        recordUse(call.server, call.tool);
        onToolEvent?.({ server: call.server, tool: call.tool, phase: 'result', summary: observation.slice(0, 160) });
        messages.push({ role: 'user', content: `Observation from ${call.server}/${call.tool}:\n${observation.slice(0, 3500)}` });
      } catch (e: any) {
        const msg = e?.message || 'Tool execution failed.';
        onToolEvent?.({ server: call.server, tool: call.tool, phase: 'result', summary: `ERROR: ${msg}` });
        return { output: `Tool ${call.tool} failed: ${msg}`, toolsUsed, status: 'tool_failed' };
      }
    }
  }

  const page = await pageFromReply('', messages, env, true);
  if (!page.ok) return { output: page.message, toolsUsed, status: 'model_failed' };
  return { output: finalize(page.text, onToken), toolsUsed, status: 'completed' };
}

/** A reply that is only a tool call is not a page. After a real tool result, ask once more with tools closed. */
async function pageFromReply(
  text: string,
  messages: { role: string; content: string }[],
  env: any,
  allowRetry: boolean,
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  try {
    const page = finalAnswer(text);
    if (providerError(page)) throw new Error(page);
    return { ok: true, text: page };
  } catch (error) {
    if (!allowRetry) {
      return { ok: false, message: error instanceof Error ? error.message : 'The model did not answer.' };
    }
  }
  const observations = messages
    .filter((message) => message.role === 'user' && message.content.startsWith('Observation from '))
    .map((message) => message.content)
    .join('\n\n');
  const next = [
    { role: 'system', content: 'Return one JSON value and nothing else. Do not call a tool. Do not emit [TOOL_CALL] blocks.' },
    {
      role: 'user',
      content: `${clip(messages[1]?.content ?? '', 6000)}\n\nTool results you already have:\n${clip(observations, 3000)}\n\nWrite the JSON page now from these results. Do not call a tool. Do not emit [TOOL_CALL] blocks.`,
    },
  ];
  let lastError: unknown = new Error('The step ended on a tool call and did not write an answer.');
  for (const model of MODELS) {
    try {
      const page = finalAnswer(await runModelOnce(model, next, env));
      if (providerError(page)) {
        lastError = new Error(page);
        continue;
      }
      return { ok: true, text: page };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('The step ended on a tool call')) {
        lastError = error;
        continue;
      }
      if (!shouldTryNextModel(error)) {
        return { ok: false, message: error instanceof Error ? error.message : 'The model did not answer.' };
      }
      lastError = error;
    }
  }
  return { ok: false, message: lastError instanceof Error ? lastError.message : 'The model did not answer.' };
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n[truncated]`;
}

function nativeToolCalls(response: any, tools: McpToolDef[]): { server: string; tool: string; args: Record<string, unknown> }[] {
  const listed = response?.tool_calls ?? response?.choices?.[0]?.message?.tool_calls ?? [];
  if (!Array.isArray(listed)) return [];
  const calls = [];
  for (const call of listed) {
    const name = call?.name ?? call?.function?.name;
    if (typeof name !== 'string') continue;
    const match = tools.find((tool) => tool.name === name);
    if (!match) continue;
    const args = call.arguments ?? call.function?.arguments ?? {};
    calls.push({
      server: match.serverId,
      tool: match.name,
      args: typeof args === 'string' ? safeJson(args) : (args as Record<string, unknown>),
    });
  }
  return calls;
}

function safeJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function runOnceRaw(messages: { role: string; content: string }[], env: any, tools: McpToolDef[]): Promise<any> {
  let lastError: unknown = new Error('No models configured.');
  for (const model of MODELS) {
    try {
      return await env.AI.run(model, {
        messages,
        max_tokens: MAX_OUTPUT_TOKENS,
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description ?? tool.name,
          parameters: tool.inputSchema ?? { type: 'object', properties: {} },
        })),
      });
    } catch (error) {
      if (!shouldTryNextModel(error)) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Agent failed to produce output.');
}

/** Prose after tool-call blocks are removed. A call with no answer is not a deliverable. */
export function finalAnswer(text: string): string {
  const clean = text.replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/g, '').trim();
  if (!clean) {
    throw new Error('The step ended on a tool call and did not write an answer.');
  }
  return clean.slice(0, MAX_OUTPUT_CHARS);
}

/** Strip leaked tool-call blocks, cap length, and stream to the UI in chunks. */
function finalize(text: string, onToken?: (token: string) => void): string {
  const output = finalAnswer(text);
  if (onToken) {
    for (let i = 0; i < output.length; i += 48) {
      onToken(output.slice(i, i + 48));
    }
  }
  return output;
}

function buildToolPrompt(tools: McpToolDef[]): string {
  return `

You can access live external data through MCP tools. When you need facts, data, or actions beyond your training, call a tool. You may call up to 3 tools per round for at most a few rounds — then write your final answer.

Available tools:
${formatToolsForPrompt(tools)}

The tool interface calls these for you. After an observation, write the deliverable. Do not print [TOOL_CALL] blocks.

Rules:
- Use only the listed tools.
- After each tool call you will receive an Observation — use it in the deliverable.
- When you have enough information, write the deliverable and stop.`;
}

export function buildSystemPrompt(type: AgentType, name: string, instructions: string, skill?: LoadedSkill | null): string {
  const roleMap: Record<AgentType, string> = {
    researcher: 'an expert researcher who gathers and synthesizes information',
    writer: 'a skilled writer who creates clear, engaging content',
    editor: 'a meticulous editor who polishes and improves content',
    publisher: 'a publication specialist who formats content for its final audience',
    critic: 'a constructive critic who identifies weaknesses and opportunities',
    summarizer: 'a concise summarizer who distills complex information',
  };

  if (skill) {
    return `You are ${name}, ${roleMap[type]}. ${instructions}

You are executing the skill below (${skill.path}). It is your operating procedure, not reference material.

<skill>
${skill.body}
</skill>

Rules:
- Execute every step of the skill, in order, against the brief and upstream input you receive
- Produce the skill's actual deliverables (with the formats, platform specs, limits, and checks it requires) — never summarize, paraphrase, or describe the skill
- Ground every angle, claim, and example in specifics from the brief (audience, pain points, offer, constraints); no generic placeholders
- Where the skill requires checks (e.g. character limits), show the check results
- Return only the deliverables, no meta-commentary
- If the brief says Return JSON only, that overrides the skill's prose format and any step that says to ask a question. The whole answer is that JSON value`;
  }

  return `You are ${name}, ${roleMap[type]}. ${instructions}

Rules:
- Stay focused on your specific role
- Build on the input you receive
- Be concise but thorough
- Return only your final output, no meta-commentary`;
}

export function buildUserPrompt(type: AgentType, input: string, skill?: LoadedSkill | null): string {
  if (skill) {
    const jsonOnly = input.includes('Return JSON only.');
    const rule = jsonOnly
      ? '\n\nYour entire reply is one JSON value. No headings, no questions, and no tool-error text.'
      : '';
    return `Execute the skill step by step on the following input and produce its complete deliverables:\n\n${input}${rule}`;
  }

  const actionMap: Record<AgentType, string> = {
    researcher: 'Research the following topic and provide comprehensive findings:',
    writer: 'Write content based on the following input:',
    editor: 'Review and improve the following content:',
    publisher: 'Format the following content for publication:',
    critic: 'Critically analyze the following content:',
    summarizer: 'Summarize the following content:',
  };

  return `${actionMap[type]}\n\n${input}`;
}
