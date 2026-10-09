import { listWork, type WorkTask } from "@/db/crm";
import { clock } from "@/lib/clock";
import { requireHqStaffPage } from "@/lib/current";
import { formatRelative } from "@/lib/format";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageFrame } from "@/components/page-frame";
import { StatusDot } from "@/components/status-dot";
import { StaffShell } from "../staff-shell";
import { WorkToolbar } from "./filters";
import { filterWork, groupTasks, workCounts } from "./query";
import { TaskActions } from "./task-actions";

type WorkRow = WorkTask & { projectName: string };

function taskHref(task: WorkRow): string {
  if (task.project_id) return `/projects/${task.project_id}`;
  return `/clients/${task.organization_id}`;
}

function workColumns(now: number): Column<WorkRow>[] {
  return [
    {
      key: "status",
      header: "Status",
      width: "4.5rem",
      cell: (row) => <StatusDot domain="task" value={row.status} />,
    },
    {
      key: "task",
      header: "Task",
      cell: (row) => <span className="font-medium">{row.title}</span>,
    },
    {
      key: "client",
      header: "Client",
      cell: (row) => row.organization_name,
    },
    {
      key: "project",
      header: "Project",
      cell: (row) => row.projectName,
    },
    {
      key: "owner",
      header: "Owner",
      cell: (row) => row.assignee_email ?? "",
    },
    {
      key: "due",
      header: "Due",
      cell: (row) => {
        if (row.due_at === null) return "";
        const late = row.due_at < now;
        return <span className={late ? "text-status-late" : undefined}>{formatRelative(row.due_at, now)}</span>;
      },
    },
    {
      key: "actions",
      header: "Actions",
      cell: (row) => (
        <TaskActions taskId={row.id} organizationId={row.organization_id} href={taskHref(row)} />
      ),
    },
  ];
}

export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<{ late?: string; week?: string; blocked?: string; group?: string }>;
}) {
  const query = await searchParams;
  const late = query.late === "1";
  const week = query.week === "1";
  const blocked = query.blocked === "1";
  const group = query.group === "client" ? "client" : "person";
  const { sql, caller } = await requireHqStaffPage();
  const now = clock();
  const tasks = await listWork(sql, caller, {}, now);
  const counts = workCounts(tasks, now);
  const visible = filterWork(tasks, { late, week, blocked }, now);
  const projectIds = [...new Set(visible.flatMap((task) => (task.project_id ? [task.project_id] : [])))];
  const projects =
    projectIds.length === 0
      ? []
      : await sql.all<{ id: string; name: string }>(
          `SELECT id, name FROM projects WHERE id IN (${projectIds.map(() => "?").join(", ")})`,
          projectIds,
        );
  const projectName = new Map(projects.map((project) => [project.id, project.name]));
  const rows: WorkRow[] = visible.map((task) => ({
    ...task,
    projectName: task.project_id ? (projectName.get(task.project_id) ?? "") : "",
  }));
  const groups = groupTasks(rows, group).map((bucket) => ({
    label: `${bucket.label} · ${bucket.tasks.length}`,
    rows: bucket.tasks,
  }));
  const filtered = late || week || blocked;

  return (
    <StaffShell>
      <PageFrame title="Work" description="Open tasks. Filter by late, this week, or blocked.">
        <WorkToolbar late={late} week={week} blocked={blocked} group={group} counts={counts} />
        <DataTable
          columns={workColumns(now)}
          rows={rows}
          rowKey={(row) => row.id}
          rowHref={taskHref}
          groups={groups}
          empty={
            <EmptyState
              title={filtered ? "No tasks match" : "No open tasks."}
              body={filtered ? "Try another filter." : "Open tasks show up here."}
            />
          }
        />
      </PageFrame>
    </StaffShell>
  );
}
