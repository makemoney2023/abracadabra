import type { McpToolDef } from '../mcp/client';
import type { AgentType } from '../types';

/** Portal tools are `{server_id}_{tool}`. `parallel-search_web_search` splits on the first underscore. */
const WEB_RESEARCH = /(?:^|_)web_(?:search|fetch)$/;

export const DEFAULT_TOOL_OBSERVATION = 3500;
export const WEB_RESEARCH_OBSERVATION = 12000;
export const DEFAULT_TOOL_TIMEOUT_MS = 15000;
export const WEB_RESEARCH_TIMEOUT_MS = 45000;

export function isWebResearchTool(name: string): boolean {
  return WEB_RESEARCH.test(name);
}

/** Writers and critics keep the rest of the portal. Web search stays on researchers. */
export function toolsForAgent(type: AgentType, tools: McpToolDef[]): McpToolDef[] {
  if (type === 'researcher') return tools;
  return tools.filter((tool) => !isWebResearchTool(tool.name));
}

export function clipToolResult(text: string, toolName: string): string {
  const limit = isWebResearchTool(toolName) ? WEB_RESEARCH_OBSERVATION : DEFAULT_TOOL_OBSERVATION;
  return text.slice(0, limit);
}

export function toolTimeoutMs(toolName: string): number {
  return isWebResearchTool(toolName) ? WEB_RESEARCH_TIMEOUT_MS : DEFAULT_TOOL_TIMEOUT_MS;
}

export function researchToolNote(type: AgentType, tools: McpToolDef[]): string {
  if (type !== 'researcher' || !tools.some((tool) => isWebResearchTool(tool.name))) return '';
  return `

Web research:
- When a listed tool name ends in web_search, call that tool before stating a current fact that is not in the brief or upstream output.
- Then call the listed tool whose name ends in web_fetch for the URLs you will cite. Use the exact tool names from the list.
- Cite each source URL in the deliverable.
- If those tools return nothing, say the search found no source.`;
}
