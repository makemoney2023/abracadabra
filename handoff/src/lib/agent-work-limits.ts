/**
 * Size limits for POST /api/agent-work (one filing per request).
 *
 * AGENT_WORK_MAX_MB (Worker var or process env, default 10, 1 to 50) caps the decoded file bytes of one filing:
 * attachments (text, or base64 data: URLs after decoding) plus content. The raw JSON body may be about a third
 * bigger, because base64 inflates by 4/3, plus 1 MB for the summary, links and JSON envelope.
 *
 * Other limits on the way (checked for this change):
 * - Cloudflare Workers request body: 100 MB on Free and Pro, 200 MB Business, 500 MB Enterprise. 50 MB of files is
 *   about 68 MB of JSON, so the ceiling of 50 stays below the smallest plan limit; Worker memory (128 MB) is the
 *   practical bound, which is why 50 is the maximum.
 * - Files: bytes go to R2 (FILES bucket); D1 holds only the row. A payload kept while a filing waits as unfiled also
 *   goes to R2 (agent_work_items.payload_key), never into a D1 row (D1 caps a row or string at 2 MB).
 * - Per-file and per-batch manifest caps (policy/limits.ts): 2 GB a file, 10 GB a batch, 2,000 files.
 * - Virus scan (worker/clamd.conf): StreamMaxLength, MaxFileSize and MaxScanSize are 2G.
 */

export const DEFAULT_AGENT_WORK_MAX_MB = 10;
export const MAX_AGENT_WORK_MAX_MB = 50;
export const MAX_ATTACHMENTS = 50;
const MB = 1024 * 1024;
const ENVELOPE_BYTES = 1 * MB;
const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

function configuredMb(env?: { AGENT_WORK_MAX_MB?: unknown }): number {
  const holder = globalThis as typeof globalThis & { [CLOUDFLARE_CONTEXT]?: { env?: Record<string, unknown> } };
  const raw = env?.AGENT_WORK_MAX_MB ?? process.env.AGENT_WORK_MAX_MB ?? holder[CLOUDFLARE_CONTEXT]?.env?.AGENT_WORK_MAX_MB;
  const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_AGENT_WORK_MAX_MB;
  return Math.min(Math.max(value, 1), MAX_AGENT_WORK_MAX_MB);
}

export type AgentWorkLimits = {
  /** Decoded file bytes one filing may carry. */
  maxFileBytes: number;
  /** Raw request body bytes (JSON with base64). */
  maxBodyBytes: number;
  maxMb: number;
};

export function agentWorkLimits(env?: { AGENT_WORK_MAX_MB?: unknown }): AgentWorkLimits {
  const maxMb = configuredMb(env);
  const maxFileBytes = Math.floor(maxMb * MB);
  return { maxMb, maxFileBytes, maxBodyBytes: Math.ceil((maxFileBytes * 4) / 3) + ENVELOPE_BYTES };
}

/** Bytes a body string becomes once stored: base64 data URLs decoded, text as UTF-8. */
export function storedBytes(body: string): number {
  const data = /^\s*data:[^;,]+;base64,/i.exec(body);
  if (data) {
    const compact = body.slice(data[0].length).replace(/\s/g, "");
    const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((compact.length * 3) / 4) - padding);
  }
  return new TextEncoder().encode(body).byteLength;
}

export function megabytes(bytes: number): string {
  const value = bytes / MB;
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} MB`;
}

export function tooBigMessage(kind: "body" | "files", size: number, limits: AgentWorkLimits): string {
  if (kind === "body") {
    return `Too big: this request is ${megabytes(size)}; one filing takes up to ${megabytes(limits.maxBodyBytes)} of JSON (${limits.maxMb} MB of files after base64 decoding). Split it into filings on the same card (they join the same deliverable version) or send large files as links.`;
  }
  return `Too big: these files are ${megabytes(size)} once decoded; one filing takes up to ${limits.maxMb} MB. Split it into filings on the same card (they join the same deliverable version) or send large files as links.`;
}
