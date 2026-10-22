import type { Sql } from "@/db/sql";
import type { AgentPrincipal } from "@/lib/agent-work-filing";
import { mediaModel, listMediaModels, type MediaFit, type MediaKind, type MediaModel } from "@/lib/agent-media-models";
import { fluxInput } from "@/lib/flux-input";
import type { ObjectStore } from "@/lib/store/objects";

const PROMPT_MAX = 2000;
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const VIDEO_MAX_BYTES = 20 * 1024 * 1024;
function listed(values: readonly number[]): string {
  if (values.length <= 1) return String(values[0] ?? "");
  if (values.length === 2) return `${values[0]} or ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, or ${values[values.length - 1]}`;
}

export type MediaView = {
  ok: true;
  state: "ready" | "running" | "failed";
  media_id: string;
  kind: MediaKind;
  content_type?: string;
  bytes?: number;
  name?: string;
  job_id?: string;
  error?: string;
};

export type MediaCall =
  | { ok: true; status: number; view: MediaView }
  | { ok: false; status: number; message: string };

export type MediaAi = {
  run: (model: string, input: unknown) => Promise<unknown>;
};

type MediaRow = {
  id: string;
  external_id: string;
  agent_id: string;
  organization_id: string;
  task_id: string | null;
  model: string;
  kind: MediaKind;
  state: "ready" | "running" | "failed";
  content_type: string | null;
  byte_length: number | null;
  r2_key: string | null;
  job_id: string | null;
  name: string | null;
  error: string | null;
};

type Request = {
  externalId: string;
  taskId: string | null;
  client: string | null;
  model: MediaModel;
  prompt: string;
  imageMediaId: string | null;
  aspectRatio: string | null;
  durationSeconds: number | null;
};

export function publicMediaModels(fits?: MediaFit | null) {
  return listMediaModels(fits ?? undefined).map((model) => ({
    id: model.id,
    kind: model.kind,
    reference_image: model.referenceImage,
    fits: model.fits,
    note: model.note,
  }));
}

export async function generateAgentMedia(input: {
  sql: Sql;
  store: ObjectStore;
  agent: AgentPrincipal | null;
  body: unknown;
  now: number;
  ai: MediaAi | null;
  fetchImpl?: typeof fetch;
}): Promise<MediaCall> {
  if (!input.agent || input.agent.assignments.length === 0) return refuse(401, "Unauthorized.");
  const parsed = parseRequest(input.body);
  if (!parsed.ok) return refuse(400, parsed.message);
  const place = await placeFor(input.sql, input.agent, parsed.request);
  if (!place.ok) return refuse(place.status, place.message);
  const existing = await findByExternal(input.sql, input.agent.agentId, parsed.request.externalId);
  if (existing) return { ok: true, status: 200, view: viewOf(existing) };

  if (!input.ai) return refuse(503, "Media generation is not configured.");
  const reference = await referenceImage(input.sql, input.store, input.agent, place.organizationId, parsed.request);
  if (!reference.ok) return refuse(reference.status, reference.message);

  let outcome: Outcome;
  try {
    const payload = await runInput(parsed.request, reference.image);
    outcome = interpret(await input.ai.run(parsed.request.model.id, payload), parsed.request.model.kind);
  } catch {
    return refuse(502, "The model did not answer.");
  }
  return finish(input, input.agent, parsed.request, place, outcome);
}

export async function readAgentMedia(input: {
  sql: Sql;
  store: ObjectStore;
  agent: AgentPrincipal | null;
  mediaId: string;
  now: number;
  ai: MediaAi | null;
  fetchImpl?: typeof fetch;
}): Promise<MediaCall> {
  if (!input.agent || input.agent.assignments.length === 0) return refuse(401, "Unauthorized.");
  const row = await input.sql.get<MediaRow>("SELECT * FROM agent_media WHERE id = ? AND agent_id = ?", [input.mediaId, input.agent.agentId]);
  if (!row) return refuse(404, "That media was not found.");
  if (!input.agent.assignments.some((assignment) => assignment.organizationId === row.organization_id)) return refuse(403, "That media is for another client.");
  if (row.state !== "running" || !row.job_id) return { ok: true, status: 200, view: viewOf(row) };
  if (!input.ai) return { ok: true, status: 200, view: viewOf(row) };
  let outcome: Outcome;
  try {
    outcome = interpret(await input.ai.run(row.model, { request_id: row.job_id }), row.kind);
  } catch {
    return { ok: true, status: 200, view: viewOf(row) };
  }
  if (outcome.kind === "job") return { ok: true, status: 200, view: viewOf(row) };
  const saved = await storeOutcome(input, row, outcome);
  return saved;
}

