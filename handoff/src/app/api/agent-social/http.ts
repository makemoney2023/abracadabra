import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { agentForToken } from "@/lib/agent-work-filing";
import type { SocialQueryError } from "@/lib/social-queries";

export async function agentSocialSession(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  return { sql, agent };
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

export function socialResponse(result: ({ ok: true } & Record<string, unknown>) | SocialQueryError) {
  if (!result.ok) return NextResponse.json({ error: result.message, reasonCode: result.reasonCode }, { status: result.status });
  const body = Object.fromEntries(Object.entries(result).filter(([key]) => key !== "ok"));
  return NextResponse.json(body);
}

export function clientOf(request: Request): string | null {
  return new URL(request.url).searchParams.get("client");
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

export type SocialWriteResult =
  | { ok: true; status: number; body: Record<string, unknown> }
  | { ok: false; status: number; reasonCode: string; message: string; extra?: Record<string, unknown> };

export function writeResponse(result: SocialWriteResult) {
  if (!result.ok) {
    return NextResponse.json({ error: result.message, reasonCode: result.reasonCode, ...result.extra }, { status: result.status });
  }
  return NextResponse.json(result.body, { status: result.status });
}

export function invalidBody() {
  return writeResponse({ ok: false, status: 400, reasonCode: "invalid_body", message: "The request body must be JSON." });
}
