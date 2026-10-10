import { describe, expect, it } from 'vitest';
import type { McpToolDef } from './client';
import { isParallelTool, isResearchWorkflow, researchTaskNote, toolsForResearch } from './research-tools';

const parallel: McpToolDef = {
  serverId: 'portal',
  serverName: 'MCP portal',
  name: 'parallel-search',
  description: 'Parallel Search over the public web',
};
const other: McpToolDef = {
  serverId: 'portal',
  serverName: 'MCP portal',
  name: 'search-console',
  description: 'Read Search Console',
};

describe('research tools', () => {
  it('recognizes Parallel by name, description, server name, or server id', () => {
    expect(isParallelTool(parallel)).toBe(true);
    expect(isParallelTool({ ...other, serverId: 'parallel-search' })).toBe(true);
    expect(isParallelTool({ ...other, serverName: 'Parallel Search' })).toBe(true);
    expect(isParallelTool({ ...other, description: 'Uses Parallel to search' })).toBe(true);
    expect(isParallelTool(other)).toBe(false);
  });

  it('keeps only Parallel tools on a research pack when the portal lists them', () => {
    expect(toolsForResearch([other, parallel])).toEqual([parallel]);
  });

  it('keeps every tool when Parallel is not listed', () => {
    expect(toolsForResearch([other])).toEqual([other]);
    expect(toolsForResearch([])).toEqual([]);
  });

  it('tells the step to call Parallel before the final answer', () => {
    const note = researchTaskNote([other, parallel]);
    expect(note).toContain('Parallel Search');
    expect(note).toContain('parallel-search');
    expect(note.toLowerCase()).toContain('before');
  });

  it('says Parallel was not available when the portal did not list it', () => {
    expect(researchTaskNote([other])).toContain('not available');
    expect(researchTaskNote([])).toContain('not available');
  });
});

describe('isResearchWorkflow', () => {
  it('matches a research pack by its name, description, or a node name', () => {
    expect(isResearchWorkflow({ name: 'Buying psychology research', nodes: [{ name: 'academic-paper' }] })).toBe(true);
    expect(isResearchWorkflow({ name: 'Academic Research Skills', description: 'Write and review a paper' })).toBe(true);
    expect(isResearchWorkflow({ name: 'Opening', nodes: [{ name: 'deep-research' }] })).toBe(true);
    expect(isResearchWorkflow({ name: 'research: audience, competitors, content calendar strategy' })).toBe(true);
  });

  it('drops image generation and portal admin tools when Parallel is listed', () => {
    const image: McpToolDef = { ...other, name: 'muapi_muapi_image_generate', description: 'Generate an image' };
    const toggle: McpToolDef = { ...other, name: 'portal_toggle_single_server', description: 'Turn one server on' };
    expect(toolsForResearch([image, toggle, parallel])).toEqual([parallel]);
  });

  it('does not treat a calendar pack as research because an instruction mentions the word', () => {
    expect(
      isResearchWorkflow({
        name: 'Content calendar and hooks',
        description: 'Hooks and a posting calendar',
        nodes: [{ name: 'headline-matrix', instructions: 'Use the research notes.' }],
      }),
    ).toBe(false);
  });
});
