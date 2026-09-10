import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

const FEEDBACK_TYPES = ["bug", "idea", "other"] as const;
type FeedbackType = (typeof FEEDBACK_TYPES)[number];

const MESSAGE_MIN_LENGTH = 4;
const MESSAGE_MAX_LENGTH = 2000;
const EMAIL_MAX_LENGTH = 254;
const PAGE_URL_MAX_LENGTH = 2048;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) return true;

  entry.count += 1;
  return false;
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function isAllowedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const originHost = new URL(origin).host;
    const requestHost =
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host");

    return originHost === requestHost;
  } catch {
    return false;
  }
}

interface FeedbackPayload {
  type: FeedbackType;
  message: string;
  email?: string;
  pageUrl?: string;
  honeypot?: string;
}

function isValidPayload(body: unknown): body is FeedbackPayload {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;

  if (typeof b.type !== "string" || !FEEDBACK_TYPES.includes(b.type as FeedbackType)) return false;
  if (typeof b.message !== "string") return false;

  const trimmedMessage = b.message.trim();
  if (trimmedMessage.length < MESSAGE_MIN_LENGTH || trimmedMessage.length > MESSAGE_MAX_LENGTH) return false;

  if (b.email !== undefined && (typeof b.email !== "string" || b.email.length > EMAIL_MAX_LENGTH)) return false;
  if (b.pageUrl !== undefined && (typeof b.pageUrl !== "string" || b.pageUrl.length > PAGE_URL_MAX_LENGTH)) return false;
  if (b.honeypot !== undefined && typeof b.honeypot !== "string") return false;

  return true;
}

export async function POST(request: NextRequest) {
  try {
    if (!isAllowedOrigin(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ip = getClientIp(request);
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    if (!isValidPayload(body)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (body.honeypot) {
      return NextResponse.json({ ok: true });
    }

    const message = body.message.trim().slice(0, MESSAGE_MAX_LENGTH);
    const email = body.email?.trim().slice(0, EMAIL_MAX_LENGTH) || null;

    if (email && !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("feedback").insert({
      user_id: user?.id ?? null,
      email: user ? null : email,
      type: body.type,
      message,
      page_url: body.pageUrl?.slice(0, PAGE_URL_MAX_LENGTH) ?? null,
      user_agent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
      locale: request.headers.get("accept-language")?.split(",")[0]?.slice(0, 20) ?? null,
    });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Feedback API Route] Error:", error);
    return NextResponse.json({ error: "Failed to submit feedback" }, { status: 500 });
  }
}