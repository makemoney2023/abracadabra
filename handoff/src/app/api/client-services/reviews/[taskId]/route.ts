import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { clientServicesAuthorized } from "@/lib/client-services-auth";
import { defaultBuildDeps } from "@/lib/cursor-build";
import { clientServicesReview } from "@/lib/task-review";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, { status: number; message: string }> = {
  missing: { status: 404, message: "No such task." },
  not_in_review: { status: 409, message: "That task is not waiting on review." },
  note_required: { status: 400, message: "send_back needs a note so the agent knows what to change." },
  invalid: { status: 400, message: "action must be approve or send_back." },
};

/**
 * Client Services decides one Review card. Bearer CLIENT_SERVICES_TOKEN.
 * Body: { action: "approve" } moves it to Done (timeline and feed).
 *       { action: "send_back", note, to?: "build" } returns it to its stage as in progress (or to build). In
 *       AGENT_MODE=agents the lead agent gets a "changes" handoff with the note.
 */
export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }) {
  if (!clientServicesAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { taskId } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Check the body." }, { status: 400 });
  }
  const sql = await openHandoffDb();
  await migrate(sql);
  const now = Date.now();
  const decided = await clientServicesReview(sql, {
    taskId,
    action: body?.action,
    note: body?.note,
    to: body?.to,
    now,
    build: defaultBuildDeps(now),
  });
  if (!decided.ok) {
    const known = ERRORS[decided.error] ?? { status: 400, message: `That was refused (${decided.error}).` };
    return NextResponse.json({ error: known.message, code: decided.error }, { status: known.status });
  }
  return NextResponse.json({
    ok: true,
    task_id: decided.taskId,
    column: decided.column,
    stage: decided.stage,
    status: decided.status,
    ...(decided.handedTo !== undefined ? { handed_to: decided.handedTo } : {}),
    ...(decided.runId ? { run_id: decided.runId } : {}),
    ...(decided.waiting ? { waiting: decided.waiting } : {}),
  });
}
