/**
 * AGENT_MODE on this worker mirrors HQ. "agents" means the Grok Bot client agents do client work, so this
 * orchestrator takes no new runs. Status, artifacts, reports, and the alarm-driven resume of runs that already
 * started keep working, so in-flight runs finish and settle.
 */
export function agentModeOn(env: { AGENT_MODE?: unknown }): boolean {
  return typeof env.AGENT_MODE === 'string' && env.AGENT_MODE.trim().toLowerCase() === 'agents';
}

/** Run-start endpoints, as the worker sees them (before the /api prefix is stripped). */
const RUN_STARTS = new Set(['/api/execute']);

export function refuseRunStart(env: { AGENT_MODE?: unknown }, method: string, pathname: string): Response | null {
  if (method !== 'POST' || !RUN_STARTS.has(pathname) || !agentModeOn(env)) return null;
  return Response.json(
    {
      error: 'agent_mode',
      message:
        "New swarm runs are off: AGENT_MODE is agents, so client work goes to the client's agent. Runs that already started still finish.",
    },
    { status: 409 },
  );
}
