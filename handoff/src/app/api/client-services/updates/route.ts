import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { listClientUpdates } from "@/lib/client-work";
import { clientServicesAuthorized, hqOrigin } from "@/lib/client-services-auth";

export const dynamic = "force-dynamic";

/** Report-back feed for Client Services (pull). Bearer CLIENT_SERVICES_TOKEN. ?since= ISO time or unix ms. */
export async function GET(request: Request) {
  if (!clientServicesAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const sql = await openHandoffDb();
  await migrate(sql);
  const updates = await listClientUpdates(sql, {
    since: new URL(request.url).searchParams.get("since"),
    now: Date.now(),
    origin: hqOrigin(request),
  });
  if (!Array.isArray(updates)) return NextResponse.json(updates, { status: 400 });
  return NextResponse.json({ updates });
}
