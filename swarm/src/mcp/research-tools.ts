import type { McpToolDef } from './client';

type ResearchWorkflow = {
  name?: string;
  description?: string;
  nodes?: { name?: string; instructions?: string }[];
};

function mentionsParallel(value: string | undefined): boolean {
  return (value ?? '').toLowerCase().includes('parallel');
}

/** Portal tools keep their catalog server id. Parallel is recognized from the tool itself. */
export function isParallelTool(tool: Pick<McpToolDef, 'name' | 'description' | 'serverName' | 'serverId'>): boolean {
  return mentionsParallel(tool.name) || mentionsParallel(tool.description) || mentionsParallel(tool.serverName) || mentionsParallel(tool.serverId);
}

/** Research steps call Parallel when the portal lists it, and otherwise keep the full tool list. */
export function toolsForResearch(tools: McpToolDef[]): McpToolDef[] {
  const parallel = tools.filter(isParallelTool);
  return parallel.length > 0 ? parallel : tools;
}

/** Instruction appended on a research pack so the model cannot skip Parallel. */
export function researchTaskNote(tools: McpToolDef[]): string {
  const parallel = tools.filter(isParallelTool);
  if (parallel.length === 0) {
    return 'Parallel Search is not available on this run. Say that Parallel was not available, then answer from the brief and earlier steps.';
  }
  const names = parallel.map((tool) => tool.name).join(', ');
  return `This is a research step. Call Parallel Search before the final answer. Use one of these tools: ${names}. Do not finish from memory while a Parallel tool is listed.`;
}

/**
 * A research pack is named by the workflow or by a node, not by instruction
 * text. A calendar skill that mentions research notes stays a calendar.
 */
export function isResearchWorkflow(workflow: ResearchWorkflow): boolean {
  const labels = [workflow.name ?? '', workflow.description ?? '', ...(workflow.nodes ?? []).map((node) => node.name ?? '')];
  return labels.some((label) => /research/i.test(label));
}
