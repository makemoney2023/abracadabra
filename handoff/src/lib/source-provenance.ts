import type { Sql } from "@/db/sql";

export function folderBreadcrumbs(path: string): { name: string; path: string }[] {
  const parts = path.split("/").filter(Boolean);
  const crumbs: { name: string; path: string }[] = [{ name: "Files", path: "" }];
  let current = "";
  for (const part of parts.slice(0, -1)) {
    current = current ? `${current}/${part}` : part;
    crumbs.push({ name: part, path: current });
  }
  return crumbs;
}

export function provenanceLinks(input: { usedIn: { title: string; href: string }[]; deliveredAs: { title: string; href: string }[] }): { usedIn: { title: string; href: string }[]; deliveredAs: { title: string; href: string }[] } {
  return { usedIn: input.usedIn, deliveredAs: input.deliveredAs };
}

export async function fileProvenance(
  sql: Sql,
  workspaceId: string,
  fileId: string,
  slug: string,
): Promise<{ usedIn: { title: string; href: string }[]; deliveredAs: { title: string; href: string }[] }> {
  const used = await sql.all<{ title: string; deliverable_id: string }>(
    `SELECT i.title, i.deliverable_id
     FROM deliverable_artifact_metadata m
     JOIN deliverable_items i ON i.id = m.item_id AND i.version = m.version
     WHERE m.workspace_id = ? AND m.source_file_id = ?`,
    [workspaceId, fileId],
  );
  const delivered = await sql.all<{ title: string; deliverable_id: string }>(
    `SELECT i.title, i.deliverable_id
     FROM artifact_relations r
     JOIN deliverable_items i ON i.id = r.source_id AND i.version = r.source_version
     WHERE r.workspace_id = ? AND r.target_kind = 'file' AND r.target_id = ? AND r.source_kind = 'deliverable_item'`,
    [workspaceId, fileId],
  );
  const href = (deliverableId: string) => `/w/${slug}/work/${deliverableId}`;
  return provenanceLinks({
    usedIn: used.map((row) => ({ title: row.title, href: href(row.deliverable_id) })),
    deliveredAs: delivered.map((row) => ({ title: row.title, href: href(row.deliverable_id) })),
  });
}

export type SourceListFile = {
  id: string;
  name: string;
  status: string;
  updatedAt?: number;
  selected?: boolean;
};

export function filterSourceFiles(
  files: SourceListFile[],
  query: { search?: string; status?: string; sort?: string; folder?: string },
): SourceListFile[] {
  const search = query.search?.trim().toLowerCase() ?? "";
  const folder = query.folder?.replace(/\/$/, "") ?? "";
  const matched = files.filter((file) => {
    if (search && !file.name.toLowerCase().includes(search)) return false;
    if (query.status && file.status !== query.status) return false;
    if (folder && !file.name.startsWith(`${folder}/`)) return false;
    return true;
  });
  const sort = query.sort ?? "name";
  return matched.toSorted((left, right) => {
    if (sort === "date") return (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
    if (sort === "status") return left.status.localeCompare(right.status) || left.name.localeCompare(right.name);
    return left.name.localeCompare(right.name);
  });
}
