import { workspacesFor } from "@/db/records";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { cookieValue, deleteUploadedFolder } from "@/lib/downloads";
import { getCaller, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ slug: string; folder: string }> },
) {
  const { slug, folder } = await context.params;
  let folderName = folder;
  try {
    folderName = decodeURIComponent(folder);
  } catch {
    folderName = folder;
  }
  const sql = await openHandoffDb();
  await migrate(sql);
  const now = Date.now();
  const caller = await getCaller(sql, cookieValue(request, SESSION_COOKIE), now);
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace) return Response.json({ message: "We couldn't find that." }, { status: 404 });
  const result = await deleteUploadedFolder({
    sql,
    caller,
    workspaceId: workspace.id,
    folderName,
    now,
  });
  if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
  return Response.json({ ok: true, removed: result.removed });
}
