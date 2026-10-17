import { mcpServersFor } from "./mcp-catalog";
import { OPENING_PACK_ID } from "./pack-templates";

export type SwarmTemplate = {
  id: string;
  name: string;
  nodes: { id: string; type: string; name: string; instructions: string; position: { x: number; y: number } }[];
  edges: { id: string; source: string; target: string }[];
};

export type SwarmMcpServer = { id: string; name: string; url: string };

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

type SwarmResult = { executionId: string; status: string; output: string; receipt: string };

const SETTLED_STATUS = new Set(["completed", "failed", "check_failed", "tool_failed", "model_failed", "question"]);

function receiptOf(body: unknown): string {
  if (!body || typeof body !== "object" || !("receipt" in body)) return "";
  const receipt = (body as { receipt?: unknown }).receipt;
  if (!receipt) return "";
  return typeof receipt === "string" ? receipt : JSON.stringify(receipt);
}

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

/** Portal servers for a lead swarm. Empty when the origin or portal URL is not https. */
export function leadPortalAttach(input: {
  origin: string;
  portalUrl?: string;
  runSecret?: string;
}): { mcpServers: SwarmMcpServer[]; runSecret: string } {
  const servers = mcpServersFor(["portal"], input.origin, input.portalUrl ?? "");
  if (!servers) return { mcpServers: [], runSecret: "" };
  return { mcpServers: servers, runSecret: input.runSecret?.trim() ?? "" };
}

/** Saves the schema readiness pack, starts it, and waits for the node outputs. */
export async function runLeadSwarm(input: {
  origin: string;
  workflowId: string;
  /** Client workflow name. Research detection uses this, not the pack template name. */
  workflowName?: string;
  brief: string;
  templateId?: string;
  mcpServers?: SwarmMcpServer[];
  runSecret?: string;
  /** Specialist kind. Set on the saved workflow so the swarm runs the checker. */
  kind?: string;
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
  const servers = input.mcpServers ?? [];
  const headers: Record<string, string> = { "content-type": "application/json" };
  const runSecret = input.runSecret?.trim() ?? "";
  if (runSecret) headers.authorization = `Bearer ${runSecret}`;
  const workflowName = input.workflowName?.trim() ?? "";
  const workflow = {
    ...template,
    id: input.workflowId,
    ...(workflowName ? { name: workflowName } : {}),
    ...(input.kind ? { kind: input.kind } : {}),
    createdAt: Date.now(),
    ...(servers.length > 0
      ? {
          mcpServers: servers,
          nodes: template.nodes.map((node) => ({ ...node, mcpServerIds: servers.map((server) => server.id) })),
        }
      : {}),
  };
  const saved = await fetchImpl(`${base}/api/save`, {
    method: "POST",
    headers,
    body: JSON.stringify(workflow),
  });
  if (!saved.ok) throw new Error("The swarm did not save the workflow.");
  const started = await fetchImpl(`${base}/api/execute`, {
    method: "POST",
    headers,
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
  let receipt = "";
  for (let attempt = 0; attempt < polls; attempt += 1) {
    const statusResponse = await fetchImpl(`${base}/api/status?id=${encodeURIComponent(executionId)}`);
    const body = statusResponse.ok ? ((await statusResponse.json()) as { status?: string }) : {};
    status = typeof body.status === "string" ? body.status : "running";
    output = doneOutput(body, template.nodes.map((node) => node.id));
    receipt = receiptOf(body);
    if (SETTLED_STATUS.has(status)) break;
    if (attempt < polls - 1) await wait(3000);
  }
  if (!SETTLED_STATUS.has(status)) {
    output = output || `Swarm run ${executionId} is still going.`;
  }
  return { executionId, status, output, receipt };
}

export type SwarmNodeArtifact = {
  nodeId: string;
  nodeName: string;
  content: string;
};

const ARTIFACT_BODY_MAX = 100_000;

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** One file name per node. A repeated name keeps the node id so the later file is not overwritten. */
export function swarmArtifactFiles(artifacts: SwarmNodeArtifact[]): { node: string; body: string }[] {
  const used = new Set<string>();
  const files: { node: string; body: string }[] = [];
  for (const artifact of artifacts) {
    const body = artifact.content.trim().slice(0, ARTIFACT_BODY_MAX);
    if (!body) continue;
    const name = slug(artifact.nodeName);
    const id = slug(artifact.nodeId);
    let node = name || id;
    if (!node) continue;
    if (used.has(node)) node = slug(`${name || "node"}-${id}`) || `${node}-2`;
    let candidate = node;
    let extra = 2;
    while (used.has(candidate)) {
      candidate = slug(`${node}-${extra}`) || `${node}-${extra}`;
      extra += 1;
    }
    used.add(candidate);
    files.push({ node: candidate, body });
  }
  return files;
}

/** The swarm's PDF report for one finished execution. A missing or non-PDF body is null. */
export async function readSwarmReport(input: {
  origin: string;
  executionId: string;
  fetchImpl?: typeof fetch;
}): Promise<Uint8Array | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = originOf(input.origin);
  try {
    const response = await fetchImpl(`${base}/api/report?executionId=${encodeURIComponent(input.executionId)}`);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 5 || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) return null;
    return bytes;
  } catch {
    return null;
  }
}

/** Node artifacts for one execution. A missing list is empty. */
export async function readSwarmArtifacts(input: {
  origin: string;
  executionId: string;
  fetchImpl?: typeof fetch;
}): Promise<SwarmNodeArtifact[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = originOf(input.origin);
  try {
    const response = await fetchImpl(`${base}/api/artifacts?executionId=${encodeURIComponent(input.executionId)}`);
    if (!response.ok) return [];
    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) return [];
    return body.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as { nodeId?: unknown; nodeName?: unknown; content?: unknown };
      const content = typeof row.content === "string" ? row.content : "";
      if (!content.trim()) return [];
      return [
        {
          nodeId: typeof row.nodeId === "string" ? row.nodeId : "",
          nodeName: typeof row.nodeName === "string" ? row.nodeName : "",
          content,
        },
      ];
    });
  } catch {
    return [];
  }
}

/** Reads one swarm execution without starting another. Node order comes from the template. */
export async function readSwarmRun(input: {
  origin: string;
  executionId: string;
  templateId: string;
  fetchImpl?: typeof fetch;
}): Promise<{ status: string; output: string; receipt: string }> {
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
  return {
    status,
    output: output || (status === "running" ? `Swarm run ${input.executionId} is still going.` : ""),
    receipt: receiptOf(body),
  };
}

/** Forty checks, 45 seconds apart, covers a research pack that runs for about half an hour. */
export const SWARM_REFRESH_LIMIT = 40;

/** Keep reading a running swarm. After the limit, hand the follow-up to the due wake instead of dropping it. */
export function followRunningSwarm(status: string, attempts: number): "refresh" | "handoff" | "stop" {
  if (status !== "running") return "stop";
  if (attempts < SWARM_REFRESH_LIMIT) return "refresh";
  return "handoff";
}