export async function readyMediaBytes(
  sql: Sql,
  store: ObjectStore,
  agent: AgentPrincipal,
  organizationId: string,
  ids: string[],
): Promise<{ ok: true; files: { name: string; bytes: Uint8Array; contentType: string }[] } | { ok: false; error: "forbidden" | "conflict" | "invalid"; message: string }> {
  const files: { name: string; bytes: Uint8Array; contentType: string }[] = [];
  for (const id of ids) {
    const row = await sql.get<MediaRow>("SELECT * FROM agent_media WHERE id = ?", [id]);
    if (!row || row.agent_id !== agent.agentId || row.organization_id !== organizationId) {
      return { ok: false, error: "forbidden", message: "media_ids includes a file this agent cannot use." };
    }
    if (row.state === "running") return { ok: false, error: "conflict", message: "That clip is still rendering." };
    if (row.state !== "ready" || !row.r2_key || !row.content_type || !row.name) {
      return { ok: false, error: "invalid", message: "That media is not ready to file." };
    }
    const bytes = await store.read(row.r2_key);
    if (!bytes) return { ok: false, error: "invalid", message: "That media file is missing." };
    files.push({ name: row.name, bytes, contentType: row.content_type });
  }
  return { ok: true, files };
}

function refuse(status: number, message: string): MediaCall {
  return { ok: false, status, message };
}

function parseRequest(body: unknown): { ok: true; request: Request } | { ok: false; message: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, message: "Send a JSON object." };
  const record = body as Record<string, unknown>;
  const externalId = text(record.external_id, 200);
  const taskId = text(record.task_id, 100);
  const prompt = text(record.prompt, PROMPT_MAX + 1);
  const modelId = text(record.model, 120);
  if (!externalId) return { ok: false, message: "external_id is required." };
  if (!modelId) return { ok: false, message: "model is required." };
  const model = mediaModel(modelId);
  if (!model) return { ok: false, message: "That model is not available." };
  if (model.promptField !== "omit") {
    if (!prompt) return { ok: false, message: "prompt is required." };
    if (prompt.length > PROMPT_MAX) return { ok: false, message: "prompt can be 2,000 characters." };
  }
  const aspect = text(record.aspect_ratio, 12);
  if (aspect && !/^[0-9]{1,2}:[0-9]{1,2}$/.test(aspect)) return { ok: false, message: "aspect_ratio must look like 1:1 or 16:9." };
  const allowed = model.durationAllowed ?? (model.kind === "video" ? [4, 6, 8] : []);
  let duration: number | null = null;
  if (record.duration_seconds != null) {
    if (typeof record.duration_seconds !== "number" || !allowed.includes(record.duration_seconds)) {
      return { ok: false, message: `duration_seconds must be ${listed(allowed)}.` };
    }
    duration = record.duration_seconds;
  } else if (allowed.length > 0) {
    duration = allowed.includes(6) ? 6 : allowed[0];
  }
  const imageMediaId = text(record.image_media_id, 100);
  if (model.referenceImage === "required" && !imageMediaId) return { ok: false, message: "image_media_id is required for this model." };
  if (model.referenceImage === "none" && imageMediaId) return { ok: false, message: "This model does not take a reference image." };
  return {
    ok: true,
    request: { externalId, taskId, client: text(record.client, 255), model, prompt: prompt ?? "", imageMediaId, aspectRatio: aspect, durationSeconds: duration },
  };
}

async function placeFor(
  sql: Sql,
  agent: AgentPrincipal,
  request: Request,
): Promise<{ ok: true; organizationId: string; projectId: string | null } | { ok: false; status: number; message: string }> {
  if (!request.taskId) return clientFor(sql, agent, request.client);
  return openTask(sql, agent, request);
}

async function clientFor(
  sql: Sql,
  agent: AgentPrincipal,
  client: string | null,
): Promise<{ ok: true; organizationId: string; projectId: string | null } | { ok: false; status: number; message: string }> {
  if (!client) {
    if (agent.assignments.length === 1) {
      const only = agent.assignments[0];
      return { ok: true, organizationId: only.organizationId, projectId: only.projectId };
    }
    return { ok: false, status: 400, message: "Name the client." };
  }
  const byId = agent.assignments.find((row) => row.organizationId === client);
  if (byId) return { ok: true, organizationId: byId.organizationId, projectId: byId.projectId };
  const byDomain = await sql.get<{ id: string }>("SELECT id FROM organizations WHERE domain = ? AND archived_at IS NULL", [client.toLowerCase()]);
  const match = byDomain ? agent.assignments.find((row) => row.organizationId === byDomain.id) : undefined;
  if (!match) return { ok: false, status: 403, message: "That client is not one you are assigned to." };
  return { ok: true, organizationId: match.organizationId, projectId: match.projectId };
}

