import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { runHqTool } from "@/lib/hq-tools";
import { sendHandoffMail } from "@/lib/mail";
import { publicClientOrigin } from "@/lib/share-link";
import { staffFromRequest } from "@/lib/staff-request";
import { openObjectStore } from "@/lib/store/objects";
import { parseAllowlist } from "@/lib/store/staff";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const staff = await staffFromRequest(sql, request, Date.now());
  if (!staff.ok) return NextResponse.json({ ok: false, error: staff.status === 401 ? "unauthorized" : "forbidden" }, { status: staff.status });
  let body: { tool?: unknown; input?: unknown; idempotencyKey?: unknown; approved?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  if (typeof body.tool !== "string") return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  const input = body.input && typeof body.input === "object" && !Array.isArray(body.input) ? (body.input as Record<string, unknown>) : {};
  const result = await runHqTool(
    sql,
    staff.caller,
    {
      tool: body.tool,
      input,
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
      approved: body.approved === true,
    },
    Date.now(),
    {
      swarm: { origin: process.env.SWARM_ORIGIN ?? "", store: openObjectStore() },
      mail: {
        origin: publicClientOrigin({
          origin: process.env.HANDOFF_APP_ORIGIN,
          host: request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
          proto: request.headers.get("x-forwarded-proto"),
        }),
        from: process.env.HANDOFF_FROM_EMAIL ?? "",
        allowlist: parseAllowlist(process.env.HANDOFF_SUPER_ADMIN_EMAILS),
        send: sendHandoffMail,
      },
    },
  );
  const status = "ok" in result && !result.ok && (result.error === "unauthorized" || result.error === "forbidden") ? (result.error === "unauthorized" ? 401 : 403) : 200;
  return NextResponse.json(result, { status });
}
