import { STATUS_HEALTHS, listProjects, listWork, type StatusHealth } from "@/db/crm";
import { clock } from "@/lib/clock";
import { requireHqStaffPage } from "@/lib/current";
import { formatRelative } from "@/lib/format";
import { statusToken } from "@/lib/status-token";
import { sortRows } from "@/components/data-table-sort";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageFrame } from "@/components/page-frame";
import { StatusBadge } from "@/components/status-badge";
import { StatusDot } from "@/components/status-dot";
import { StaffShell } from "../staff-shell";
import { projectRows, type ProjectIndexRow } from "./rows";

const HEALTH_SQL = `SELECT p.id AS id, s.health AS health
  FROM projects p
  JOIN status_updates s ON s.id = (
    SELECT s2.id FROM status_updates s2
    WHERE s2.project_id = p.id
    ORDER BY s2.created_at DESC, s2.id DESC
    LIMIT 1
  )`;

function asHealth(value: string): StatusHealth | null {
  return (STATUS_HEALTHS as readonly string[]).includes(value) ? (value as StatusHealth) : null;
}

function sortValue(row: ProjectIndexRow, key: string): string | number | null {
  if (key === "client") return row.client;
  if (key === "project") return row.project;
  if (key === "status") return row.status;
  if (key === "health") return row.health ? statusToken("health", row.health).label : "";
  if (key === "due") return row.dueAt;
  if (key === "open") return row.openTasks;
  return null;
}

function columns(now: number): Column<ProjectIndexRow>[] {
  return [
    {
      key: "client",
      header: "Client",
      sortable: true,
      cell: (row) => row.client,
    },
    {
      key: "project",
      header: "Project",
      sortable: true,
      cell: (row) => <span className="font-medium">{row.project}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      cell: (row) => <StatusBadge domain="project" value={row.status} />,
    },
    {
      key: "health",
      header: "Health",
      sortable: true,
      cell: (row) =>
        row.health ? (
          <span className="inline-flex items-center gap-1.5">
            <StatusDot domain="health" value={row.health} />
            <span>{statusToken("health", row.health).label}</span>
          </span>
        ) : null,
    },
    {
      key: "due",
      header: "Due",
      sortable: true,
      cell: (row) => (row.dueAt === null ? "" : formatRelative(row.dueAt, now)),
    },
    {
      key: "open",
      header: "Open tasks",
      sortable: true,
      align: "right",
      cell: (row) => row.openTasks,
    },
  ];
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const query = await searchParams;
  const sort = typeof query.sort === "string" ? query.sort : undefined;
  const { sql, caller } = await requireHqStaffPage();
  const now = clock();
  const [projects, tasks, orgs, health] = await Promise.all([
    listProjects(sql, caller),
    listWork(sql, caller, {}, now),
    sql.all<{ id: string; name: string }>("SELECT id, name FROM organizations WHERE archived_at IS NULL"),
    sql.all<{ id: string; health: string }>(HEALTH_SQL),
  ]);
  const nameOf = new Map(orgs.map((org) => [org.id, org.name]));
  const healthOf = new Map<string, StatusHealth>();
  for (const row of health) {
    const value = asHealth(row.health);
    if (value) healthOf.set(row.id, value);
  }
  const rows = sortRows(
    projectRows(
      projects.map((project) => ({
        id: project.id,
        organizationId: project.organization_id,
        client: nameOf.get(project.organization_id) ?? "…",
        name: project.name,
        status: project.status,
        health: healthOf.get(project.id) ?? null,
        dueAt: project.due_at,
      })),
      tasks.map((task) => ({ projectId: task.project_id, status: task.status })),
    ),
    sort,
    sortValue,
  );

  return (
    <StaffShell>
      <PageFrame title="Projects" description="Work across clients. Open a row to see milestones, tasks, and status.">
        <DataTable
          columns={columns(now)}
          rows={rows}
          rowKey={(row) => row.id}
          rowHref={(row) => `/projects/${row.id}`}
          sort={sort}
          basePath="/projects"
          empty={<EmptyState title="No projects yet." body="Projects show up here when a client has one." />}
        />
      </PageFrame>
    </StaffShell>
  );
}
