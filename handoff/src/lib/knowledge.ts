import type { Caller } from "@/lib/authz";
import { can } from "@/lib/authz";
import type { Sql } from "@/db/sql";
import type { Understander } from "@/lib/ai-gateway";
import { previewKind } from "@/lib/preview";

export type { Understander };

const CHUNK = 800;
const MAX_CHUNKS = 16;
const MAX_TEXT = 80_000;
const MAX_BYTES = 1_000_000;
const MAX_KEYS = 5;
const FAILED = "We could not read this file.";

export type ReadCounts = {
  ok: true;
  waiting: number;
  ready: number;
  skipped: number;
  failed: number;
};

type ReadOutcome =
  | { ok: true; waiting: number; ready: number; skipped: number; failed: number }
  | { ok: false };

type IndexedFile = {
  id: string;
  relative_path: string;
  status: string;
  object_key: string;
  size_bytes: number;
};

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomHex(size: number): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Split long notes so each piece stays short enough to embed. */
export function chunkText(text: string): string[] {
  const chunks: string[] = [];
  const limit = Math.min(text.length, CHUNK * MAX_CHUNKS);
  for (let index = 0; index < limit; index += CHUNK) {
    chunks.push(text.slice(index, index + CHUNK));
  }
  return chunks;
}

function unescapePdfLiteral(value: string): string {
  let out = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== "\\") {
      out += char;
      continue;
    }
    const next = value[index + 1];
    if (!next) break;
    if (next === "n") out += "\n";
    else if (next === "r") out += "\r";
    else if (next === "t") out += "\t";
    else if (next === "b") out += "\b";
    else if (next === "f") out += "\f";
    else if (next === "(" || next === ")" || next === "\\") out += next;
    else if (/[0-7]/.test(next)) {
      let octal = next;
      let cursor = index + 2;
      while (cursor < value.length && cursor < index + 4 && /[0-7]/.test(value[cursor] ?? "")) {
        octal += value[cursor];
        cursor += 1;
      }
      out += String.fromCharCode(Number.parseInt(octal, 8));
      index += octal.length;
      continue;
    } else out += next;
    index += 1;
  }
  return out;
}

