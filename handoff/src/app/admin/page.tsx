import { workspacesFor } from "@/db/records";
import type { Sql } from "@/db/sql";
import { clock } from "@/lib/clock";
import { requireSuperAdminPage } from "@/lib/current";
import { formatBytes, formatCount, formatRelative } from "@/lib/format";
import { clientSpaceHref } from "@/lib/host";
import { liveTemplates } from "@/lib/store/workspaces";
import { sortRows } from "@/components/data-table-sort";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ExternalLink } from "@/components/external-link";
import { NewSpaceDrawer } from "./new-workspace-form";

type SpaceRow = {
  id: string;
  slug: string;
  space: string;
  client: string;
  owner: string;
  files: number;
  usedBytes: number;
  lastUpload: number | null;
};

type SpaceStat = {
  id: string;
  slug: string;
  display_name: string;
  client_name: string | null;
  owner_email: string | null;
  file_count: number;
  used_bytes: number;
  last_upload: number | null;
};

async function spaceStats(sql: Sql, ids: string[]): Promise<SpaceStat[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  return sql.all<SpaceStat>(
    `SELECT w.id, w.slug, w.display_name,
            o.name AS client_name,
            (
              SELECT m.email FROM memberships m
              WHERE m.workspace_id = w.id AND m.role = 'client_owner' AND m.revoked_at IS NULL
              ORDER BY m.created_at, m.email
              LIMIT 1
            ) AS owner_email,
            (
              SELECT count(*) FROM files f
              JOIN batches b ON b.id = f.batch_id
              WHERE f.workspace_id = w.id AND f.object_deleted_at IS NULL AND b.deleted_at IS NULL
            ) AS file_count,
            (
              SELECT coalesce(sum(f.size_bytes), 0) FROM files f
              JOIN batches b ON b.id = f.batch_id
              WHERE f.workspace_id = w.id AND f.object_deleted_at IS NULL AND b.deleted_at IS NULL
            ) AS used_bytes,
            (
              SELECT max(f.uploaded_at) FROM files f
              JOIN batches b ON b.id = f.batch_id
              WHERE f.workspace_id = w.id AND f.object_deleted_at IS NULL AND b.deleted_at IS NULL
            ) AS last_upload
     FROM workspaces w
     LEFT JOIN organizations o ON o.id = w.organization_id
     WHERE w.id IN (${placeholders})
     ORDER BY w.slug`,
    ids,
  );
}

function sortValue(row: SpaceRow, key: string): string | number | null {
  if (key === "space") return row.space;
  if (key === "client") return row.client;
  if (key === "owner") return row.owner;
  if (key === "files") return row.files;
  if (key === "storage") return row.usedBytes;
  if (key === "uploaded") return row.lastUpload;
  return null;
}

function columns(now: number): Column<SpaceRow>[] {
  return [
    {
      key: "space",
      header: "Space",
      sortable: true,
      cell: (row) => <span className="font-medium">{row.space}</span>,
    },
    { key: "client", header: "Client", sortable: true, cell: (row) => row.client },
    { key: "owner", header: "Owner", sortable: true, cell: (row) => row.owner },
    {
      key: "files",
      header: "Files",
      sortable: true,
      align: "right",
      cell: (row) => <span className="tabular-nums">{formatCount(row.files)}</span>,
    },
    {
      key: "storage",
      header: "Storage used",
      sortable: true,
      align: "right",
      cell: (row) => <span className="tabular-nums">{formatBytes(row.usedBytes)}</span>,
    },
    {
      key: "uploaded",
      header: "Last upload",
      sortable: true,
      cell: (row) => (row.lastUpload === null ? "" : formatRelative(row.lastUpload, now)),
    },
    {
      key: "open",
      header: "Open",
      cell: (row) => <ExternalLink href={clientSpaceHref(row.slug)}>Open</ExternalLink>,
    },
  ];
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const query = await searchParams;
  const sort = typeof query.sort === "string" ? query.sort : undefined;
  const { sql, caller } = await requireSuperAdminPage();
  const now = clock();
  const [workspaces, templates] = await Promise.all([workspacesFor(sql, caller), liveTemplates(sql)]);
  const stats = await spaceStats(
    sql,
    workspaces.map((workspace) => workspace.id),
  );
  const rows = sortRows(
    stats.map((row) => ({
      id: row.id,
      slug: row.slug,
      space: spaceName(row),
      client: row.client_name ?? "",
      owner: row.owner_email ?? "",
      files: row.file_count,
      usedBytes: row.used_bytes,
      lastUpload: row.last_upload,
    })),
    sort,
    sortValue,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <NewSpaceDrawer templates={templates} />
      </div>
      <DataTable
        columns={columns(now)}
        rows={rows}
        rowKey={(row) => row.id}
        sort={sort}
        basePath="/spaces"
        empty={<EmptyState title="No spaces yet." body="Add a space when a client needs a folder." />}
      />
    </div>
  );
}

function spaceName(row: SpaceStat): string {
  const name = row.display_name.trim();
  return name.length > 0 ? name : "…";
}
