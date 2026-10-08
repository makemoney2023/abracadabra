import Link from "next/link";
import { notFound } from "next/navigation";
import { listClientThreads } from "@/db/conversations";
import { latestSchemaScan } from "@/db/schema-checks";
import { presentSchemaLead } from "@/lib/schema-report";
import {
  DEAL_STAGE_LABEL,
  latestAssessment,
  listContacts,
  listDeals,
  listOpenTasks,
  listOrganizations,
  listProjects,
  listRepos,
  listTimeline,
  organizationById,
  presentAssessment,
  unlinkedWorkspaces,
  type OrgKind,
} from "@/db/crm";
import { clock } from "@/lib/clock";
import { requireHqStaffPage } from "@/lib/current";
import { listVisibleRepos } from "@/lib/github/app";
import { readGithubSecrets } from "@/lib/github/secrets";
import { clientSpaceHref } from "@/lib/host";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffShell } from "../../staff-shell";
import { ClientChat } from "../client-chat";
import { ProjectForm } from "../../projects/forms";
import { PROJECT_STATUS_LABEL } from "../../projects/labels";
import { CallForm, MergeForm, NoteForm, PersonForm, TaskForm } from "../activity-forms";
import { ThreadReplyForm } from "../thread-forms";
import { completeTaskAction } from "../actions";
import { LinkSpaceForm } from "../link-space-form";
import { AssignRepoForm, LinkRepoForm, UnlinkRepoForm } from "../repo-forms";

const KIND_LABEL: Record<OrgKind, string> = {
  lead: "Lead",
  client: "Client",
  past_client: "Past client",
  partner: "Partner",
};

const ACTIVITY_LABEL: Record<string, string> = {
  note: "Note",
  call: "Call",
  file_uploaded: "File in",
  request_done: "Request done",
  pr_opened: "Pull request",
  pr_merged: "Merged",
  release: "Release",
  deploy: "Deploy",
  push: "Push",
  task: "Task",
  task_done: "Task done",
  task_status: "Task",
  stage_change: "Stage",
  "schema.scan": "Schema scan",
  "agent.swarm_run": "Swarm",
  "agent.wake_failed": "Agent did not wake",
};

const PAGE_SIZE = 20;

