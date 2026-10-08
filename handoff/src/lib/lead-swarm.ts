import { OPENING_PACK_ID } from "./pack-templates";

export type SwarmTemplate = {
  id: string;
  name: string;
  nodes: { id: string; type: string; name: string; instructions: string; position: { x: number; y: number } }[];
  edges: { id: string; source: string; target: string }[];
};

export type LeadFacts = {
  name: string;
  website?: string | null;
  score?: number | null;
  packId?: string | null;
};

export function leadBrief(lead: LeadFacts): string {
  const lines = [`Lead: ${lead.name}`];
  if (lead.website) lines.push(`Site: ${lead.website}`);
  if (typeof lead.score === "number") lines.push(`Readiness score: ${lead.score}`);
  const opening = !lead.packId || lead.packId === OPENING_PACK_ID;
  if (opening) {
    lines.push("Use the schema scan to check AI readiness. The scraped pages are the client's knowledge context.");
  } else if (typeof lead.score === "number") {
    lines.push("The scraped pages are available as knowledge context.");
  }
  return lines.join("\n");
}

type SwarmResult = { executionId: string; status: string; output: string };

function originOf(origin: string): string {
  return origin.replace(/\/$/, "");
}

function doneOutput(body: unknown, order: string[]): string {
  if (!body || typeof body !== "object" || !("results" in body)) return "";
  const results = (body as { results?: unknown }).results;
  if (!results || typeof results !== "object") return "";
  const parts: string[] = [];
  for (const id of order) {
    const row = (results as Record<string, { status?: string; output?: string }>)[id];
    if (row?.status === "done" && row.output) parts.push(row.output);
  }
  return parts.join("\n\n");
}

/** Saves the schema readiness pack, starts it, and waits for the node outputs. */
export async function runLeadSwarm(input: {
  origin: string;
  workflowId: string;
  brief: string;
  templateId?: string;
  fetchImpl?: typeof fetch;
  polls?: number;
  wait?: (ms: number) => Promise<void>;
}): Promise<SwarmResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = originOf(input.origin);
  const templateId = input.templateId?.trim() || OPENING_PACK_ID;
  const templateResponse = await fetchImpl(`${base}/api/template?id=${templateId}`);
  if (!templateResponse.ok) throw new Error("The swarm template did not load.");
  const template = (await templateResponse.json()) as SwarmTemplate;
  if (!Array.isArray(template.nodes) || template.nodes.length === 0) {
    throw new Error("The swarm template is empty.");
  }
  const workflow = { ...template, id: input.workflowId, createdAt: Date.now() };
  const saved = await fetchImpl(`${base}/api/save`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(workflow),
  });
  if (!saved.ok) throw new Error("The swarm did not save the workflow.");
  const started = await fetchImpl(`${base}/api/execute`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workflowId: input.workflowId, input: input.brief }),
  });
  if (!started.ok) throw new Error("The swarm did not start.");
  const startedBody = (await started.json()) as { executionId?: string };
  const executionId = startedBody.executionId ?? "";
  if (!executionId) throw new Error("The swarm did not return a run id.");

  const polls = input.polls ?? 8;
  const wait = input.wait ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let status = "running";
  let output = "";
  for (let attempt = 0; attempt < polls; attempt += 1) {
    const statusResponse = await fetchImpl(`${base}/api/status?id=${encodeURIComponent(executionId)}`);
    const body = statusResponse.ok ? ((await statusResponse.json()) as { status?: string }) : {};
    status = typeof body.status === "string" ? body.status : "running";
    output = doneOutput(body, template.nodes.map((node) => node.id));
    if (status === "completed" || status === "failed") break;
    if (attempt < polls - 1) await wait(3000);
  }
  if (status !== "completed" && status !== "failed") {
    output = output || `Swarm run ${executionId} is still going.`;
  }
  return { executionId, status, output };
}

/** Reads one swarm execution without starting another. Node order comes from the template. */
export async function readSwarmRun(input: {
  origin: string;
  executionId: string;
  templateId: string;
  fetchImpl?: typeof fetch;
}): Promise<{ status: string; output: string }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = originOf(input.origin);
  let order: string[] = [];
  const templateResponse = await fetchImpl(`${base}/api/template?id=${encodeURIComponent(input.templateId)}`);
  if (templateResponse.ok) {
    const template = (await templateResponse.json()) as SwarmTemplate;
    if (Array.isArray(template.nodes)) order = template.nodes.map((node) => node.id);
  }
  const statusResponse = await fetchImpl(`${base}/api/status?id=${encodeURIComponent(input.executionId)}`);
  const body = statusResponse.ok ? await statusResponse.json() : {};
  const status =
    body && typeof body === "object" && "status" in body && typeof body.status === "string" ? body.status : "running";
  const output = doneOutput(body, order);
  return { status, output: output || (status === "running" ? `Swarm run ${input.executionId} is still going.` : "") };
}
