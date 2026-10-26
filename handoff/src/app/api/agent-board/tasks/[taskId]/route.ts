import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { getAgentTask, parseBoardAction, updateAgentTask } from "@/lib/agent-board";
import { agentForToken } from "@/lib/agent-work-filing";
import { cfEnv } from "@/lib/client-services-auth";
import type { SkillBucket } from "@/lib/skill-library";

export const dynamic = "force-dynamic";

/**
 * One board change. Bearer agent token. Body is one of:
 * { action: "start" } | { action: "pause" } | { action: "block", reason } | { action: "review", note? }
 * | { action: "move", to: todo|doing|review|done } | { action: "note", body }
 * | { action: "attach_skills", prefixes: [...] } | { action: "detach_skills", prefixes: [...] }
 * | { action: "assign", to: "<agent id>" | null }  (lead only; null or "lead" hands the card back to the lead)
 * | { action: "describe", description?, requirements?: [..], acceptance_criteria?: [..] }  (the card's owner or the lead;
 *   fields not sent keep their value; stored on the card's timeline, no schema change)
 * | { action: "approve", note? }  Waiting on Client Services to Done. Only agents listed in src/lib/review-approvers.ts on
 *   their listed clients (today: scrum-master on Abracadabra, Renew Implants, Strong Foam, LioCorr), never on their own
 *   work. Everyone else gets 403. Logged as client_agent.task_review with the agent as actor. No agent send back.
 * The board has four columns: To do, Doing, Waiting on Client Services (review), Done. The old stage names are
 * aliases: describe is todo; engineer, build, and run are doing. A move to doing stores stage build and, with
 * AGENT_MODE=agents, hands the task to its agent assignee (else the lead agent); it is refused while AGENT_MODE is legacy (it would start a
 * swarm or Cursor run). A card waiting on Client Services can't be started, paused, or moved. No deletes.
 * Skill packs (library prefixes) attach to any open card of a client this agent is on, review included: 403 for
 * another client's card, 404 for a missing card or an unknown pack, 409 for a done card.
 */
/** One card of a client this agent is assigned to now: the board fields, description, requirements, acceptance
 * criteria, notes, and filings with the skills each cited. 404 for a missing card or another client's card. */
export async function GET(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { taskId } = await context.params;
  const result = await getAgentTask(sql, agent, taskId);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result);
}

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Check the body." }, { status: 400 });
  }
  const change = parseBoardAction(body);
  if (!change) return NextResponse.json({ error: "Unknown or incomplete action." }, { status: 400 });
  const { taskId } = await context.params;
  const result = await updateAgentTask(sql, agent, { taskId, change, now: Date.now(), bucket: cfEnv().SKILLS as SkillBucket | undefined });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result);
}
