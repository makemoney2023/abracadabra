import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpClient, type McpToolDef } from '../mcp/client';
import { runAgent } from './agents';
import {
  clipToolResult,
  researchToolNote,
  toolTimeoutMs,
  toolsForAgent,
} from './research-tools';

const search: McpToolDef = {
  serverId: 'portal',
  serverName: 'MCP portal',
  name: 'parallel-search_web_search',
  description: 'Search the web',
};
const fetchPage: McpToolDef = {
  serverId: 'portal',
  serverName: 'MCP portal',
  name: 'parallel-search_web_fetch',
  description: 'Read pages',
};
const listServers: McpToolDef = {
  serverId: 'portal',
  serverName: 'MCP portal',
  name: 'portal_list_servers',
  description: 'List servers',
};

describe('toolsForAgent', () => {
  it('keeps portal web search on a researcher and drops it from a writer', () => {
    const tools = [search, fetchPage, listServers];
    expect(toolsForAgent('researcher', tools).map((tool) => tool.name)).toEqual([
      'parallel-search_web_search',
      'parallel-search_web_fetch',
      'portal_list_servers',
    ]);
    expect(toolsForAgent('writer', tools).map((tool) => tool.name)).toEqual(['portal_list_servers']);
  });

  it('keeps an unprefixed web_search tool for a direct researcher connection', () => {
    const direct: McpToolDef = { ...search, name: 'web_search' };
    expect(toolsForAgent('researcher', [direct])).toEqual([direct]);
    expect(toolsForAgent('critic', [direct])).toEqual([]);
  });
});

describe('clipToolResult', () => {
  it('keeps a long web search observation and caps other tools', () => {
    const long = 'x'.repeat(8000);
    expect(clipToolResult(long, 'parallel-search_web_search').length).toBe(8000);
    expect(clipToolResult(long, 'web_fetch').length).toBe(8000);
    expect(clipToolResult(long, 'echo').length).toBe(3500);
  });
});

describe('toolTimeoutMs', () => {
  it('gives web fetch longer than the default MCP timeout', () => {
    expect(toolTimeoutMs('parallel-search_web_fetch')).toBeGreaterThan(15000);
    expect(toolTimeoutMs('echo')).toBe(15000);
  });
});

describe('researchToolNote', () => {
  it('tells a researcher to search, fetch, and cite URLs', () => {
    const note = researchToolNote('researcher', [search, fetchPage]);
    expect(note).toMatch(/web_search/);
    expect(note).toMatch(/web_fetch/);
    expect(note).toMatch(/URL/);
  });

  it('stays empty when the node is not a researcher or has no web tools', () => {
    expect(researchToolNote('writer', [search])).toBe('');
    expect(researchToolNote('researcher', [listServers])).toBe('');
  });
});

describe('McpClient web research results', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a long web_search result instead of cutting it at 4000 characters', async () => {
    const body = 'z'.repeat(8000);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: '1',
            result: { content: [{ type: 'text', text: body }] },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const client = new McpClient({ id: 'portal', name: 'MCP portal', url: 'https://mcp.example/mcp' });
    const text = await client.callTool('parallel-search_web_search', { objective: 'news' });
    expect(text.length).toBe(8000);
  });
});

describe('runAgent web research', () => {
  it('puts the citation rule in the researcher prompt and keeps a long observation', async () => {
    const calls: { role: string; content: string }[][] = [];
    const env = {
      AI: {
        run: async (_model: string, params: { messages: { role: string; content: string }[] }) => {
          calls.push(params.messages);
          if (calls.length === 1) {
            return {
              response: '[TOOL_CALL]{"server":"portal","tool":"parallel-search_web_search","arguments":{"objective":"news","search_queries":["acme pricing"]}}[/TOOL_CALL]',
            };
          }
          return { response: 'Acme pricing is listed at https://example.com/pricing' };
        },
      },
    };
    const result = await runAgent(
      'researcher',
      {
        input: 'price acme',
        instructions: 'Research.',
        name: 'Researcher',
        mcpTools: [search],
        executeTool: async () => 'source https://example.com/pricing ' + 'y'.repeat(6000),
      },
      env,
    );
    expect(calls[0][0].content).toMatch(/cite/i);
    const observation = calls[1].find((message) => message.content.startsWith('Observation from'));
    expect(observation?.content.length).toBeGreaterThan(5000);
    expect(result.output).toContain('https://example.com/pricing');
    expect(result.toolsUsed).toEqual([{ server: 'portal', tool: 'parallel-search_web_search' }]);
  });
});
