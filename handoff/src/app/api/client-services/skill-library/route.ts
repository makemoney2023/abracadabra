import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { cfEnv, clientServicesAuthorized } from "@/lib/client-services-auth";
import type { SkillBucket } from "@/lib/skill-library";
import { browseLibrary } from "@/lib/skill-packs";
import { afterResponse, writeSkillEvents } from "@/lib/skill-usage";

export const dynamic = "force-dynamic";

/**
 * Client Services browses the skill library, read-only: every pack with its skill count and description, and with ?q= or
 * ?pack= the matching skills. Same answer as GET /api/agent-skill-library; org/ is never shown. Bearer CLIENT_SERVICES_TOKEN.
 * Each lookup is logged in skill_events as a system event from "client-services".
 */
export async function GET(request: Request) {
  if (!clientServicesAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const q = params.get("q");
  const pack = params.get("pack");
  const result = await browseLibrary(cfEnv().SKILLS as SkillBucket | undefined, { q, pack });
  const searched = Boolean(q?.trim() || pack?.trim());
  const now = Date.now();
  await afterResponse(async () => {
    const sql = await openHandoffDb();
    await migrate(sql);
    await writeSkillEvents(sql, [
      {
        event: searched ? "search" : "list",
        actorKind: "system",
        actorId: "client-services",
        prefix: pack?.trim() || null,
        query: [q?.trim() ? `q=${q.trim()}` : "", pack?.trim() ? `pack=${pack.trim()}` : ""].filter(Boolean).join(" ") || null,
        resultCount: result.ok ? (searched ? (result.skills?.length ?? 0) : result.packs.length) : null,
        status: result.ok ? 200 : result.status,
        libraryVersion: result.ok ? result.library_version : null,
        source: "client-services-skill-library",
        at: now,
      },
    ]);
  });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result);
}
