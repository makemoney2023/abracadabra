import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { createAgentTask } from "@/lib/agent-board";
import { agentForToken } from "@/lib/agent-work-filing";
import { parseBrief } from "@/lib/card-brief";

export const dynamic = "force-dynamic";

/**
 * New task on a client's board. Bearer agent token.
 * Body: { title, note?, stage?: todo|doing (old names describe|engineer still work), client?, project_id?, assignee?,
 *         work_request_id?, thread_id?, description?, requirements?: [..], acceptance_criteria?: [..] }
 * description, requirements and acceptance_criteria are the card's brief (lists of text lines, up to 30 each); GET
 * /api/agent-board and GET /api/agent-board/tasks/<id> return them. Without a description, the note is the description.
 * work_request_id (from Client Services' handoff) or thread_id links the card, its filings and the feed to the email.
 * assignee: agent id on the same client (lead only for someone else; a hire's cards default to itself). 400 if that
 * agent is not on the client. List project ids with GET /api/agent-projects.
 */
export async function POST(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Check the body." }, { status: 400 });
  }
  const brief = parseBrief(body ?? {});
  if (!brief.ok) return NextResponse.json({ error: brief.message }, { status: 400 });
  const result = await createAgentTask(sql, agent, {
    brief: brief.brief,
    client: body?.client,
    projectId: typeof body?.project_id === "string" ? body.project_id : null,
    title: typeof body?.title === "string" ? body.title : "",
    note: typeof body?.note === "string" ? body.note : null,
    stage: typeof body?.stage === "string" ? body.stage : null,
    assignee: typeof body?.assignee === "string" ? body.assignee : null,
    workRequestId: typeof body?.work_request_id === "string" ? body.work_request_id : null,
    threadId: typeof body?.thread_id === "string" ? body.thread_id : null,
    now: Date.now(),
  });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result, { status: 201 });
}