async function openTask(
  sql: Sql,
  agent: AgentPrincipal,
  request: Request,
): Promise<{ ok: true; organizationId: string; projectId: string | null } | { ok: false; status: number; message: string }> {
  const task = await sql.get<{ id: string; organization_id: string | null; project_id: string | null; status: string; review_requested_at: number | null }>(
    "SELECT id, organization_id, project_id, status, review_requested_at FROM tasks WHERE id = ?",
    [request.taskId],
  );
  if (!task?.organization_id) return { ok: false, status: 403, message: "That task is not on a client you are assigned to." };
  const assigned = agent.assignments.some((row) => row.organizationId === task.organization_id);
  if (!assigned) return { ok: false, status: 403, message: "That task is not on a client you are assigned to." };
  if (request.client && request.client !== task.organization_id) {
    const byDomain = await sql.get<{ id: string }>("SELECT id FROM organizations WHERE domain = ? AND archived_at IS NULL", [request.client.toLowerCase()]);
    if (!byDomain || byDomain.id !== task.organization_id) return { ok: false, status: 403, message: "That task is not on a client you are assigned to." };
  }
  if (task.status === "done" || task.review_requested_at != null) return { ok: false, status: 403, message: "That card is not open." };
  return { ok: true, organizationId: task.organization_id, projectId: task.project_id };
}

async function referenceImage(
  sql: Sql,
  store: ObjectStore,
  agent: AgentPrincipal,
  organizationId: string,
  request: Request,
): Promise<{ ok: true; image: string | null } | { ok: false; status: number; message: string }> {
  if (!request.imageMediaId) return { ok: true, image: null };
  const row = await sql.get<MediaRow>("SELECT * FROM agent_media WHERE id = ?", [request.imageMediaId]);
  if (!row || row.agent_id !== agent.agentId || row.organization_id !== organizationId || row.kind !== "image" || row.state !== "ready" || !row.r2_key || !row.content_type) {
    return { ok: false, status: 400, message: "image_media_id is not a ready still from this agent." };
  }
  const bytes = await store.read(row.r2_key);
  if (!bytes) return { ok: false, status: 400, message: "image_media_id is not a ready still from this agent." };
  return { ok: true, image: `data:${row.content_type};base64,${base64(bytes)}` };
}

async function runInput(request: Request, image: string | null): Promise<unknown> {
  if (request.model.input === "multipart") return fluxInput(request.prompt);
  const body: Record<string, unknown> = { ...(request.model.defaults ?? {}) };
  if (request.model.promptField === "prompt") body.prompt = request.prompt;
  if (request.model.promptField === "instruction") body.instruction = request.prompt;
  if (request.aspectRatio) body.aspect_ratio = request.aspectRatio;
  if (request.durationSeconds && request.model.duration === "label") body.duration = `${request.durationSeconds}s`;
  if (request.durationSeconds && request.model.duration === "seconds") body.duration = request.durationSeconds;
  if (image && request.model.imageField !== "omit") {
    const encoded = request.model.imageEncoding === "base64" ? image.replace(/^data:[^;,]+;base64,/, "") : image;
    if (request.model.imageShape === "keyframes") {
      body.mode = "i2v";
      body.keyframes = encoded;
    } else if (request.model.imageShape === "url") {
      body[request.model.imageField] = { url: encoded };
    } else if (request.model.imageShape === "list") {
      body[request.model.imageField] = [encoded];
    } else {
      body[request.model.imageField] = encoded;
    }
  }
  return body;
}

type Outcome =
  | { kind: "bytes"; bytes: Uint8Array; contentType: string }
  | { kind: "url"; url: string }
  | { kind: "job"; jobId: string };