function pdfWords(bytes: Uint8Array): string {
  const raw = new TextDecoder("latin1").decode(bytes);
  const parts: string[] = [];
  const pattern = /\((?:\\.|[^\\)])*\)/g;
  for (const match of raw.matchAll(pattern)) {
    parts.push(unescapePdfLiteral(match[0].slice(1, -1)));
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Plain text and simple PDF literal strings. Pictures have no words. */
export function wordsFromBytes(
  name: string,
  bytes: Uint8Array,
): { ok: true; text: string } | { ok: false } {
  const kind = previewKind(name);
  if (kind === "text") {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return text.trim().length > 0 ? { ok: true, text } : { ok: false };
  }
  if (kind === "pdf") {
    const text = pdfWords(bytes);
    return text.length > 0 ? { ok: true, text } : { ok: false };
  }
  return { ok: false };
}

async function saveRead(
  sql: Sql,
  file: IndexedFile,
  workspaceId: string,
  status: "waiting" | "ready" | "skipped" | "failed",
  summary: string | null,
  reason: string | null,
  sourceSha: string | null,
  now: number,
): Promise<void> {
  await sql.run(
    `INSERT INTO file_reads (file_id, workspace_id, status, summary, reason, source_sha, read_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(file_id) DO UPDATE SET
       status = excluded.status,
       summary = excluded.summary,
       reason = excluded.reason,
       source_sha = excluded.source_sha,
       read_at = excluded.read_at`,
    [file.id, workspaceId, status, summary, reason, sourceSha, now],
  );
}

async function replacePassages(
  sql: Sql,
  file: IndexedFile,
  workspaceId: string,
  chunks: string[],
  vectors: number[][],
): Promise<void> {
  await sql.run("DELETE FROM file_passages WHERE file_id = ?", [file.id]);
  for (let position = 0; position < chunks.length; position += 1) {
    const body = chunks[position];
    const vector = vectors[position];
    if (!body || !vector) continue;
    await sql.run(
      `INSERT INTO file_passages (id, file_id, workspace_id, position, body, embedding)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), file.id, workspaceId, position, body, JSON.stringify(vector)],
    );
  }
}

/** Read stored files in one space. A member cannot start a read. */
export async function readSpaceFiles(input: {
  sql: Sql;
  caller: Caller;
  workspaceId: string;
  now: number;
  understander: Understander | null;
  readBytes: (key: string) => Promise<Uint8Array | null>;
}): Promise<ReadOutcome> {
  if (!can(input.caller, "knowledge.manage", { workspaceId: input.workspaceId })) {
    return { ok: false };
  }
  const files = await input.sql.all<IndexedFile>(
    `SELECT f.id, f.relative_path, f.status, f.object_key, f.size_bytes
     FROM files f
     JOIN batches b ON b.id = f.batch_id AND b.workspace_id = f.workspace_id
     WHERE f.workspace_id = ?
       AND b.discarded_at IS NULL
       AND b.deleted_at IS NULL
       AND f.object_deleted_at IS NULL`,
    [input.workspaceId],
  );
  const counts = { waiting: 0, ready: 0, skipped: 0, failed: 0 };
  for (const file of files) {
    if (!["uploaded", "scanning", "clean", "held"].includes(file.status)) continue;
    if (file.size_bytes > MAX_BYTES) {
      await saveRead(input.sql, file, input.workspaceId, "skipped", null, "This file is too big to read.", null, input.now);
      counts.skipped += 1;
      continue;
    }
    let bytes: Uint8Array | null = null;
    try {
      bytes = await input.readBytes(file.object_key);
    } catch {
      await saveRead(input.sql, file, input.workspaceId, "failed", null, FAILED, null, input.now);
      counts.failed += 1;
      continue;
    }
    const words = bytes ? wordsFromBytes(file.relative_path, bytes) : { ok: false as const };
    if (!words.ok) {
      await saveRead(
        input.sql,
        file,
        input.workspaceId,
        "skipped",
        null,
        "This file has no words we can read.",
        null,
        input.now,
      );
      counts.skipped += 1;
      continue;
    }
    const text = words.text.slice(0, MAX_TEXT);
    const sourceSha = await sha256Hex(text);
    const existing = await input.sql.get<{ status: string; source_sha: string | null }>(
      "SELECT status, source_sha FROM file_reads WHERE file_id = ?",
      [file.id],
    );
    if (existing?.status === "ready" && existing.source_sha === sourceSha) continue;
    if (!input.understander) {
      await input.sql.run("DELETE FROM file_passages WHERE file_id = ?", [file.id]);
      await saveRead(input.sql, file, input.workspaceId, "waiting", null, null, sourceSha, input.now);
      counts.waiting += 1;
      continue;
    }
    try {
      const summary = await input.understander.summarize(file.relative_path, text);
      const chunks = chunkText(text);
      const vectors = await input.understander.embed(chunks);
      if (vectors.length !== chunks.length) throw new Error("bad vectors");
      await replacePassages(input.sql, file, input.workspaceId, chunks, vectors);
      await saveRead(input.sql, file, input.workspaceId, "ready", summary, null, sourceSha, input.now);
      counts.ready += 1;
    } catch {
      await input.sql.run("DELETE FROM file_passages WHERE file_id = ?", [file.id]);
      await saveRead(input.sql, file, input.workspaceId, "failed", null, FAILED, sourceSha, input.now);
      counts.failed += 1;
    }
  }
  return { ok: true, ...counts };
}

export type SearchHit = {
  fileName: string;
  passage: string;
  summary: string | null;
};

type PassageRow = {
  file_name: string;
  passage: string;
  summary: string | null;
  embedding: string;
};

function cosine(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) return -1;
  let dot = 0;
  let leftMag = 0;
  let rightMag = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftMag += a * a;
    rightMag += b * b;
  }
  if (leftMag === 0 || rightMag === 0) return -1;
  return dot / (Math.sqrt(leftMag) * Math.sqrt(rightMag));
}

function keywordHits(rows: PassageRow[], query: string): SearchHit[] {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
  if (words.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const row of rows) {
    const haystack = row.passage.toLowerCase();
    if (!words.some((word) => haystack.includes(word))) continue;
    hits.push({ fileName: row.file_name, passage: row.passage, summary: row.summary });
    if (hits.length >= 8) break;
  }
  return hits;
}

/** Cosine search when a reader is present. Otherwise match words in stored passages. */
export async function searchSpace(input: {
  sql: Sql;
  workspaceId: string;
  query: string;
  understander: Understander | null;
}): Promise<SearchHit[]> {
  const rows = await input.sql.all<PassageRow>(
    `SELECT f.relative_path AS file_name, p.body AS passage, r.summary AS summary, p.embedding
     FROM file_passages p
     JOIN files f ON f.id = p.file_id
     LEFT JOIN file_reads r ON r.file_id = p.file_id
     WHERE p.workspace_id = ?
     ORDER BY f.relative_path, p.position`,
    [input.workspaceId],
  );
  if (!input.understander) return keywordHits(rows, input.query);
  let vectors: number[][] = [];
  try {
    vectors = await input.understander.embed([input.query]);
  } catch {
    return keywordHits(rows, input.query);
  }
  const queryVector = vectors[0];
  if (!queryVector) return keywordHits(rows, input.query);
  const ranked = rows
    .map((row) => {
      let embedding: number[] = [];
      try {
        const parsed = JSON.parse(row.embedding) as unknown;
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === "number")) embedding = parsed;
      } catch {
        embedding = [];
      }
      return { row, score: cosine(queryVector, embedding) };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  if (ranked.length === 0) return keywordHits(rows, input.query);
  return ranked.map((item) => ({
    fileName: item.row.file_name,
    passage: item.row.passage,
    summary: item.row.summary,
  }));
}

export async function listFileReads(
  sql: Sql,
  workspaceId: string,
): Promise<{ name: string; status: string }[]> {
  return sql.all<{ name: string; status: string }>(
    `SELECT f.relative_path AS name, r.status AS status
     FROM file_reads r
     JOIN files f ON f.id = r.file_id
     WHERE r.workspace_id = ?
     ORDER BY f.relative_path`,
    [workspaceId],
  );
}

/** A project key is shown once. Only the hash is stored, and only for this space. */
export async function issueKnowledgeKey(input: {
  sql: Sql;
  caller: Caller;
  workspaceId: string;
  now: number;
}): Promise<{ ok: true; token: string } | { ok: false }> {
  if (!can(input.caller, "knowledge.manage", { workspaceId: input.workspaceId })) {
    return { ok: false };
  }
  const live = await input.sql.get<{ n: number }>(
    "SELECT count(*) AS n FROM knowledge_keys WHERE workspace_id = ? AND revoked_at IS NULL",
    [input.workspaceId],
  );
  if (Number(live?.n ?? 0) >= MAX_KEYS) return { ok: false };
  const token = `hk_${randomHex(32)}`;
  await input.sql.run(
    `INSERT INTO knowledge_keys (id, workspace_id, token_hash, label, created_at, revoked_at)
     VALUES (?, ?, ?, 'Project key', ?, NULL)`,
    [crypto.randomUUID(), input.workspaceId, await sha256Hex(token), input.now],
  );
  return { ok: true, token };
}

export async function workspaceIdForKnowledgeKey(sql: Sql, token: string): Promise<string | null> {
  if (!token.startsWith("hk_") || token.length < 8) return null;
  const row = await sql.get<{ workspace_id: string }>(
    "SELECT workspace_id FROM knowledge_keys WHERE token_hash = ? AND revoked_at IS NULL",
    [await sha256Hex(token)],
  );
  return row?.workspace_id ?? null;
}
