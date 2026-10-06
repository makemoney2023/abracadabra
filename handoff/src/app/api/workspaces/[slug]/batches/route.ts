import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { LIMITS } from "@/lib/policy/limits";
import { getCaller, SESSION_COOKIE } from "@/lib/session";
import { createBatch } from "@/lib/store/batches";

export const dynamic = "force-dynamic";

function cookieValue(request: Request, name: string): string {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > LIMITS.maxManifestBytes) {
    return Response.json({ message: "That manifest is too large." }, { status: 413 });
  }
  let body: unknown = null;
  if (raw.length > 0) {
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      return Response.json({ message: "You cannot do that." }, { status: 400 });
    }
  }
  const sql = await openHandoffDb();
  await migrate(sql);
  const caller = await getCaller(sql, cookieValue(request, SESSION_COOKIE), Date.now());
  const result = await createBatch({ sql, caller, slug, now: Date.now(), body });
  if (!result.ok) {
    return Response.json(
      result.index === undefined ? { message: result.message } : { message: result.message, index: result.index },
      { status: result.status },
    );
  }
  return Response.json({ batchId: result.batchId, files: result.files }, { status: 201 });
}
