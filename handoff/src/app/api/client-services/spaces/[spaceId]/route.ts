import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { readSpaceForReview } from "@/lib/client-work";
import { clientServicesAuthorized } from "@/lib/client-services-auth";

export const dynamic = "force-dynamic";

/** Read one client Space's work for review. Bearer CLIENT_SERVICES_TOKEN. */
export async function GET(request: Request, context: { params: Promise<{ spaceId: string }> }) {
  if (!clientServicesAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { spaceId } = await context.params;
  const sql = await openHandoffDb();
  await migrate(sql);
  const space = await readSpaceForReview(sql, spaceId);
  if (!space) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(space);
}
