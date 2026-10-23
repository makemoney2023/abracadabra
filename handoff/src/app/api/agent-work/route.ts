import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { listAgentDispatches } from "@/lib/agent-dispatch";
import { agentForToken, fileAgentWork, listAgentContext, parseSkillsUsed } from "@/lib/agent-work-filing";
import { agentWorkLimits, tooBigMessage } from "@/lib/agent-work-limits";
import { cfEnv, hqOrigin } from "@/lib/client-services-auth";
import { openObjectStore } from "@/lib/store/objects";
import type { SkillBucket } from "@/lib/skill-library";
import { loadCatalog } from "@/lib/skill-packs";
import { recordSkillsUsed } from "@/lib/skill-usage";

export const dynamic = "force-dynamic";

/**
 * A client agent files work: anything finished (deliverables, notes, plans, logs). Bearer is the agent's own token (caw_...).
 * The client must be one of the agent's assignments. Anything that does not resolve waits as unfiled for staff.
 * Body: { external_id, title, kind?, summary?, client_summary?, content?, attachments?: [{ name, body }], links?: [{ label, url }],
 *         client?: { organization_id?, domain?, space_slug? }, project_id?, task_id?, keep_task_open?,
 *         handoff?: { to, note? }, finished_at?, agent_id?, supersedes?: id | [ids], work_request_id?, thread_id?,
 *         deliverable_kind?, folder?, skills_used?: ["community/marketingskills/copywriting/SKILL.md", ...],
 *         already_delivered?, built_work?: { title, live_url?, preview_url?, repo_url?, description?, status?, screenshot? } | [up to 12] }
 * built_work: websites and other things we built, shown as cards in the client space once Client Services approves.
 *   live_url or preview_url is required (https). status: live | preview | in_progress | archived. screenshot: an image
 *   attachment name in this filing, or a data:image/png|jpeg|webp;base64 URL (stored in R2, counts toward the size cap).
 * already_delivered: true (or kind "catalog"): finished before it was filed. Approval publishes it approved, no client update.
 * skills_used: the library skills this work followed (up to 30). Each is checked against the published index; unknown
 * paths are dropped and listed back as skills_unknown. Each kept path is logged as a cite in the skill usage table.
 * client_summary: what a client member reads first on Finished work (plain words, no ids). summary is the agent's note.
 * folder: where the files land in the space, like "Social/Facebook" (up to 6 levels). Default: Finished work/<date> <title>.
 * Files keep readable names (post-1.png); a name already in the folder gets " (2)", except names of filings it supersedes.
 * attachments[].body: text (a .html/.csv/.txt/... name keeps its extension) or a base64 data URL
 * (data:image/png|jpeg|webp|gif;base64,... or data:application/pdf;base64,... or data:video/mp4|webm|quicktime;base64,...).
 * A clip (MP4, WebM or MOV) must really be one (checked from its bytes, else 400) and plays in HQ with a Range-aware player.
 * A picture attached as "<clip name>-poster.png|jpg|webp" in the same filing is that clip's poster.
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
  const now = Date.now();
  const result = await fileAgentWork(sql, openObjectStore(), agent, payload, now);
  if (!result.ok) {
    if (result.error === "too_big") return NextResponse.json({ error: result.message, code: "too_big", limit_mb: limits.maxMb }, { status: 413 });
    const status = result.error === "forbidden" ? 403 : result.error === "conflict" ? 409 : 400;
    return NextResponse.json({ error: result.message }, { status });
  }
  const skills = await skillsUsedFor(sql, agent, payload, result.duplicate ? null : result.workItemId, now);
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
        ...(result.builtWork ? { built_work: result.builtWork } : {}),
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
        ...skills,
        ...(result.review && !result.review.deliverableId
          ? { note: "Held with no card: no review will release it. File it again with task_id and supersedes, or withdraw it." }
          : {}),
      },
      { status: result.duplicate ? 200 : 201 },
    );
  }
  return NextResponse.json(
    { ok: true, duplicate: result.duplicate, state: result.state, work_item_id: result.workItemId, reason: result.reason, ...skills },
    { status: result.duplicate ? 200 : 202 },
  );
}

/** skills_used on a new filing: stored, logged as cites, and echoed back. A repeat (duplicate) records nothing. */
async function skillsUsedFor(
  sql: Awaited<ReturnType<typeof openHandoffDb>>,
  agent: NonNullable<Awaited<ReturnType<typeof agentForToken>>>,
  payload: unknown,
  workItemId: string | null,
  now: number,
): Promise<{ skills_used?: string[]; skills_unknown?: string[] }> {
  const parsed = parseSkillsUsed((payload as { skills_used?: unknown } | null)?.skills_used);
  if (!workItemId || !parsed.ok || parsed.paths.length === 0) return {};
  const catalog = await loadCatalog(cfEnv().SKILLS as SkillBucket | undefined).catch(() => null);
  const known = catalog && catalog.ok ? new Set(catalog.skills.map((skill) => skill.path)) : null;
  const recorded = await recordSkillsUsed(sql, { agent, workItemId, paths: parsed.paths, known, now });
  return { skills_used: recorded.used, ...(recorded.unknown.length ? { skills_unknown: recorded.unknown } : {}) };
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
