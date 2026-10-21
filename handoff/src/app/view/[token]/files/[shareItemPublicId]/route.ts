import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { attachmentDisposition, cookieValue } from "@/lib/downloads";
import { recordLibraryMetric } from "@/lib/library-metrics";
import { LIBRARY_PUBLIC_HEADERS, viewDownload } from "@/lib/library-shares";
import { openObjectStore } from "@/lib/store/objects";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ token: string; shareItemPublicId: string }> }) {
  const { token, shareItemPublicId } = await context.params;
  const sql = await openHandoffDb();
  await migrate(sql);
  const result = await viewDownload(sql, token, shareItemPublicId, Date.now(), cookieValue(request, "library_view"));
  if (!result.ok) return new Response("This link is not available.", { status: 404, headers: LIBRARY_PUBLIC_HEADERS });
  const row = await sql.get<{ object_key: string; status: string; relative_path: string }>(
    "SELECT object_key, status, relative_path FROM files WHERE id = ?",
    [result.fileId],
  );
  if (!row || row.status !== "clean") return new Response("This link is not available.", { status: 404, headers: LIBRARY_PUBLIC_HEADERS });
  const bytes = await openObjectStore().read(row.object_key);
  if (!bytes) return new Response("This link is not available.", { status: 404, headers: LIBRARY_PUBLIC_HEADERS });
  await sql.run("INSERT INTO library_share_events (id, share_id, kind, at) VALUES (?, ?, 'downloaded', ?)", [crypto.randomUUID(), result.shareId, Date.now()]);
  const organization = await sql.get<{ organization_id: string; workspace_id: string }>(
    "SELECT w.organization_id, s.workspace_id FROM library_shares s JOIN workspaces w ON w.id = s.workspace_id WHERE s.id = ?",
    [result.shareId],
  );
  if (organization?.organization_id) {
    await recordLibraryMetric(sql, { name: "view_link_downloaded", organizationId: organization.organization_id, workspaceId: organization.workspace_id });
  }
  const headers = new Headers(LIBRARY_PUBLIC_HEADERS);
  headers.set("content-type", "application/octet-stream");
  headers.set("content-disposition", attachmentDisposition(row.relative_path));
  return new Response(Buffer.from(bytes), { status: 200, headers });
}
