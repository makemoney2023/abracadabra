import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { LIMITS } from "@/lib/policy/limits";
import { getCaller, SESSION_COOKIE } from "@/lib/session";
import { localObjectBytesEnabled, openObjectStore } from "@/lib/store/objects";
import { grantUpload } from "@/lib/store/uploads";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createBody = z.object({ action: z.literal("create"), partCount: z.number() }).strict();
const finishBody = z.object({ action: z.literal("finish"), uploadId: z.string() }).strict();
const multipartBody = z.discriminatedUnion("action", [createBody, finishBody]);

function cookieValue(request: Request, name: string): string {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function originOf(request: Request): string {
  return new URL(request.url).origin;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string; fileId: string }> },
) {
  if (!localObjectBytesEnabled()) {
    return Response.json({ message: "File storage is not configured." }, { status: 503 });
  }
  const { batchId, fileId } = await context.params;
  let parsed: z.infer<typeof multipartBody>;
  try {
    parsed = multipartBody.parse(await request.json());
  } catch {
    return Response.json({ message: "You cannot do that." }, { status: 400 });
  }
  const sql = await openHandoffDb();
  await migrate(sql);
  const caller = await getCaller(sql, cookieValue(request, SESSION_COOKIE), Date.now());
  const granted = await grantUpload({ sql, caller, batchId, fileId, now: Date.now() });
  if (!granted.ok) return Response.json({ message: granted.message }, { status: granted.status });

  const store = openObjectStore();
  if (parsed.action === "create") {
    const expected = Math.ceil(granted.file.sizeBytes / LIMITS.partSizeBytes);
    if (!Number.isInteger(parsed.partCount) || parsed.partCount !== expected) {
      return Response.json({ message: "That upload is the wrong size." }, { status: 422 });
    }
    const uploadId = await store.beginUpload(granted.file.objectKey, batchId, fileId);
    const origin = originOf(request);
    const parts = Array.from({ length: expected }, (_, index) => {
      const partNumber = index + 1;
      const url = new URL("/api/objects/parts", origin);
      url.searchParams.set("uploadId", uploadId);
      url.searchParams.set("part", String(partNumber));
      return { partNumber, url: url.toString() };
    });
    return Response.json({ uploadId, parts }, { status: 200 });
  }

  const meta = await store.readUpload(parsed.uploadId);
  if (!meta || meta.key !== granted.file.objectKey || meta.batchId !== batchId || meta.fileId !== fileId) {
    return Response.json({ message: "Not found." }, { status: 404 });
  }
  try {
    await store.finishUpload(parsed.uploadId);
  } catch {
    return Response.json({ message: "That upload is not in storage yet." }, { status: 409 });
  }
  return Response.json({ uploadId: parsed.uploadId }, { status: 200 });
}
