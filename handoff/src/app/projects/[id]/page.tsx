import Link from "next/link";
import { notFound } from "next/navigation";
import {
  listMilestones,
  listProjectTasks,
  listStatusUpdates,
  organizationById,
  projectById,
} from "@/db/crm";
import { requireHqStaffPage } from "@/lib/current";
import { clientSpaceHref } from "@/lib/host";
import { liveStaff } from "@/lib/store/staff";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffShell } from "../../staff-shell";
import { dayLabel } from "../dates";
import { MilestoneForm, ProjectStatusForm, ProjectTaskForm, PublishUpdateForm, StatusUpdateForm, TaskStatusForm } from "../forms";
import { AUDIENCE_LABEL, HEALTH_LABEL, PROJECT_STATUS_LABEL, TASK_STATUS_LABEL } from "../labels";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sql, caller } = await requireHqStaffPage();
  const project = await projectById(sql, caller, id);
  if (!project) notFound();
  const [org, milestones, tasks, updates, staff, spaces] = await Promise.all([
    organizationById(sql, caller, project.organization_id),
    listMilestones(sql, caller, project.id),
    listProjectTasks(sql, caller, project.id),
    listStatusUpdates(sql, caller, project.id),
    liveStaff(sql),
    sql.all<{ id: string; slug: string; display_name: string }>(
      `SELECT id, slug, display_name FROM workspaces
       WHERE status != 'purged' AND (project_id = ? OR organization_id = ?)
       ORDER BY display_name`,
      [project.id, project.organization_id],
    ),
  ]);
  const milestoneIds = new Set(milestones.map((milestone) => milestone.id));
  const loose = tasks.filter((task) => !task.milestone_id || !milestoneIds.has(task.milestone_id));
  return (
    <StaffShell>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
        <div className="flex flex-col gap-3">
          <h1 className="font-heading text-4xl leading-tight">{project.name}</h1>
          <p className="text-sm text-muted-foreground">
            {PROJECT_STATUS_LABEL[project.status]}
            {project.due_at ? <span className="ml-2">Due {dayLabel(project.due_at)}</span> : null}
          </p>
          {org ? (
            <Link href={`/clients/${org.id}`} className="text-sm">
              {org.name}
            </Link>
          ) : null}
          <ProjectStatusForm projectId={project.id} organizationId={project.organization_id} status={project.status} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Spaces</CardTitle>
            <CardDescription>File folders linked to this client.</CardDescription>
          </CardHeader>
          <CardContent>
            {spaces.length === 0 ? (
              <p className="text-sm text-muted-foreground">No space linked yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {spaces.map((space) => (
                  <li key={space.id}>
                    <a href={clientSpaceHref(space.slug)}>{space.display_name}</a>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{space.slug}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Milestones</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {milestones.length === 0 && loose.length === 0 ? (
              <p className="text-sm text-muted-foreground">No milestones yet.</p>
            ) : null}
            {milestones.map((milestone) => {
              const rows = tasks.filter((task) => task.milestone_id === milestone.id);
              return (
                <section key={milestone.id} className="flex flex-col gap-3">
                  <h2 className="text-sm font-medium">
                    {milestone.name}
                    {milestone.due_at ? (
                      <span className="ml-2 font-normal text-muted-foreground">Due {dayLabel(milestone.due_at)}</span>
                    ) : null}
                  </h2>
                  <TaskList tasks={rows} projectId={project.id} organizationId={project.organization_id} />
                </section>
              );
            })}
            {loose.length > 0 ? (
              <section className="flex flex-col gap-3">
                <h2 className="text-sm font-medium">No milestone</h2>
                <TaskList tasks={loose} projectId={project.id} organizationId={project.organization_id} />
              </section>
            ) : null}
            <MilestoneForm projectId={project.id} organizationId={project.organization_id} />
            <ProjectTaskForm
              projectId={project.id}
              organizationId={project.organization_id}
              milestones={milestones.map((milestone) => ({ id: milestone.id, name: milestone.name }))}
              staff={staff}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Status updates</CardTitle>
            <CardDescription>A client update stays a draft until you publish it. Publishing does not send mail.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {updates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No updates yet.</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {updates.map((update) => (
                  <li key={update.id} className="flex flex-col gap-2 text-sm">
                    <p>
                      <span className="font-mono text-xs text-muted-foreground">{dayLabel(update.created_at)}</span>
                      <span className="ml-2">{HEALTH_LABEL[update.health]}</span>
                      <span className="ml-2 text-muted-foreground">{AUDIENCE_LABEL[update.audience]}</span>
                      <span className="ml-2 text-muted-foreground">
                        {update.state === "published" ? "Published" : "Draft"}
                      </span>
                    </p>
                    <p>{update.body}</p>
                    {update.state === "draft" ? (
                      <PublishUpdateForm
                        updateId={update.id}
                        projectId={project.id}
                        organizationId={project.organization_id}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <StatusUpdateForm projectId={project.id} organizationId={project.organization_id} />
          </CardContent>
        </Card>
      </main>
    </StaffShell>
  );
}

function TaskList({
  tasks,
  projectId,
  organizationId,
}: {
  tasks: {
    id: string;
    title: string;
    status: "todo" | "doing" | "blocked" | "done";
    due_at: number | null;
    assignee_email: string | null;
  }[];
  projectId: string;
  organizationId: string;
}) {
  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">No tasks yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {tasks.map((task) => (
        <li key={task.id} className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>
            {task.title}
            <span className="ml-2 text-muted-foreground">{TASK_STATUS_LABEL[task.status]}</span>
            {task.due_at ? <span className="ml-2 text-muted-foreground">Due {dayLabel(task.due_at)}</span> : null}
            {task.assignee_email ? <span className="ml-2 text-muted-foreground">{task.assignee_email}</span> : null}
          </span>
          <TaskStatusForm
            taskId={task.id}
            projectId={projectId}
            organizationId={organizationId}
            status={task.status}
          />
        </li>
      ))}
    </ul>
  );
}
