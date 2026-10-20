/**
 * AGENT_MODE switches who does client work.
 * - "legacy" (default, also when unset or unknown): swarm and Cursor cloud runs start as before.
 * - "agents": no new swarm, Cursor build, or Cursor revision starts. Board run/build and a client's
 *   "ask for changes" are handed to the client's lead agent through Client Services. Running jobs still settle.
 */
export type AgentMode = "legacy" | "agents";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

/** env: a Worker's own bindings (the agent Durable Object passes this.env), read before process.env. */
export function agentMode(env?: { AGENT_MODE?: unknown }): AgentMode {
  const own = typeof env?.AGENT_MODE === "string" ? env.AGENT_MODE.trim().toLowerCase() : "";
  if (own) return own === "agents" ? "agents" : "legacy";
  const fromProcess = typeof process !== "undefined" ? process.env?.AGENT_MODE?.trim() : "";
  const holder = globalThis as typeof globalThis & { [CLOUDFLARE_CONTEXT]?: { env?: Record<string, unknown> } };
  const bound = holder[CLOUDFLARE_CONTEXT]?.env?.AGENT_MODE;
  const raw = (fromProcess || (typeof bound === "string" ? bound.trim() : "")).toLowerCase();
  return raw === "agents" ? "agents" : "legacy";
}

export function legacyStartsAllowed(env?: { AGENT_MODE?: unknown }): boolean {
  return agentMode(env) === "legacy";
}

export class LegacyStartsDisabled extends Error {
  constructor(what: string) {
    super(`${what} is off. AGENT_MODE is agents, so this work goes to the client's agent.`);
    this.name = "LegacyStartsDisabled";
  }
}

/** What staff and the chat model read when a swarm tool is refused in agents mode. */
export function agentModeRefusal(what: string): string {
  return `${what} is off: AGENT_MODE is agents, so the old swarm does not take new work. Nothing was created or started. Hand the work to the client's lead agent (move the task to build or run, or ask Client Services).`;
}
