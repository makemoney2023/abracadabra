import { NextResponse } from "next/server";
import { verifyIntakeRequest } from "./sign";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

type QueueBinding = { send(body: unknown): Promise<void> };

type CloudflareEnv = {
  LEAD_INTAKE?: QueueBinding;
  INTAKE_SIGNING_SECRET?: string;
  LEAD_AGENT_SIGNING_SECRET?: string;
  ENRICHMENT_SIGNING_SECRET?: string;
};

function cloudflareEnv(): CloudflareEnv {
  const holder = globalThis as typeof globalThis & {
    [CLOUDFLARE_CONTEXT]?: { env?: CloudflareEnv };
  };
  return holder[CLOUDFLARE_CONTEXT]?.env ?? {};
}

export function intakeSecret(): string {
  const fromProcess = process.env.INTAKE_SIGNING_SECRET?.trim() ?? "";
  if (fromProcess) return fromProcess;
  return cloudflareEnv().INTAKE_SIGNING_SECRET?.trim() ?? "";
}

/** BDR agent key. Separate from INTAKE_SIGNING_SECRET so it can be revoked on its own. */
export function leadAgentSecret(): string {
  const fromProcess = process.env.LEAD_AGENT_SIGNING_SECRET?.trim() ?? "";
  if (fromProcess) return fromProcess;
  return cloudflareEnv().LEAD_AGENT_SIGNING_SECRET?.trim() ?? "";
}

/** Account Research key for enrichment intake. Separate so it can be revoked on its own. */
export function enrichmentSecret(): string {
  const fromProcess = process.env.ENRICHMENT_SIGNING_SECRET?.trim() ?? "";
  if (fromProcess) return fromProcess;
  return cloudflareEnv().ENRICHMENT_SIGNING_SECRET?.trim() ?? "";
}

export function intakeQueue(): QueueBinding | undefined {
  return cloudflareEnv().LEAD_INTAKE;
}

/** Check the signature, then the body, then put the message on the queue. */
export async function acceptIntake(
  request: Request,
  source: "assessment" | "booking" | "schema" | "lead" | "enrichment",
  ready: (payload: unknown) => boolean,
  now = Date.now(),
  secret: string = source === "lead" ? leadAgentSecret() : source === "enrichment" ? enrichmentSecret() : intakeSecret(),
): Promise<Response> {
  const raw = await request.text();
  const verdict = await verifyIntakeRequest({
    secret,
    body: raw,
    signature: request.headers.get("x-intake-signature") ?? "",
    timestamp: request.headers.get("x-intake-timestamp") ?? "",
    now,
  });
  if (!verdict.ok) {
    const error = verdict.error === "stale" ? "That request is too old." : "Bad signature.";
    return NextResponse.json({ error }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Check the body." }, { status: 400 });
  }
  if (!ready(payload)) {
    return NextResponse.json({ error: "Check the body." }, { status: 400 });
  }
  const queue = intakeQueue();
  if (!queue) {
    return NextResponse.json({ error: "Intake is not ready." }, { status: 503 });
  }
  await queue.send({ source, payload });
  return NextResponse.json({ ok: true }, { status: 202 });
}

export function assessmentBodyReady(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const body = payload as Record<string, unknown>;
  const id = typeof body.assessment_id === "string" ? body.assessment_id.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const domain = typeof body.domain === "string" ? body.domain.trim() : "";
  return id.length > 0 && (email.length > 0 || domain.length > 0);
}

export function schemaBodyReady(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const body = payload as Record<string, unknown>;
  const scanId = typeof body.scan_id === "string" ? body.scan_id.trim() : "";
  const domain = typeof body.domain === "string" ? body.domain.trim() : "";
  return scanId.length > 0 && domain.length > 0 && Array.isArray(body.files) && body.files.length > 0;
}

export function bookingBodyReady(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const body = payload as Record<string, unknown>;
  const id = typeof body.external_id === "string" ? body.external_id.trim() : "";
  const starts = body.starts_at;
  const hasStart = typeof starts === "number" || (typeof starts === "string" && starts.trim().length > 0);
  return id.length > 0 && hasStart;
}

export function leadBodyReady(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const body = payload as Record<string, unknown>;
  const id = typeof body.external_id === "string" ? body.external_id.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const domain = typeof body.domain === "string" ? body.domain.trim() : "";
  if (!id || (!email && !domain)) return false;
  const fit = body.bdr_fit_score;
  if (fit != null && !(typeof fit === "number" && Number.isInteger(fit) && fit >= 1 && fit <= 5)) return false;
  return true;
}

export function enrichmentBodyReady(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const body = payload as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return text(body.external_id).length > 0 && (text(body.deal_id).length > 0 || text(body.domain).length > 0);
}
