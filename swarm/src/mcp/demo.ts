/**
 * Minimal demo MCP server (Streamable HTTP, JSON responses).
 * Mounted at /demo-mcp/mcp — lets users test MCP wiring with zero setup.
 * Pure fetch-API: no Workers-only imports, unit-testable in Node.
 */

interface DemoTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>) => string;
}

const TOOLS: DemoTool[] = [
  {
    name: 'get_time',
    description: 'Returns the current UTC date and time. Takes no arguments.',
    inputSchema: { type: 'object', properties: {} },
    run: () => new Date().toISOString(),
  },
  {
    name: 'echo',
    description: 'Echoes back the given text. Useful for verifying the tool loop works.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Text to echo back.' } },
      required: ['text'],
    },
    run: (args) => String((args as any).text ?? ''),
  },
  {
    name: 'word_count',
    description: 'Counts words, characters, and lines in the given text.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Text to analyze.' } },
      required: ['text'],
    },
    run: (args) => {
      const text = String((args as any).text ?? '');
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      return `words: ${words}, characters: ${text.length}, lines: ${text.split('\n').length}`;
    },
  },
];

function result(id: unknown, payload: unknown): Response {
  return Response.json({ jsonrpc: '2.0', id: id ?? null, result: payload });
}

function error(id: unknown, code: number, message: string): Response {
  return Response.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
}

export async function handleDemoMcp(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Use POST with a JSON-RPC body.', { status: 405 });
  }
  let body: any;
  try {
    body = await request.json();
  } catch {
    return error(null, -32700, 'Parse error: invalid JSON.');
  }

  const { id, method, params } = body ?? {};

  if (method === 'initialize') {
    return result(id, {
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'swarm-demo-mcp', version: '1.0.0' },
    });
  }

  if (method === 'notifications/initialized') {
    return new Response(null, { status: 202 });
  }

  if (method === 'tools/list') {
    return result(id, {
      tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    });
  }

  if (method === 'tools/call') {
    const tool = TOOLS.find((t) => t.name === params?.name);
    if (!tool) return error(id, -32602, `Unknown tool: ${params?.name}`);
    try {
      const output = tool.run((params?.arguments ?? {}) as Record<string, unknown>).slice(0, 4000);
      return result(id, { content: [{ type: 'text', text: output }] });
    } catch (e: any) {
      return error(id, -32603, e?.message || 'Tool execution failed.');
    }
  }

  return error(id, -32601, `Method not found: ${method}`);
}
