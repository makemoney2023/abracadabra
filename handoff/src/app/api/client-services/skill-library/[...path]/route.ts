import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { cfEnv, clientServicesAuthorized } from "@/lib/client-services-auth";
import type { SkillBucket } from "@/lib/skill-library";
import { readLibrarySkill } from "@/lib/skill-packs";
import { afterResponse, writeSkillEvents } from "@/lib/skill-usage";

export const dynamic = "force-dynamic";

/**
 * Client Services reads any SKILL.md in the library, read-only, e.g.
 * /api/client-services/skill-library/community/marketingskills/copywriting/SKILL.md. org/ paths are 404.
 * Bearer CLIENT_SERVICES_TOKEN. Logged in skill_events as a system read from "client-services".
 */
export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  if (!clientServicesAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { path } = await context.params;
  const skillPath = path.join("/");
  const result = await readLibrarySkill(cfEnv().SKILLS as SkillBucket | undefined, skillPath);
  const now = Date.now();
  await afterResponse(async () => {
    const sql = await openHandoffDb();
    await migrate(sql);
    await writeSkillEvents(sql, [
      {
        event: "read",
        actorKind: "system",
        actorId: "client-services",
        path: result.ok ? result.path : skillPath,
        status: result.ok ? 200 : result.status,
        libraryVersion: result.ok ? result.version : null,
        source: "client-services-skill-library",
        at: now,
      },
    ]);
  });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result, { headers: { etag: `"${result.version}"` } });
}
