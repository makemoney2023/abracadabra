import type { McpToolDef } from './client';

/** Tools the node may see. Omitted allowlist keeps every discovered tool. */
export function toolsForNode(tools: McpToolDef[], allow: readonly string[] | undefined): McpToolDef[] {
  if (allow === undefined) return tools;
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  return allow.flatMap((name) => {
    const tool = byName.get(name);
    return tool ? [tool] : [];
  });
}

/** Allowlist names that tools/list did not return. An omitted or empty list requires nothing. */
export function missingToolNames(tools: McpToolDef[], allow: readonly string[] | undefined): string[] {
  if (!allow || allow.length === 0) return [];
  const names = new Set(tools.map((tool) => tool.name));
  return allow.filter((name) => !names.has(name));
}

/** Fail closed before the model runs when a required render tool is absent. */
export function assertToolsAllowed(tools: McpToolDef[], allow: readonly string[] | undefined): void {
  const missing = missingToolNames(tools, allow);
  if (missing.length > 0) {
    throw new Error(`Missing MCP tool: ${missing[0]}`);
  }
}
