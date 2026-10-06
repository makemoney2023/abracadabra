import Link from "next/link";
import { notFound } from "next/navigation";
import {
  listContacts,
  listOpenTasks,
  listOrganizations,
  listTimeline,
  organizationById,
  unlinkedWorkspaces,
  type OrgKind,
} from "@/db/crm";
import { requireHqStaffPage } from "@/lib/current";
import { clientSpaceHref } from "@/lib/host";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffNav } from "../../staff-nav";
import { CallForm, MergeForm, NoteForm, PersonForm, TaskForm } from "../activity-forms";
import { completeTaskAction } from "../actions";
import { LinkSpaceForm } from "../link-space-form";

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
  task: "Task",
  task_done: "Task done",
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
  const [free, linked, contacts, tasks, timeline, orgs] = await Promise.all([
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
  ]);
  const main = contacts.find((person) => person.is_primary === 1);
  const others = orgs.filter((org) => org.id !== client.id).map((org) => ({ id: org.id, name: org.name }));
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-wide text-optic">Handoff</p>
        <h1 className="font-heading text-4xl leading-tight">{client.name}</h1>
        {query.merged === "1" ? <p role="status" className="text-sm">These clients are now one.</p> : null}
        <StaffNav />
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
          <p className="text-sm">
            Main contact
            <span className="ml-2">{main?.name ? main.name : "None yet."}</span>
          </p>
          {linked.length === 0 ? (
            <p className="text-sm text-muted-foreground">No space linked yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {linked.map((space) => (
                <li key={space.id}>
                  <a href={clientSpaceHref(space.slug)}>{space.display_name}</a>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{space.slug}</span>
                </li>
              ))}
            </ul>
          )}
          <LinkSpaceForm organizationId={client.id} spaces={free} />
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
  );
}
