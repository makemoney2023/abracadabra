import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { clientIpFromHeaders, LIBRARY_PUBLIC_HEADERS, unlockViewLink, viewUnlockSetCookie } from "@/lib/library-shares";

export const dynamic = "force-dynamic";

async function passcodeFrom(request: Request): Promise<string> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { passcode?: unknown } | null;
    return typeof body?.passcode === "string" ? body.passcode : "";
  }
  const form = await request.formData().catch(() => null);
  return String(form?.get("passcode") ?? "");
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const sql = await openHandoffDb();
  await migrate(sql);
  const result = await unlockViewLink(sql, token, await passcodeFrom(request), clientIpFromHeaders(request.headers), Date.now());
  if (!result.ok) {
    const message = result.status === 429 ? "Try again later." : "This link is not available.";
    return new Response(message, { status: result.status, headers: LIBRARY_PUBLIC_HEADERS });
  }
  const headers = new Headers(LIBRARY_PUBLIC_HEADERS);
  headers.set("set-cookie", viewUnlockSetCookie(result.cookie));
  headers.set("location", `/view/${encodeURIComponent(token)}`);
  return new Response(null, { status: 303, headers });
}