function interpret(value: unknown, kind: MediaKind): Outcome {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const jobId = text(record.job_id, 200) ?? text(record.request_id, 200);
  const video = record.video;
  const image = record.image;
  if (kind === "video" && typeof video === "string" && /^https:\/\//i.test(video)) return { kind: "url", url: video };
  const encoded = kind === "video" ? video : image;
  if (typeof encoded === "string" && encoded.trim()) {
    const decoded = decodeImage(encoded);
    if (decoded) return { kind: "bytes", ...decoded };
  }
  if (jobId && kind === "video") return { kind: "job", jobId };
  throw new Error("empty");
}

async function finish(
  input: { sql: Sql; store: ObjectStore; now: number; fetchImpl?: typeof fetch },
  agent: AgentPrincipal,
  request: Request,
  task: { organizationId: string; projectId: string | null },
  outcome: Outcome,
): Promise<MediaCall> {
  if (outcome.kind === "job") {
    const id = crypto.randomUUID();
    const name = fileName(request.externalId, "video", "video/mp4");
    await insertRow(input.sql, {
      id,
      externalId: request.externalId,
      agentId: agent.agentId,
      organizationId: task.organizationId,
      taskId: request.taskId,
      model: request.model.id,
      kind: "video",
      state: "running",
      contentType: null,
      byteLength: null,
      r2Key: null,
      jobId: outcome.jobId,
      name,
      error: null,
      now: input.now,
    });
    await logMedia(input.sql, agent, task, { mediaId: id, model: request.model.id, kind: "video", bytes: 0, taskId: request.taskId, now: input.now });
    return { ok: true, status: 202, view: { ok: true, state: "running", media_id: id, kind: "video", job_id: outcome.jobId, name } };
  }
  if (outcome.kind === "bytes") {
    const cap = request.model.kind === "video" ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
    if (outcome.bytes.byteLength > cap) return refuse(502, "The file is over the size cap.");
    return saveReady(input, agent, request, task, outcome.bytes, outcome.contentType);
  }
  const fetched = await fetchBytes(input.fetchImpl ?? fetch, outcome.url, request.model.kind);
  if (!fetched.ok) return refuse(502, fetched.message);
  return saveReady(input, agent, request, task, fetched.bytes, fetched.contentType);
}

async function storeOutcome(
  input: { sql: Sql; store: ObjectStore; now: number; fetchImpl?: typeof fetch },
  row: MediaRow,
  outcome: Outcome,
): Promise<MediaCall> {
  if (outcome.kind === "job") return { ok: true, status: 200, view: viewOf(row) };
  const bytes = outcome.kind === "bytes" ? { ok: true as const, bytes: outcome.bytes, contentType: outcome.contentType } : await fetchBytes(input.fetchImpl ?? fetch, outcome.url, row.kind);
  if (!bytes.ok) {
    await input.sql.run("UPDATE agent_media SET state = 'failed', error = ?, updated_at = ? WHERE id = ?", [bytes.message, input.now, row.id]);
    return { ok: true, status: 200, view: { ...viewOf(row), state: "failed", error: bytes.message } };
  }
  const key = objectKey(row.organization_id, row.id);
  await input.store.put(key, bytes.bytes);
  const name = fileName(row.external_id, row.kind, bytes.contentType);
  await input.sql.run(
    "UPDATE agent_media SET state = 'ready', content_type = ?, byte_length = ?, r2_key = ?, name = ?, error = NULL, updated_at = ? WHERE id = ?",
    [bytes.contentType, bytes.bytes.byteLength, key, name, input.now, row.id],
  );
  return {
    ok: true,
    status: 200,
    view: { ok: true, state: "ready", media_id: row.id, kind: row.kind, content_type: bytes.contentType, bytes: bytes.bytes.byteLength, name, job_id: row.job_id ?? undefined },
  };
}

async function saveReady(
  input: { sql: Sql; store: ObjectStore; now: number },
  agent: AgentPrincipal,
  request: Request,
  task: { organizationId: string; projectId: string | null },
  bytes: Uint8Array,
  contentType: string,
): Promise<MediaCall> {
  const id = crypto.randomUUID();
  const key = objectKey(task.organizationId, id);
  const name = fileName(request.externalId, request.model.kind, contentType);
  await input.store.put(key, bytes);
  await insertRow(input.sql, {
    id,
    externalId: request.externalId,
    agentId: agent.agentId,
    organizationId: task.organizationId,
    taskId: request.taskId,
    model: request.model.id,
    kind: request.model.kind,
    state: "ready",
    contentType,
    byteLength: bytes.byteLength,
    r2Key: key,
    jobId: null,
    name,
    error: null,
    now: input.now,
  });
  await logMedia(input.sql, agent, task, { mediaId: id, model: request.model.id, kind: request.model.kind, bytes: bytes.byteLength, taskId: request.taskId, now: input.now });
  return {
    ok: true,
    status: 201,
    view: { ok: true, state: "ready", media_id: id, kind: request.model.kind, content_type: contentType, bytes: bytes.byteLength, name },
  };
}

async function fetchBytes(fetchImpl: typeof fetch, url: string, kind: MediaKind): Promise<{ ok: true; bytes: Uint8Array; contentType: string } | { ok: false; message: string }> {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch {
    return { ok: false, message: "The file could not be saved." };
  }
  if (!response.ok) return { ok: false, message: "The file could not be saved." };
  const bytes = new Uint8Array(await response.arrayBuffer());
  const cap = kind === "video" ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
  if (bytes.byteLength === 0 || bytes.byteLength > cap) return { ok: false, message: "The file is over the size cap." };
  const sniffed = sniff(bytes);
  const header = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  const contentType = sniffed ?? (kind === "video" ? "video/mp4" : header.startsWith("image/") ? header : "image/png");
  return { ok: true, bytes, contentType };
}

function decodeImage(value: string): { bytes: Uint8Array; contentType: string } | null {
  const data = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(value.trim());
  const payload = data?.[2] ?? value.trim();
  const type = data?.[1]?.toLowerCase();
  const bytes = fromBase64(payload);
  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > IMAGE_MAX_BYTES) return null;
  return { bytes, contentType: sniff(bytes) ?? (type?.startsWith("image/") ? type : "image/png") };
}

