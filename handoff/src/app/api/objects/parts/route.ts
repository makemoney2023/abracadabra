import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { LIMITS } from "@/lib/policy/limits";
import { getCaller, SESSION_COOKIE } from "@/lib/session";
import { objectStorageEnabled, openObjectStore } from "@/lib/store/objects";
import { grantUpload } from "@/lib/store/uploads";

export const dynamic = "force-dynamic";

function cookieValue(request: Request, name: string): string {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export async function PUT(request: Request) {
  if (!objectStorageEnabled()) {
    return Response.json({ message: "File storage isn't set up yet." }, { status: 503 });
  }
  const url = new URL(request.url);
  const uploadId = url.searchParams.get("uploadId") ?? "";
  const partRaw = url.searchParams.get("part") ?? "";
  const partNumber = Number(partRaw);
  if (!/^[0-9a-f-]{36}$/.test(uploadId)) {
    return Response.json({ message: "We couldn't find that." }, { status: 404 });
  }
  if (!Number.isInteger(partNumber) || partNumber < 1 || String(partNumber) !== partRaw) {
    return Response.json({ message: "That piece doesn't work." }, { status: 422 });
  }

  const store = openObjectStore();
  const meta = await store.readUpload(uploadId);
  if (!meta) return Response.json({ message: "We couldn't find that." }, { status: 404 });

  const sql = await openHandoffDb();
  await migrate(sql);
  const caller = await getCaller(sql, cookieValue(request, SESSION_COOKIE), Date.now());
  const granted = await grantUpload({
    sql,
    caller,
    batchId: meta.batchId,
    fileId: meta.fileId,
    now: Date.now(),
  });
  if (!granted.ok) return Response.json({ message: granted.message }, { status: granted.status });
  if (granted.file.objectKey !== meta.key) {
    return Response.json({ message: "We couldn't find that." }, { status: 404 });
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) {
    return Response.json({ message: "That piece is empty." }, { status: 422 });
  }
  const expectedCount = Math.ceil(granted.file.sizeBytes / LIMITS.partSizeBytes);
  const expectedSize =
    partNumber === expectedCount
      ? granted.file.sizeBytes - (expectedCount - 1) * LIMITS.partSizeBytes
      : LIMITS.partSizeBytes;
  if (partNumber > expectedCount || bytes.byteLength !== expectedSize) {
    return Response.json({ message: "That piece isn't the size we expected." }, { status: 422 });
  }
  await store.writePart(uploadId, partNumber, bytes);
  return new Response(null, { status: 204 });
}
