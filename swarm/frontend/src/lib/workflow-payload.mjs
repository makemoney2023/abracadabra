/** Map a stored template node onto canvas node data. */
export function templateNodeToFlowData(node) {
  const data = {
    agentType: node.type,
    name: node.name,
    instructions: node.instructions,
    status: "idle",
    output: "",
    mcpServerIds: node.mcpServerIds,
    mcpServers: node.mcpServers,
    toolsUsed: [],
  };
  if (node.mcpToolNames !== undefined) data.mcpToolNames = node.mcpToolNames;
  return data;
}

/** Map a canvas node onto the workflow save body. */
export function flowNodeToPayload(node) {
  const payload = {
    id: node.id,
    type: node.data.agentType,
    name: node.data.name,
    instructions: node.data.instructions,
    position: node.position,
    mcpServerIds: node.data.mcpServerIds,
    mcpServers: node.data.mcpServers,
  };
  if (node.data.mcpToolNames !== undefined) payload.mcpToolNames = node.data.mcpToolNames;
  return payload;
}
