import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { agentForToken, fileAgentWork, MAX_BODY_BYTES } from "@/lib/agent-work-filing";
import { hqOrigin } from "@/lib/client-services-auth";
import { openObjectStore } from "@/lib/store/objects";

export const dynamic = "force-dynamic";

/**
 * A client agent files finished work. Bearer is that agent's own token (caw_...).
 * The agent's assignment decides the client and space. Anything that does not resolve waits as unfiled for staff.
 * Body: { external_id, title, kind?, summary?, content?, attachments?: [{ name, body }], links?: [{ label, url }],
 *         client?: { organization_id?, domain?, space_slug? }, project_id?, task_id?, finished_at?, agent_id? }
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
      },
      { status: result.duplicate ? 200 : 201 },
    );
  }
  return NextResponse.json(
    { ok: true, duplicate: result.duplicate, state: result.state, work_item_id: result.workItemId, reason: result.reason },
    { status: result.duplicate ? 200 : 202 },
  );
}
