export function swarmRunHref(origin: string, executionId: string | null): string | null {
  const id = executionId?.trim() ?? "";
  if (!id) return null;
  const base = origin.replace(/\/$/, "");
  return `${base}/?executionId=${encodeURIComponent(id)}`;
}

export function swarmRunLink(executionId: string | null): string | null {
  const id = executionId?.trim() ?? "";
  return id ? `/swarm?executionId=${encodeURIComponent(id)}` : null;
}

export function hqSwarmHref(executionId: string | null): string {
  return swarmRunLink(executionId) ?? "/swarm";
}
