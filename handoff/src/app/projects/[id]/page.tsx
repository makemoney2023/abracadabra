import Link from "next/link";
import { notFound } from "next/navigation";
import { listProjectDeliverables } from "@/db/deliverables";
import {
  listBoard,
  listBoardActivity,
  openCloudRunCount,
  listMilestones,
  listProjects,
  listRepos,
  listStatusUpdates,
  organizationById,
  projectById,
  repoActivitySummary,
} from "@/db/crm";
import { workspacesFor } from "@/db/records";
import { boardSwarmExtras } from "@/lib/board-swarm";
import { clock } from "@/lib/clock";
import { requireHqStaffPage } from "@/lib/current";
import { formatRelative } from "@/lib/format";
import { clientSpaceHref } from "@/lib/host";
import { liveStaff } from "@/lib/store/staff";
import { listProjectSwarmRuns } from "@/lib/swarm-runs";
import { DataTable, type Column } from "@/components/data-table";
import { WorkBoard } from "../../work/board";
import { FormDrawer } from "@/components/form-drawer";
import { PageFrame } from "@/components/page-frame";
import { StatusBadge } from "@/components/status-badge";
import { StatusDot } from "@/components/status-dot";
import { Timeline } from "@/components/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffShell } from "../../staff-shell";
import { swarmRunLink } from "../../swarm/swarm-link";
import { dayLabel } from "../dates";
import { CreateDeliverableForm } from "../../deliverables/forms";
import { AssignRepoForm, AssignSpaceForm } from "../../clients/repo-forms";
import {
  MilestoneForm,
  ProjectDescriptionForm,
  ProjectStatusForm,
  ProjectTaskForm,
  PublishUpdateForm,
  StatusUpdateForm,
} from "../forms";
import { AUDIENCE_LABEL, HEALTH_LABEL, PROJECT_STATUS_LABEL } from "../labels";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sql, caller } = await requireHqStaffPage();
  const project = await projectById(sql, caller, id);
  if (!project) notFound();
  const now = clock();
  const [org, milestones, tasks, updates, staff, spaces, looseSpaces, activity, capRow, runsOpen, swarmRuns, clientRepos, siblings, swarm] =
    await Promise.all([
    organizationById(sql, caller, project.organization_id),
    listMilestones(sql, caller, project.id),
    listBoard(sql, caller, { projectId: project.id }),
    listStatusUpdates(sql, caller, project.id),
    liveStaff(sql),
    sql.all<{ id: string; slug: string; display_name: string }>(
      `SELECT id, slug, display_name FROM workspaces
       WHERE status != 'purged' AND project_id = ?
       ORDER BY display_name`,
      [project.id],
    ),
    sql.all<{ id: string; slug: string; display_name: string }>(
      `SELECT id, slug, display_name FROM workspaces
       WHERE status != 'purged' AND organization_id = ? AND project_id IS NULL
       ORDER BY display_name`,
      [project.organization_id],
    ),
    listBoardActivity(sql, caller, [project.organization_id]),
    sql.get<{ value: string }>("SELECT value FROM agent_settings WHERE key = 'max_cloud_runs'"),
    openCloudRunCount(sql, caller),
    listProjectSwarmRuns(sql, caller, project.id),
    listRepos(sql, caller, project.organization_id),
    listProjects(sql, caller, project.organization_id),
    boardSwarmExtras(sql),
  ]);
  const repos = clientRepos.filter((repo) => repo.project_id === project.id);
  const unassignedRepos = clientRepos.filter((repo) => repo.project_id == null);
  const repoChoices = siblings.map((row) => ({ id: row.id, name: row.name }));
  const visibleIds = new Set((await workspacesFor(sql, caller)).map((row) => row.id));
  const usableSpaces = spaces.filter((space) => visibleIds.has(space.id));
  const usableLoose = looseSpaces.filter((space) => visibleIds.has(space.id));
  const finished = await listProjectDeliverables(sql, caller, project.id);
  const repoRows = await Promise.all(
    repos.map(async (repo) => ({ repo, summary: await repoActivitySummary(sql, caller, repo.id) })),
  );
  const latest = updates[0];
  const people = [...new Set(tasks.flatMap((task) => (task.assignee_email ? [task.assignee_email] : [])))];
  const due = project.due_at ? ` Due ${formatRelative(project.due_at, now)}.` : "";

  return (
    <StaffShell>
      <PageFrame title={project.name} description={`${PROJECT_STATUS_LABEL[project.status]}.${due}`}>
        {org ? (
          <Link href={`/clients/${org.id}`} className="text-sm">
            {org.name}
          </Link>
        ) : null}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Requirements</CardTitle>
                <CardDescription>
                  Edit this note and save it. The agent reads it and adds tasks that are not already on this project.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ProjectDescriptionForm
                  projectId={project.id}
                  organizationId={project.organization_id}
                  description={project.description}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <CardTitle>Milestones</CardTitle>
                <FormDrawer
                  title="Add a milestone"
                  trigger={
                    <Button variant="outline" size="sm">
                      Add a milestone
                    </Button>
                  }
                >
                  <MilestoneForm projectId={project.id} organizationId={project.organization_id} />
                </FormDrawer>
              </CardHeader>
              <CardContent>
                {milestones.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No milestones yet.</p>
                ) : (
                  <Timeline
                    now={now}
                    items={milestones.map((milestone) => ({
                      id: milestone.id,
                      at: milestone.due_at ?? undefined,
                      title: milestone.name,
                      body: milestone.done_at ? "Done" : undefined,
                      dot: (
                        <StatusDot
                          domain="task"
                          value={
                            milestone.done_at
                              ? "done"
                              : milestone.due_at !== null && milestone.due_at < now
                                ? "late"
                                : "todo"
                          }
                        />
                      ),
                    }))}
                  />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <CardTitle>Tasks</CardTitle>
                <FormDrawer
                  title="Add a task"
                  trigger={
                    <Button variant="outline" size="sm">
                      Add a task
                    </Button>
                  }
                >
                  <ProjectTaskForm
                    projectId={project.id}
                    organizationId={project.organization_id}
                    milestones={milestones.map((milestone) => ({ id: milestone.id, name: milestone.name }))}
                    staff={staff}
                  />
                </FormDrawer>
              </CardHeader>
              <CardContent>
                <WorkBoard
                  cards={tasks}
                  now={now}
                  showClient={false}
                  showProject={false}
                  runCap={capRow && Number.isFinite(Number(capRow.value)) ? Number(capRow.value) : null}
                  runsOpen={runsOpen}
                  activity={activity}
                  runningTaskIds={swarm.runningTaskIds}
                  packs={swarm.packs}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Swarms</CardTitle>
              </CardHeader>
              <CardContent>
                {swarmRuns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No swarms on this project yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {swarmRuns.map((run) => {
                      const href = swarmRunLink(run.execution_id);
                      return (
                        <li key={run.id} className="text-sm">
                          {href ? <Link href={href}>{run.name}</Link> : run.name}
                          <span className="ml-2 text-muted-foreground">{run.status}</span>
                          <span className="ml-2 text-muted-foreground">{run.trigger}</span>
                          <span className="ml-2 text-muted-foreground">{formatRelative(run.started_at, now)}</span>
                        </li>
                      );
                    })}
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
                <DataTable
                  columns={deliverableColumns}
                  rows={finished}
                  rowKey={(row) => row.id}
                  rowHref={(row) => `/deliverables/${row.id}`}
                  empty={<p className="text-sm text-muted-foreground">No finished work yet.</p>}
                />
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
                <CardTitle>Spaces</CardTitle>
                <CardDescription>File folders on this project.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {usableSpaces.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No space linked yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {usableSpaces.map((space) => (
                      <li key={space.id} className="flex items-center gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <a href={clientSpaceHref(space.slug)}>{space.display_name}</a>
                        </Button>
                        <Badge variant="secondary">{space.slug}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
                {usableLoose.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-muted-foreground">On this client, not on a project.</p>
                    <ul className="flex flex-col gap-3">
                      {usableLoose.map((space) => (
                        <li key={space.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                          <span>{space.display_name}</span>
                          <AssignSpaceForm
                            organizationId={project.organization_id}
                            workspaceId={space.id}
                            projectId={project.id}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
          <aside className="flex flex-col gap-6">
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <CardTitle>Status</CardTitle>
                <FormDrawer
                  title="Post an update"
                  description="A client update stays a draft until you publish it. Publishing does not send mail."
                  trigger={
                    <Button variant="outline" size="sm">
                      Post update
                    </Button>
                  }
                >
                  <StatusUpdateForm projectId={project.id} organizationId={project.organization_id} />
                </FormDrawer>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ProjectStatusForm
                  projectId={project.id}
                  organizationId={project.organization_id}
                  status={project.status}
                />
                {updates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No update yet.</p>
                ) : (
                  <ul className="flex flex-col gap-4">
                    {updates.map((update) => (
                      <li key={update.id} className="flex flex-col gap-2 text-sm">
                        <p className="flex flex-wrap items-center gap-2">
                          <StatusDot domain="health" value={update.health} />
                          <span>{HEALTH_LABEL[update.health]}</span>
                          <span className="text-muted-foreground">{formatRelative(update.created_at, now)}</span>
                        </p>
                        <p>{update.body}</p>
                        {update.state === "draft" ? (
                          <PublishUpdateForm
                            updateId={update.id}
                            projectId={project.id}
                            organizationId={project.organization_id}
                          />
                        ) : (
                          <p className="text-muted-foreground">Published</p>
                        )}
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
              <CardContent className="flex flex-col gap-6">
                {repoRows.length === 0 && unassignedRepos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No repos linked to this client yet.{" "}
                    {org ? <Link href={`/clients/${org.id}?tab=repos`}>Link one on the client.</Link> : null}
                  </p>
                ) : null}
                {repoRows.length > 0 ? (
                  <ul className="flex flex-col gap-6">
                    {repoRows.map(({ repo, summary }) => (
                      <li key={repo.id} className="flex flex-col gap-2 text-sm">
                        <span className="font-mono">{repo.full_name}</span>
                        {summary ? <RepoSummary summary={summary} /> : null}
                      </li>
                    ))}
                  </ul>
                ) : unassignedRepos.length > 0 ? (
                  <p className="text-sm text-muted-foreground">None of this client&apos;s repos are on this project yet.</p>
                ) : null}
                {unassignedRepos.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-muted-foreground">On this client, not on a project.</p>
                    <ul className="flex flex-col gap-3">
                      {unassignedRepos.map((repo) => (
                        <li key={repo.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                          <span className="font-mono">{repo.full_name}</span>
                          <AssignRepoForm
                            organizationId={project.organization_id}
                            repoId={repo.id}
                            projectId={null}
                            projects={repoChoices}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Audience</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{latest ? AUDIENCE_LABEL[latest.audience] : ""}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>People</CardTitle>
              </CardHeader>
              <CardContent>
                {people.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No one assigned.</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-sm">
                    {people.map((email) => (
                      <li key={email}>{email}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </PageFrame>
    </StaffShell>
  );
}

const deliverableColumns: Column<{ id: string; title: string; status: string }>[] = [
  {
    key: "title",
    header: "Piece",
    cell: (row) => <span className="font-medium">{row.title}</span>,
  },
  {
    key: "status",
    header: "Status",
    cell: (row) => <StatusBadge domain="deliverable" value={row.status} />,
  },
];

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
