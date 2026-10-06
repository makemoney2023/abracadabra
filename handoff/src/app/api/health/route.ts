import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { healthReport, signedOutCaller } from "@/db/records";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sql = await openHandoffDb();
    await migrate(sql);
    const report = await healthReport(sql, signedOutCaller);
    return NextResponse.json(report, { status: report.ok ? 200 : 503 });
  } catch {
    return NextResponse.json({ database: "d1", ok: false, visible: 0 }, { status: 503 });
  }
}
