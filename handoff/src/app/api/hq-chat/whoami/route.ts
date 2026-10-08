import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { staffFromRequest } from "@/lib/staff-request";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const staff = await staffFromRequest(sql, request, Date.now());
  return NextResponse.json({ staffLive: staff.ok });
}
