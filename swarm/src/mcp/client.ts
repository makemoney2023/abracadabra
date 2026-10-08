import type { McpServerConfig } from '../types';

export interface McpToolDef {
  serverId: string;
  serverName: string;
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface ParsedToolCall {
  server: string;
  tool: string;
  args: Record<string, unknown>;
}

const PROTOCOL_VERSION = '2025-06-18';
const DEFAULT_TIMEOUT_MS = 15000;

/** Parse SSE `data:` payloads out of a streamable-HTTP response body. */
function extractSsePayloads(text: string): string[] {
  const payloads: string[] = [];
  for (const chunk of text.split(/\n\n+/)) {
    for (const line of chunk.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data:')) {
        const data = trimmed.slice(5).trim();
        if (data && data !== '[DONE]') payloads.push(data);
      }
    }
  }
  return payloads;
}

function asJsonRpcResult(body: string): any {
  const trimmed = body.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }
  const payloads = extractSsePayloads(body);
  for (let i = payloads.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(payloads[i]);
      if (parsed && (parsed.result !== undefined || parsed.error !== undefined)) return parsed;
    } catch {
      // keep scanning
    }
  }
  throw new Error('MCP server returned no JSON-RPC response.');
}

/**
 * Minimal Streamable-HTTP MCP client (Workers-safe: fetch only).
 * Lazily performs the initialize handshake and reuses the session id.
 */
export class McpClient {
  private sessionId: string | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(
    private server: McpServerConfig,
    private timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  private async post(payload: unknown, extraHeaders?: Record<string, string>): Promise<{ json: any; headers: Headers }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.server.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...(this.sessionId ? { 'mcp-session-id': this.sessionId } : {}),
          ...(this.server.headers ?? {}),
          ...(extraHeaders ?? {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const body = await res.text();
      if (!res.ok) {
        throw new Error(`MCP HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      return { json: asJsonRpcResult(body), headers: res.headers };
    } catch (e: any) {
      if (e?.name === 'AbortError') throw new Error(`MCP request to ${this.server.name} timed out.`);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  private initialize(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          const { json, headers } = await this.post({
            jsonrpc: '2.0',
            id: 'init-1',
            method: 'initialize',
            params: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: { name: 'agent-swarm-orchestrator', version: '1.0.0' },
            },
          });
          if (json?.error) throw new Error(json.error.message || 'initialize failed');
          const sid = headers.get('mcp-session-id');
          if (sid) this.sessionId = sid;
          // Best-effort initialized notification; ignore failures.
          try {
            await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' });
          } catch {
            // servers that reject bare notifications are fine without it
          }
        } catch {
          // Servers without a handshake (plain JSON-RPC) still work below.
          this.initPromise = null;
        }
      })();
    }
    return this.initPromise;
  }

  async listTools(): Promise<McpToolDef[]> {
    await this.initialize();
    const { json } = await this.post({
      jsonrpc: '2.0',
      id: 'tools-list-1',
      method: 'tools/list',
      params: {},
    });
    if (json?.error) throw new Error(json.error.message || 'tools/list failed');
    const tools = json?.result?.tools;
    if (!Array.isArray(tools)) return [];
    return tools.map((t: any) => ({
      serverId: this.server.id,
      serverName: this.server.name,
      name: String(t.name),
      description: typeof t.description === 'string' ? t.description : undefined,
      inputSchema: t.inputSchema,
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    await this.initialize();
    const { json } = await this.post({
      jsonrpc: '2.0',
      id: `call-${Date.now()}`,
      method: 'tools/call',
      params: { name, arguments: args ?? {} },
    });
    if (json?.error) throw new Error(json.error.message || `tool ${name} failed`);
    const content = json?.result?.content;
    if (Array.isArray(content)) {
      return content
        .map((c: any) => (typeof c.text === 'string' ? c.text : JSON.stringify(c)))
        .join('\n')
        .slice(0, 4000);
    }
    if (typeof json?.result === 'string') return json.result.slice(0, 4000);
    return JSON.stringify(json?.result ?? null).slice(0, 4000);
  }
}

/** Render the tool catalog for the model prompt. */
export function formatToolsForPrompt(tools: McpToolDef[]): string {
  return tools
    .map((t) => {
      const schema = t.inputSchema ? ` args: ${JSON.stringify(t.inputSchema).slice(0, 300)}` : '';
      return `- server "${t.serverId}" (${t.serverName}) · tool "${t.name}": ${t.description || 'no description'}.${schema}`;
    })
    .join('\n');
}

const TOOL_CALL_RE = /\[TOOL_CALL\]([\s\S]*?)\[\/TOOL_CALL\]/g;

/** Parse [TOOL_CALL]{...}[/TOOL_CALL] blocks emitted by the model. */
export function parseToolCalls(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  TOOL_CALL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOOL_CALL_RE.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (typeof parsed.tool === 'string' && typeof parsed.server === 'string') {
        calls.push({
          server: parsed.server,
          tool: parsed.tool,
          args: parsed.arguments && typeof parsed.arguments === 'object' ? parsed.arguments : {},
        });
      }
    } catch {
      // malformed block — model will be asked to retry via observation
    }
  }
  return calls;
}
