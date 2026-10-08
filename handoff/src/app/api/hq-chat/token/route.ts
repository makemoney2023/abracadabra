import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { signHqChatToken } from "@/lib/hq-chat-token";
import { staffFromRequest } from "@/lib/staff-request";

export const dynamic = "force-dynamic";

function agentHost(): string {
  return (process.env.AGENT_URL ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export async function GET(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const staff = await staffFromRequest(sql, request, Date.now());
  if (!staff.ok || !staff.caller.userId) {
    return NextResponse.json({ ok: false }, { status: staff.ok ? 401 : staff.status });
  }
  const secret = process.env.HQ_CHAT_SECRET ?? "";
  if (!secret) return NextResponse.json({ ok: false }, { status: 503 });
  const now = Date.now();
  return NextResponse.json({
    token: signHqChatToken(staff.caller.userId, secret, now),
    userId: staff.caller.userId,
    agent: "hq-chat",
    host: agentHost(),
  });
}
