import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { listAgentDispatches } from "@/lib/agent-dispatch";
import { agentForToken, fileAgentWork, listAgentContext } from "@/lib/agent-work-filing";
import { agentWorkLimits, tooBigMessage } from "@/lib/agent-work-limits";
import { hqOrigin } from "@/lib/client-services-auth";
import { openObjectStore } from "@/lib/store/objects";

export const dynamic = "force-dynamic";

/**
 * A client agent files work: anything finished (deliverables, notes, plans, logs). Bearer is the agent's own token (caw_...).
 * The client must be one of the agent's assignments. Anything that does not resolve waits as unfiled for staff.
 * Body: { external_id, title, kind?, summary?, content?, attachments?: [{ name, body }], links?: [{ label, url }],
 *         client?: { organization_id?, domain?, space_slug? }, project_id?, task_id?, keep_task_open?,
 *         handoff?: { to, note? }, finished_at?, agent_id?, supersedes?: id | [ids], work_request_id?, thread_id?,
 *         deliverable_kind?, folder? }
 * folder: where the files land in the space, like "Social/Facebook" (up to 6 levels). Default: Finished work/<date> <title>.
 * Files keep readable names (post-1.png); a name already in the folder gets " (2)", except names of filings it supersedes.
 * attachments[].body: text (a .html/.csv/.txt/... name keeps its extension) or a base64 data URL
 * (data:image/png|jpeg|webp|gif;base64,... or data:application/pdf;base64,...).
 * Size: AGENT_WORK_MAX_MB (default 10) MB of files after decoding; the JSON may be about 4/3 of that plus 1 MB. Over: 413.
 * Filed work is held: client members see it only after Client Services approves the card. A task_id never closes the
 * card: it goes to Waiting on Client Services (a Done card is reopened), unless keep_task_open is true.
 */
export async function POST(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const limits = agentWorkLimits();
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > limits.maxBodyBytes) {
    return NextResponse.json({ error: tooBigMessage("body", declared, limits), code: "too_big", limit_mb: limits.maxMb }, { status: 413 });
  }
  const raw = await request.text();
  const size = new TextEncoder().encode(raw).byteLength;
  if (size > limits.maxBodyBytes) {
    return NextResponse.json({ error: tooBigMessage("body", size, limits), code: "too_big", limit_mb: limits.maxMb }, { status: 413 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Check the body." }, { status: 400 });
  }
  const result = await fileAgentWork(sql, openObjectStore(), agent, payload, Date.now());
  if (!result.ok) {
    if (result.error === "too_big") return NextResponse.json({ error: result.message, code: "too_big", limit_mb: limits.maxMb }, { status: 413 });
    return NextResponse.json({ error: result.message }, { status: result.error === "forbidden" ? 403 : 400 });
  }
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
        ...(result.folder !== undefined ? { folder: result.folder } : {}),
        task_closed: result.taskClosed,
        handoff_to: result.handoffTo,
        held: true,
        ...(result.review
          ? {
              deliverable_id: result.review.deliverableId,
              deliverable_version: result.review.deliverableVersion,
              awaiting_review: result.review.awaitingReview,
              task_reopened: result.review.taskReopened,
              work_request_id: result.review.workRequestId,
              superseded: result.review.superseded,
            }
          : {}),
        ...(result.review && !result.review.deliverableId
          ? { note: "Held with no card: no review will release it. File it again with task_id and supersedes, or withdraw it." }
          : {}),
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
