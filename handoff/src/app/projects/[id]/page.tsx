import Link from "next/link";
import { notFound } from "next/navigation";
import { listProjectDeliverables } from "@/db/deliverables";
import {
  listMilestones,
  listProjectRepos,
  listProjectTasks,
  listStatusUpdates,
  organizationById,
  projectById,
  repoActivitySummary,
} from "@/db/crm";
import { workspacesFor } from "@/db/records";
import { requireHqStaffPage } from "@/lib/current";
import { clientSpaceHref } from "@/lib/host";
import { liveStaff } from "@/lib/store/staff";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffShell } from "../../staff-shell";
import { dayLabel } from "../dates";
import { CreateDeliverableForm } from "../../deliverables/forms";
import { DELIVERABLE_STATUS_LABEL } from "../../deliverables/labels";
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
  const repos = await listProjectRepos(sql, caller, project.id);
  const visibleIds = new Set((await workspacesFor(sql, caller)).map((row) => row.id));
  const usableSpaces = spaces.filter((space) => visibleIds.has(space.id));
  const finished = await listProjectDeliverables(sql, caller, project.id);
  const repoRows = await Promise.all(
    repos.map(async (repo) => ({ repo, summary: await repoActivitySummary(sql, caller, repo.id) })),
  );
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
                  <li key={space.id} className="flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={clientSpaceHref(space.slug)}>{space.display_name}</a>
                    </Button>
                    <Badge variant="secondary">{space.slug}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Repos</CardTitle>
            <CardDescription>Code we work on for this project.</CardDescription>
          </CardHeader>
          <CardContent>
            {repoRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No repos linked yet.</p>
            ) : (
              <ul className="flex flex-col gap-6">
                {repoRows.map(({ repo, summary }) => (
                  <li key={repo.id} className="flex flex-col gap-2 text-sm">
                    <span className="font-mono">{repo.full_name}</span>
                    {summary ? <RepoSummary summary={summary} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Finished work</CardTitle>
            <CardDescription>Pieces the client can look at.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {finished.length === 0 ? (
              <p className="text-sm text-muted-foreground">No finished work yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {finished.map((piece) => (
                  <li key={piece.id} className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/deliverables/${piece.id}`}>{piece.title}</Link>
                    </Button>
                    <Badge variant="secondary">{DELIVERABLE_STATUS_LABEL[piece.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
            {usableSpaces.length === 0 ? (
              <p className="text-sm text-muted-foreground">Link a space before you add finished work.</p>
            ) : (
              <CreateDeliverableForm
                organizationId={project.organization_id}
                projectId={project.id}
                spaces={usableSpaces.map((space) => ({ id: space.id, displayName: space.display_name }))}
              />
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

function GithubLink({ href, children }: { href: string; children: string }) {
  if (!href.startsWith("https://github.com/")) return <span>{children}</span>;
  return <a href={href}>{children}</a>;
}

function RepoSummary({
  summary,
}: {
  summary: {
    openPullRequests: { number: number; title: string; url: string }[];
    lastPush: { at: number; url: string; author: string } | null;
    latestRelease: { at: number; title: string; url: string } | null;
  };
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground">Open pull requests</p>
      {summary.openPullRequests.length === 0 ? (
        <p className="text-muted-foreground">No open pull requests.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {summary.openPullRequests.map((pull) => (
            <li key={pull.number}>
              <GithubLink href={pull.url}>{`#${pull.number} ${pull.title}`}</GithubLink>
            </li>
          ))}
        </ul>
      )}
      <p>
        Last push
        {summary.lastPush ? (
          <span className="ml-2">
            <GithubLink href={summary.lastPush.url}>
              {`${dayLabel(summary.lastPush.at)}${summary.lastPush.author ? ` by ${summary.lastPush.author}` : ""}`}
            </GithubLink>
          </span>
        ) : (
          <span className="ml-2 text-muted-foreground">No push yet.</span>
        )}
      </p>
      <p>
        Latest release
        {summary.latestRelease ? (
          <span className="ml-2">
            <GithubLink href={summary.latestRelease.url}>
              {`${summary.latestRelease.title} ${dayLabel(summary.latestRelease.at)}`}
            </GithubLink>
          </span>
        ) : (
          <span className="ml-2 text-muted-foreground">No release yet.</span>
        )}
      </p>
    </div>
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
