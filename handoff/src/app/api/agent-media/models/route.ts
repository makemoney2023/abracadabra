import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { agentForToken } from "@/lib/agent-work-filing";
import { publicMediaModels } from "@/lib/agent-media";
import { isMediaFit, MEDIA_FITS } from "@/lib/agent-media-models";

export const dynamic = "force-dynamic";

/** The stills and clips this agent may ask HQ to run. Bearer is the agent's caw_ token. `?fits=` narrows the list. */
export async function GET(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  if (!agent || agent.assignments.length === 0) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const fits = new URL(request.url).searchParams.get("fits")?.trim() ?? "";
  if (fits && !isMediaFit(fits)) {
    const names = [...MEDIA_FITS];
    const list = `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}`;
    return NextResponse.json({ error: `fits must be ${list}.` }, { status: 400 });
  }
  return NextResponse.json({ models: publicMediaModels(isMediaFit(fits) ? fits : null) });
}
