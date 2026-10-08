import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  noteUnlinkedChannel,
  organizationForSenderThread,
  organizationForSlackChannel,
  recordStaffChannelNote,
  recordThreadMessage,
  recordUnknownSender,
  threadState,
} from "@/db/conversations";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { lookupEmailSender } from "@/lib/client-channel-store";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CLIENT_CHANNEL_SECRET ?? "";
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!secret || !bearer) return false;
  const left = Buffer.from(bearer);
  const right = Buffer.from(secret);
  return left.length === right.length && timingSafeEqual(left, right);
}

function text(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

/** Channel storage for handoff-agent, which has no D1. The bearer is CLIENT_CHANNEL_SECRET. */
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    const parsed = (await request.json()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const sql = await openHandoffDb();
  await migrate(sql);
  const action = text(body, "action");
  const now = Date.now();
  if (action === "lookup") {
    return NextResponse.json({
      ok: true,
      value: await lookupEmailSender(sql, text(body, "email"), text(body, "authenticationResults")),
    });
  }
  if (action === "thread_org") {
    return NextResponse.json({
      ok: true,
      value: await organizationForSenderThread(sql, text(body, "threadId"), text(body, "email")),
    });
  }
  if (action === "thread") {
    const organizationId = text(body, "organizationId");
    const threadId = text(body, "threadId");
    if (!organizationId || !threadId) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
    return NextResponse.json({ ok: true, value: await threadState(sql, organizationId, threadId, now) });
  }
  if (action === "slack_org") {
    return NextResponse.json({ ok: true, value: await organizationForSlackChannel(sql, text(body, "channelId")) });
  }
  if (action === "unlinked_slack") {
    const channelId = text(body, "channelId");
    if (!channelId) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
    return NextResponse.json({ ok: true, value: await noteUnlinkedChannel(sql, channelId, now) });
  }
  if (action === "staff_log") {
    const channelId = text(body, "channelId");
    const organizationId = await organizationForSlackChannel(sql, channelId);
    if (!organizationId) return NextResponse.json({ ok: true });
    await recordStaffChannelNote(
      sql,
      { organizationId, threadId: text(body, "ts") || channelId, sender: text(body, "user"), body: text(body, "text") },
      now,
    );
    return NextResponse.json({ ok: true });
  }
  if (action === "record") {
    const organizationId = text(body, "organizationId");
    if (body.noteOnly === true) {
      if (organizationId) await recordUnknownSender(sql, { organizationId, sender: text(body, "sender") }, now);
      return NextResponse.json({ ok: true });
    }
    const threadId = text(body, "threadId");
    if (!organizationId || !threadId) return NextResponse.json({ ok: true });
    const id = await recordThreadMessage(
      sql,
      {
        organizationId,
        channel: body.channel === "slack" ? "slack" : "email",
        threadId,
        sender: text(body, "sender"),
        body: text(body, "body"),
        state: body.state === "proposed" ? "proposed" : "clarifying",
        goal: text(body, "goal") || null,
        dueText: text(body, "dueText") || null,
        asked: body.asked === true,
        replyBody: text(body, "replyBody") || undefined,
      },
      now,
    );
    return NextResponse.json({ ok: true, value: { id } });
  }
  return NextResponse.json({ ok: false, error: "unknown" }, { status: 400 });
}
