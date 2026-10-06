import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { readSignedFile } from "@/lib/downloads";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await context.params;
  const url = new URL(request.url);
  const sql = await openHandoffDb();
  await migrate(sql);
  const result = await readSignedFile({
    sql,
    fileId,
    exp: url.searchParams.get("exp") ?? "",
    sig: url.searchParams.get("sig") ?? "",
    now: Date.now(),
  });
  if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
  return new Response(Buffer.from(result.bytes), {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": result.disposition,
      "x-content-type-options": "nosniff",
    },
  });
}
