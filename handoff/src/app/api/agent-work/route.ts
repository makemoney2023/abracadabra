import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { listAgentDispatches } from "@/lib/agent-dispatch";
import { agentForToken, fileAgentWork, listAgentContext, MAX_BODY_BYTES } from "@/lib/agent-work-filing";
import { hqOrigin } from "@/lib/client-services-auth";
import { openObjectStore } from "@/lib/store/objects";

export const dynamic = "force-dynamic";

/**
 * A client agent files work: anything finished (deliverables, notes, plans, logs). Bearer is the agent's own token (caw_...).
 * The client must be one of the agent's assignments. Anything that does not resolve waits as unfiled for staff.
 * Body: { external_id, title, kind?, summary?, content?, attachments?: [{ name, body }], links?: [{ label, url }],
 *         client?: { organization_id?, domain?, space_slug? }, project_id?, task_id?, keep_task_open?,
 *         handoff?: { to, note? }, finished_at?, agent_id?, folder?, supersedes? }
 * An attachment body is text, or a base64 data URL (data:image/png;base64,...) for a picture or PDF.
 * Files land in `folder` ("Social/Facebook"), else "Finished work/<date> <title>", held from client members until
 * Client Services approves. A task_id moves to Waiting on Client Services (unless keep_task_open), never to done.
 */
export async function POST(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Too big. Send large files as links." }, { status: 413 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Check the body." }, { status: 400 });
  }
  const result = await fileAgentWork(sql, openObjectStore(), agent, payload, Date.now());
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.error === "forbidden" ? 403 : 400 });
  if (result.state === "filed") {
    return NextResponse.json(
      {
        ok: true,
        duplicate: result.duplicate,
        state: "filed",
        work_item_id: result.workItemId,
        organization_id: result.organizationId,
        space: { id: result.workspaceId, slug: result.spaceSlug, url: `${hqOrigin(request)}/w/${result.spaceSlug}` },
        project_id: result.projectId,
        route: result.route,
        paths: result.paths,
        task_closed: result.taskClosed,
        handoff_to: result.handoffTo,
        review_state: result.reviewState ?? null,
        folder: result.folder ?? null,
        deliverable_id: result.deliverableId ?? null,
        awaiting_review: result.awaitingReview ?? false,
        ...(result.supersededId ? { superseded: result.supersededId } : {}),
      },
      { status: result.duplicate ? 200 : 201 },
    );
  }
  return NextResponse.json(
    { ok: true, duplicate: result.duplicate, state: result.state, work_item_id: result.workItemId, reason: result.reason },
    { status: result.duplicate ? 200 : 202 },
  );
}

/**
 * Context read-back: work filed for this agent's clients, by any agent. ?client= &since= &kind= &handed_to_me=1 &limit=
 * ?dispatches=1 [&since=]: tasks HQ handed to this agent (AGENT_MODE=agents board build/run and client change requests).
 */
export async function GET(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  if (params.get("dispatches") === "1") {
    const since = params.get("since");
    const at = since ? (/^\d+$/.test(since) ? Number(since) : Date.parse(since)) : 0;
    if (!Number.isFinite(at)) return NextResponse.json({ error: "Bad since. Use ISO time or unix ms." }, { status: 400 });
    return NextResponse.json({ agent_id: agent.agentId, dispatches: await listAgentDispatches(sql, agent, at) });
  }
  const result = await listAgentContext(sql, agent, {
    client: params.get("client"),
    since: params.get("since"),
    kind: params.get("kind"),
    handedToMe: params.get("handed_to_me") === "1",
    limit: params.get("limit") ? Number(params.get("limit")) : undefined,
  });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json({
    agent_id: agent.agentId,
    clients: agent.assignments.map((row) => ({ organization_id: row.organizationId, role: row.role })),
    items: result.items,
  });
}
