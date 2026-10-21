import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { isHqHost } from "@/lib/host";
import { applyZernioEvent, verifyZernioSignature, zernioWebhookSecret } from "@/lib/social-webhook";
import { openZernio } from "@/lib/zernio";

export const dynamic = "force-dynamic";

/** Zernio post and account events. Signed with ZERNIO_WEBHOOK_SECRET; an empty secret refuses every delivery. */
export async function POST(request: Request): Promise<Response> {
  if (!isHqHost(request.headers.get("host") ?? "")) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body = await request.text();
  const signature = request.headers.get("x-zernio-signature") ?? request.headers.get("x-late-signature") ?? "";
  if (!(await verifyZernioSignature(zernioWebhookSecret(), body, signature))) {
    return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Bad body." }, { status: 400 });
  }
  const sql = await openHandoffDb();
  await migrate(sql);
  const result = await applyZernioEvent(sql, payload, Date.now(), openZernio());
  return NextResponse.json({ ok: true, result });
}