function day(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function pageNumber(raw: string | undefined): number {
  const value = Number(raw ?? "1");
  if (!Number.isInteger(value) || value < 1) return 1;
  return value;
}

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; merged?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const page = pageNumber(query.page);
  const { sql, caller } = await requireHqStaffPage();
  const client = await organizationById(sql, caller, id);
  if (!client) notFound();
  const [free, linked, contacts, tasks, timeline, orgs, deals, projects, repos, threads, storedCheck, schemaScan] =
    await Promise.all([
    unlinkedWorkspaces(sql, caller),
    sql.all<{ id: string; slug: string; display_name: string }>(
      `SELECT id, slug, display_name FROM workspaces
       WHERE organization_id = ? AND status != 'purged'
       ORDER BY display_name`,
      [client.id],
    ),
    listContacts(sql, caller, client.id),
    listOpenTasks(sql, caller, client.id),
    listTimeline(sql, caller, client.id, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    listOrganizations(sql, caller),
    listDeals(sql, caller, { organizationId: client.id }),
    listProjects(sql, caller, client.id),
    listRepos(sql, caller, client.id),
    listClientThreads(sql, client.id),
    latestAssessment(sql, caller, client.id),
    latestSchemaScan(sql, client.id),
  ]);
  const readiness = storedCheck ? presentAssessment(storedCheck) : null;
  const schema = schemaScan ? presentSchemaLead(schemaScan) : null;
  const secrets = readGithubSecrets();
  const visible = secrets ? await listVisibleRepos({ secrets, fetch, now: clock() }) : null;
  const choices = visible?.ok
    ? visible.value.flatMap((install) =>
        install.suspended ? [] : install.repos.map((repo) => ({ id: repo.id, fullName: repo.fullName })),
      )
    : [];
  const main = contacts.find((person) => person.is_primary === 1);
  const others = orgs.filter((org) => org.id !== client.id).map((org) => ({ id: org.id, name: org.name }));
  return (
    <StaffShell>
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-heading text-4xl leading-tight">{client.name}</h1>
          <ClientChat organizationId={client.id} />
        </div>
        {query.merged === "1" ? <p role="status" className="text-sm">These clients are now one.</p> : null}
        <Link href="/clients" className="text-sm">
          Clients
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{KIND_LABEL[client.kind]}</CardTitle>
          <CardDescription>{client.website ? client.website : "No website yet."}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {client.industry ? <p className="text-sm">{client.industry}</p> : null}
          {client.notes ? <p className="whitespace-pre-wrap text-sm">{client.notes}</p> : null}
          <p className="text-sm">
            Main contact
            <span className="ml-2">
              {main?.name ? main.name : "None yet."}
              {main?.title ? `, ${main.title}` : ""}
              {main?.email ? ` · ${main.email}` : ""}
              {main?.phone ? ` · ${main.phone}` : ""}
            </span>
          </p>
          {linked.length === 0 ? (
            <p className="text-sm text-muted-foreground">No space linked yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {linked.map((space) => (
                <li key={space.id} className="flex items-center gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={clientSpaceHref(space.slug)}>{space.display_name}</a>
                  </Button>
                  <Badge variant="secondary">{space.slug}</Badge>
                </li>
              ))}
            </ul>
          )}
          <LinkSpaceForm organizationId={client.id} spaces={free} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Readiness check</CardTitle>
          <CardDescription>{readiness ? readiness.total : "No readiness check yet."}</CardDescription>
        </CardHeader>
        {readiness ? (
          <CardContent className="flex flex-col gap-4 text-sm">
            {readiness.lines.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {readiness.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            {readiness.answers.length > 0 ? (
              <dl className="flex flex-col gap-2">
                {readiness.answers.map((answer) => (
                  <div key={answer.key}>
                    <dt className="text-muted-foreground">{answer.key}</dt>
                    <dd>{answer.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {readiness.reportUrl ? (
              <a href={readiness.reportUrl} className="underline">
                Report
              </a>
            ) : null}
          </CardContent>
        ) : null}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Schema scan</CardTitle>
          <CardDescription>{schema ? schema.total : "No schema scan yet."}</CardDescription>
        </CardHeader>
        {schema ? (
          <CardContent className="flex flex-col gap-4 text-sm">
            {schema.lines.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {schema.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            {schema.reportUrl ? (
              <a href={schema.reportUrl} className="text-primary underline">
                Report
              </a>
            ) : null}
          </CardContent>
        ) : null}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Deals</CardTitle>
          <CardDescription>
            <Link href="/leads">Open the board</Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {deals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deals yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {deals.map((deal) => (
                <li key={deal.id} className="text-sm">
                  <Link href="/leads">{deal.title}</Link>
                  <span className="ml-2 text-muted-foreground">{DEAL_STAGE_LABEL[deal.stage]}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
          <CardDescription>Milestones, tasks, and status updates live on the project.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {projects.map((project) => (
                <li key={project.id} className="text-sm">
                  <Link href={`/projects/${project.id}`}>{project.name}</Link>
                  <span className="ml-2 text-muted-foreground">{PROJECT_STATUS_LABEL[project.status]}</span>
                </li>
              ))}
            </ul>
          )}
          <ProjectForm organizationId={client.id} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Repos</CardTitle>
          <CardDescription>Repos we work in for this client.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!secrets ? (
            <p className="text-sm text-muted-foreground">
              GitHub is not connected yet. An admin can connect it in Settings.
            </p>
          ) : null}
          {secrets && visible && !visible.ok ? (
            <p className="text-sm text-muted-foreground">GitHub did not answer. Try again.</p>
          ) : null}
          {repos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No repos linked yet.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {repos.map((repo) => (
                <li key={repo.id} className="flex flex-col gap-2 text-sm">
                  <span className="font-mono">{repo.full_name}</span>
                  {repo.suspended_at != null ? <span className="text-muted-foreground">Paused</span> : null}
                  <AssignRepoForm
                    organizationId={client.id}
                    repoId={repo.id}
                    projectId={repo.project_id}
                    projects={projects.map((project) => ({ id: project.id, name: project.name }))}
                  />
                  <UnlinkRepoForm organizationId={client.id} repoId={repo.id} projectId={repo.project_id} />
                </li>
              ))}
            </ul>
          )}
          {secrets && visible?.ok ? <LinkRepoForm organizationId={client.id} repos={choices} /> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Conversations</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {threads.length === 0 ? (
            <p className="text-sm text-muted-foreground">No client messages yet.</p>
          ) : (
            threads.map((thread) => (
              <section key={thread.id} className="flex flex-col gap-2">
                <p className="text-sm">
                  <Badge variant="secondary">{thread.channel}</Badge>
                  <span className="ml-2 text-muted-foreground">{thread.state}</span>
                </p>
                <ul className="flex flex-col gap-2 text-sm">
                  {thread.messages.map((message) => (
                    <li key={message.id}>
                      <span className="text-muted-foreground">{message.actorKind === "staff" ? "You" : message.kind}</span>
                      {message.body ? <p className="whitespace-pre-wrap">{message.body}</p> : null}
                    </li>
                  ))}
                </ul>
                <ThreadReplyForm
                  organizationId={client.id}
                  threadId={thread.thread_id}
                  channel={thread.channel}
                  sender={thread.sender}
                />
              </section>
            ))
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>People</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No people yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {contacts.map((person) => (
                <li key={person.id} className="text-sm">
                  <span>{person.name}</span>
                  {person.is_primary === 1 ? (
                    <span className="ml-2 text-muted-foreground">Main contact</span>
                  ) : null}
                  {person.email ? <span className="ml-2 text-muted-foreground">{person.email}</span> : null}
                </li>
              ))}
            </ul>
          )}
          <PersonForm organizationId={client.id} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <NoteForm organizationId={client.id} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Calls</CardTitle>
        </CardHeader>
        <CardContent>
          <CallForm organizationId={client.id} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Tasks</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open tasks.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>{task.title}</span>
                  <form action={completeTaskAction}>
                    <input type="hidden" name="organizationId" value={client.id} />
                    <input type="hidden" name="taskId" value={task.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Mark done
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <TaskForm organizationId={client.id} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {timeline.map((row) => (
                <li key={row.id}>
                  <span className="font-mono text-xs text-muted-foreground">{day(row.created_at)}</span>
                  <span className="ml-2 text-sm">{ACTIVITY_LABEL[row.kind] ?? "Update"}</span>
                  {row.body ? <p className="text-sm">{row.body}</p> : null}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-4 text-sm">
            {page > 1 ? (
              <Link href={page === 2 ? `/clients/${client.id}` : `/clients/${client.id}?page=${page - 1}`}>Newer</Link>
            ) : null}
            {timeline.length === PAGE_SIZE ? (
              <Link href={`/clients/${client.id}?page=${page + 1}`}>Older</Link>
            ) : null}
          </div>
        </CardContent>
      </Card>
      {others.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Merge</CardTitle>
          </CardHeader>
          <CardContent>
            <MergeForm keepId={client.id} others={others} />
          </CardContent>
        </Card>
      ) : null}
    </main>
    </StaffShell>
  );
}
