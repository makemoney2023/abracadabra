/**
 * AGENT_MODE switches who does client work.
 * - "legacy" (default, also when unset or unknown): swarm and Cursor cloud runs start as before.
 * - "agents": no new swarm, Cursor build, or Cursor revision starts. Board run/build and a client's
 *   "ask for changes" are handed to the client's lead agent through Client Services. Running jobs still settle.
 */
export type AgentMode = "legacy" | "agents";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

export function agentMode(): AgentMode {
  const fromProcess = typeof process !== "undefined" ? process.env?.AGENT_MODE?.trim() : "";
  const holder = globalThis as typeof globalThis & { [CLOUDFLARE_CONTEXT]?: { env?: Record<string, unknown> } };
  const bound = holder[CLOUDFLARE_CONTEXT]?.env?.AGENT_MODE;
  const raw = (fromProcess || (typeof bound === "string" ? bound.trim() : "")).toLowerCase();
  return raw === "agents" ? "agents" : "legacy";
}

export function legacyStartsAllowed(): boolean {
  return agentMode() === "legacy";
}

export class LegacyStartsDisabled extends Error {
  constructor(what: string) {
    super(`${what} is off. AGENT_MODE is agents, so this work goes to the client's agent.`);
    this.name = "LegacyStartsDisabled";
  }
}