function sniff(bytes: Uint8Array): string | null {
  if (bytes.byteLength >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.byteLength >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes.byteLength >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  if (bytes.byteLength >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "video/mp4";
  return null;
}

function fileName(externalId: string, kind: MediaKind, contentType: string): string {
  const tail = externalId.split(":").pop() ?? "";
  const stem = tail.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || (kind === "video" ? "clip" : "still");
  const extension = contentType === "image/jpeg" ? "jpg" : contentType === "image/webp" ? "webp" : contentType === "image/gif" ? "gif" : contentType === "video/mp4" ? "mp4" : "png";
  return `${stem}.${extension}`;
}

function objectKey(organizationId: string, mediaId: string): string {
  return `${organizationId}/${mediaId}/${crypto.randomUUID()}`;
}

function viewOf(row: MediaRow): MediaView {
  return {
    ok: true,
    state: row.state,
    media_id: row.id,
    kind: row.kind,
    ...(row.content_type ? { content_type: row.content_type } : {}),
    ...(row.byte_length != null ? { bytes: row.byte_length } : {}),
    ...(row.name ? { name: row.name } : {}),
    ...(row.job_id ? { job_id: row.job_id } : {}),
    ...(row.error ? { error: row.error } : {}),
  };
}

async function findByExternal(sql: Sql, agentId: string, externalId: string): Promise<MediaRow | undefined> {
  return sql.get<MediaRow>("SELECT * FROM agent_media WHERE agent_id = ? AND external_id = ?", [agentId, externalId]);
}

async function insertRow(sql: Sql, row: {
  id: string; externalId: string; agentId: string; organizationId: string; taskId: string | null; model: string; kind: MediaKind;
  state: "ready" | "running" | "failed"; contentType: string | null; byteLength: number | null; r2Key: string | null;
  jobId: string | null; name: string | null; error: string | null; now: number;
}): Promise<void> {
  await sql.run(
    `INSERT INTO agent_media (
      id, external_id, agent_id, organization_id, task_id, model, kind, state, content_type, byte_length, r2_key, job_id, name, error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.externalId, row.agentId, row.organizationId, row.taskId, row.model, row.kind, row.state, row.contentType, row.byteLength, row.r2Key, row.jobId, row.name, row.error, row.now, row.now],
  );
}

async function logMedia(
  sql: Sql,
  agent: AgentPrincipal,
  task: { organizationId: string; projectId: string | null },
  event: { mediaId: string; model: string; kind: MediaKind; bytes: number; taskId: string | null; now: number },
): Promise<void> {
  await sql.run(
    `INSERT INTO activities (id, organization_id, project_id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, ?, ?, 'client_agent.media', 'agent', ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      task.organizationId,
      task.projectId,
      agent.agentId,
      `${event.kind === "video" ? "Clip" : "Still"} ${event.model} (${event.bytes} bytes).`.slice(0, 500),
      JSON.stringify({ task_id: event.taskId, model: event.model, media_id: event.mediaId, bytes: event.bytes, kind: event.kind }),
      event.now,
    ],
  );
}

function text(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value ? value.slice(0, max) : null;
}

function fromBase64(value: string): Uint8Array | null {
  const compact = value.replace(/\s/g, "");
  if (!compact || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null;
  try {
    const binary = atob(compact);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
