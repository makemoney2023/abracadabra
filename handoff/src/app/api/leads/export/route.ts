import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { exportAuthorized, exportLeads } from "@/lib/lead-export";

export const dynamic = "force-dynamic";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

function binding(name: "LEAD_EXPORT_TOKEN" | "READINESS_CHECK_ORIGIN"): string {
  const fromProcess = process.env[name]?.trim() ?? "";
  if (fromProcess) return fromProcess;
  const holder = globalThis as typeof globalThis & {
    [CLOUDFLARE_CONTEXT]?: { env?: Record<string, string | undefined> };
  };
  return holder[CLOUDFLARE_CONTEXT]?.env?.[name]?.trim() ?? "";
}

/** Read-only scored-lead export for Account Research. Bearer LEAD_EXPORT_TOKEN. */
export async function GET(request: Request) {
  if (!exportAuthorized(request.headers.get("authorization"), binding("LEAD_EXPORT_TOKEN"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const url = new URL(request.url);
  const sql = await openHandoffDb();
  await migrate(sql);
  const leads = await exportLeads(sql, {
    status: url.searchParams.get("status"),
    since: url.searchParams.get("since"),
    checkOrigin: binding("READINESS_CHECK_ORIGIN") || undefined,
  });
  if (!Array.isArray(leads)) return NextResponse.json(leads, { status: 400 });
  return NextResponse.json({ leads });
}
