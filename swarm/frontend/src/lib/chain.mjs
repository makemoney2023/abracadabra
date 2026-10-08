/** Shift so a second template sits to the right of the nodes already on the canvas. */
export function chainOffset(nodes) {
  if (!nodes.length) return 0;
  return Math.max(...nodes.map((node) => node.position.x)) + 320;
}

/** Connect the rightmost existing node to the first node of the template being added. */
export function bridgeEdge(existing, incomingFirstId) {
  if (!existing.length || !incomingFirstId) return null;
  const source = existing.reduce((best, node) => (node.position.x > best.position.x ? node : best));
  return { source: source.id, target: incomingFirstId };
}
