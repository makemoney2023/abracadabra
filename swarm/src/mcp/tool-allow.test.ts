import { describe, expect, it } from 'vitest';
import type { McpToolDef } from './client';
import { assertToolsAllowed, missingToolNames, toolsForNode } from './tool-allow';

const tools: McpToolDef[] = [
  { serverId: 'portal', serverName: 'MCP portal', name: 'search_models' },
  { serverId: 'portal', serverName: 'MCP portal', name: 'muapi_image_generate' },
  { serverId: 'portal', serverName: 'MCP portal', name: 'muapi_predict_result' },
];

describe('toolsForNode', () => {
  it('returns every tool when the allowlist is omitted', () => {
    expect(toolsForNode(tools, undefined)).toEqual(tools);
  });

  it('returns no tools when the allowlist is empty', () => {
    expect(toolsForNode(tools, [])).toEqual([]);
  });

  it('returns the named tools in allowlist order', () => {
    expect(toolsForNode(tools, ['muapi_image_generate', 'muapi_predict_result']).map((tool) => tool.name)).toEqual([
      'muapi_image_generate',
      'muapi_predict_result',
    ]);
  });
});

describe('missingToolNames', () => {
  it('is empty when every required name was discovered', () => {
    expect(missingToolNames(tools, ['muapi_image_generate', 'muapi_predict_result'])).toEqual([]);
  });

  it('names the tools that were not discovered', () => {
    expect(missingToolNames(tools, ['muapi_image_generate', 'muapi_predict_result'])).toEqual([]);
    expect(missingToolNames([tools[0], tools[1]], ['muapi_image_generate', 'muapi_predict_result'])).toEqual([
      'muapi_predict_result',
    ]);
  });

  it('treats an empty allowlist as nothing missing', () => {
    expect(missingToolNames(tools, [])).toEqual([]);
    expect(missingToolNames(tools, undefined)).toEqual([]);
  });
});

describe('assertToolsAllowed', () => {
  it('throws the first missing tool name', () => {
    expect(() => assertToolsAllowed([tools[0]], ['muapi_image_generate', 'muapi_predict_result'])).toThrow(
      'Missing MCP tool: muapi_image_generate',
    );
  });

  it('does nothing when the allowlist is omitted or empty', () => {
    expect(() => assertToolsAllowed(tools, undefined)).not.toThrow();
    expect(() => assertToolsAllowed(tools, [])).not.toThrow();
  });
});
