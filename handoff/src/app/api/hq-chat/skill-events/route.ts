import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { staffFromRequest } from "@/lib/staff-request";
import { afterResponse, writeSkillEvents } from "@/lib/skill-usage";

export const dynamic = "force-dynamic";

/**
 * Staff chat's search_skills / read_skill usage, posted by the HqChat Durable Object after each tool call.
 * Bearer: the staff member's chat token (same as /api/hq-tools). Body: { event: "search" | "read", query?, path?,
 * result_count?, status?, organization_id?, task_id? }. Always 202 for a signed-in staff member; nothing else changes.
 */
export async function POST(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const now = Date.now();
  const staff = await staffFromRequest(sql, request, now);
  if (!staff.ok) return NextResponse.json({ error: "Unauthorized." }, { status: staff.status });
  let body: Record<string, unknown> = {};
  try {
    const parsed = (await request.json()) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Check the body." }, { status: 400 });
  }
  const event = body.event === "read" ? "read" : body.event === "search" ? "search" : null;
  if (!event) return NextResponse.json({ error: "event must be search or read." }, { status: 400 });
  const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
  const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null);
  const actorId = staff.caller.userId;
  await afterResponse(() =>
    writeSkillEvents(sql, [
      {
        event,
        actorKind: "staff",
        actorId,
        organizationId: text(body.organization_id, 100),
        taskId: text(body.task_id, 100),
        path: text(body.path, 400),
        query: text(body.query, 200),
        resultCount: number(body.result_count),
        status: number(body.status),
        source: "staff-chat",
        at: now,
      },
    ]),
  );
  return NextResponse.json({ ok: true }, { status: 202 });
}
