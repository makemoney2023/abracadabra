import type { AgentType } from '../types';
import { formatToolsForPrompt, parseToolCalls, type McpToolDef } from '../mcp/client';

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
}

export interface AgentResult {
  output: string;
  toolsUsed: { server: string; tool: string }[];
}

// Primary model first, then fallbacks if a model is unavailable or deprecated.
const MODELS = [
  '@cf/meta/llama-3.1-8b-instruct-fp8',
  '@cf/zai-org/glm-4.7-flash',
  '@cf/meta/llama-3.2-3b-instruct',
];

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
  const stream = await env.AI.run(model, { messages, stream: true });
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
  const response = await env.AI.run(model, { messages });
  const output = extractToken(response)?.trim();
  if (!output) {
    throw new Error(`Model ${model} returned no output.`);
  }
  return output;
}
export async function runAgent(type: AgentType, options: AgentRunOptions, env: any): Promise<AgentResult> {
  const { input, instructions, name, onToken } = options;

  if (!env || !env.AI) {
    throw new Error('Workers AI binding is not available.');
  }

  const tools = options.mcpTools ?? [];
  const canUseTools = tools.length > 0 && typeof options.executeTool === 'function';

  const systemPrompt = buildSystemPrompt(type, name, instructions)
    + (canUseTools ? buildToolPrompt(tools) : '');
  const userPrompt = buildUserPrompt(type, input);

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
        if (streamed) {
          return { output: streamed.slice(0, 8000), toolsUsed: [] };
        }
      } catch (error) {
        lastError = error;
      }

      try {
        const output = await runModelOnce(model, messages, env);
        return { output: output.slice(0, 8000), toolsUsed: [] };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Agent failed to produce output.');
  }

  // Tool path: ReAct loop (Reason → Act via MCP → Observe), then final answer.
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

  for (let round = 1; round <= maxRounds; round++) {
    const text = await runOnceChain(messages, env);
    const calls = parseToolCalls(text).slice(0, 3);

    if (calls.length === 0) {
      return { output: finalize(text, onToken), toolsUsed };
    }

    // Keep the model's reasoning + calls in context, then feed observations.
    messages.push({ role: 'assistant', content: text });
    for (const call of calls) {
      const known = tools.some((t) => t.serverId === call.server && t.name === call.tool);
      if (!known) {
        messages.push({
          role: 'user',
          content: `Observation: no such tool "${call.tool}" on server "${call.server}". Use only the listed tools, or answer directly without a tool call.`,
        });
        continue;
      }
      onToolEvent?.({ server: call.server, tool: call.tool, phase: 'call' });
      try {
        const observation = await executeTool!(call.server, call.tool, call.args);
        recordUse(call.server, call.tool);
        onToolEvent?.({ server: call.server, tool: call.tool, phase: 'result', summary: observation.slice(0, 160) });
        messages.push({
          role: 'user',
          content: `Observation from ${call.server}/${call.tool}:\n${observation.slice(0, 3500)}`,
        });
      } catch (e: any) {
        const msg = e?.message || 'Tool execution failed.';
        onToolEvent?.({ server: call.server, tool: call.tool, phase: 'result', summary: `ERROR: ${msg}` });
        messages.push({
          role: 'user',
          content: `Observation: tool ${call.server}/${call.tool} failed: ${msg}. Try a different tool or answer from what you know.`,
        });
      }
    }
  }

  // Out of rounds — force a final answer with no more tool calls.
  messages.push({
    role: 'user',
    content: 'No more tool calls are available. Write your final answer now using everything you have learned. Do not emit any [TOOL_CALL] blocks.',
  });
  const text = await runOnceChain(messages, env);
  return { output: finalize(text, onToken), toolsUsed };
}

/** Non-streaming model call with the standard fallback chain. */
async function runOnceChain(messages: { role: string; content: string }[], env: any): Promise<string> {
  let lastError: unknown = new Error('No models configured.');
  for (const model of MODELS) {
    try {
      const output = await runModelOnce(model, messages, env);
      if (output) return output.slice(0, 8000);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Agent failed to produce output.');
}

/** Strip leaked tool-call blocks, cap length, and stream to the UI in chunks. */
function finalize(text: string, onToken?: (token: string) => void): string {
  const clean = text.replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/g, '').trim() || text.trim();
  const output = clean.slice(0, 8000);
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

To call tools, emit one or more blocks EXACTLY like this (and nothing else on those lines):
[TOOL_CALL]{"server": "<serverId>", "tool": "<toolName>", "arguments": {<args>}}[/TOOL_CALL]

Rules:
- Use only the listed server/tool names with plain JSON arguments.
- After each tool call you will receive an Observation — use it in your reasoning.
- When you have enough information, write your FINAL answer as normal prose (no [TOOL_CALL] blocks). Weave tool results into the answer naturally.`;
}

function buildSystemPrompt(type: AgentType, name: string, instructions: string): string {
  const roleMap: Record<AgentType, string> = {
    researcher: 'an expert researcher who gathers and synthesizes information',
    writer: 'a skilled writer who creates clear, engaging content',
    editor: 'a meticulous editor who polishes and improves content',
    publisher: 'a publication specialist who formats content for its final audience',
    critic: 'a constructive critic who identifies weaknesses and opportunities',
    summarizer: 'a concise summarizer who distills complex information',
  };

  return `You are ${name}, ${roleMap[type]}. ${instructions}

Rules:
- Stay focused on your specific role
- Build on the input you receive
- Be concise but thorough
- Return only your final output, no meta-commentary`;
}

function buildUserPrompt(type: AgentType, input: string): string {
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
