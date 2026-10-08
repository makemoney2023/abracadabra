import Link from "next/link";
import type { TodayBoard, WorkTask } from "@/db/crm";
import { clientSpaceHref } from "@/lib/host";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityTime } from "./activity-time";
import { RequestDecisionForm } from "./clients/thread-forms";
import { dayLabel } from "./projects/dates";

function taskHref(task: WorkTask): string {
  if (task.project_id) return `/projects/${task.project_id}`;
  return `/clients/${task.organization_id}`;
}

function activityLabel(kind: string, status: string): string {
  if (kind === "agent.wake_failed") return "Agent did not wake";
  if (kind === "schema.scan") {
    if (status === "queued") return "Schema scan queued";
    if (status === "not_started") return "Schema scan did not start";
    return status ? `Schema scan ${status}` : "Schema scan";
  }
  return status ? `Swarm ${status}` : "Swarm run";
}

function activityExtra(label: string, body: string | null): string | null {
  if (!body) return null;
  if (body === label) return null;
  if (body.startsWith(`${label}.`) || body.startsWith(`${label} `)) {
    const rest = body.slice(label.length).replace(/^[\s.:]+/, "");
    return rest || null;
  }
  return body;
}

export function TodayScreen({ board }: { board: TodayBoard }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
      <h1 className="font-heading text-4xl leading-tight">Today</h1>
      <Card>
        <CardHeader>
          <CardTitle>Agent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {board.agentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agent activity in the last 7 days.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {board.agentActivity.map((row) => {
                const label = activityLabel(row.kind, row.status);
                const extra = activityExtra(label, row.body);
                return (
                  <li key={row.id} className="text-sm">
                    <ActivityTime ms={row.createdAt} />
                    <span className="ml-2">{label}</span>
                    {row.organizationId ? (
                      <Link href={`/clients/${row.organizationId}`} className="ml-2">
                        {row.organizationName || "Client"}
                      </Link>
                    ) : null}
                    {row.reportUrl ? (
                      <a href={row.reportUrl} className="ml-2">
                        Report
                      </a>
                    ) : null}
                    {extra ? <p className="text-muted-foreground">{extra}</p> : null}
                    {row.artifacts.length > 0 ? (
                      <p className="font-mono text-xs text-muted-foreground">{row.artifacts.join(", ")}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>New leads</CardTitle>
        </CardHeader>
        <CardContent>
          {board.newLeads.length === 0 ? (
            <p className="text-sm text-muted-foreground">No new leads.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {board.newLeads.map((lead) => (
                <li key={lead.id} className="text-sm">
                  <Link href={`/clients/${lead.organizationId}`}>{lead.title}</Link>
                  <span className="ml-2 text-muted-foreground">{lead.organizationName}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Calls</CardTitle>
        </CardHeader>
        <CardContent>
          {board.calls.length === 0 ? (
            <p className="text-sm text-muted-foreground">No calls in the next 7 days.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {board.calls.map((call) => (
                <li key={call.id} className="text-sm">
                  <Link href={`/clients/${call.organizationId}`}>{call.organizationName}</Link>
                  <span className="ml-2 text-muted-foreground">{dayLabel(call.startsAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Tasks due</CardTitle>
        </CardHeader>
        <CardContent>
          {board.tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks due.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {board.tasks.map((task) => (
                <li key={task.id} className="text-sm">
                  <Link href={taskHref(task)}>{task.title}</Link>
                  <span className="ml-2 text-muted-foreground">{task.organization_name}</span>
                  {task.due_at ? <span className="ml-2 text-muted-foreground">Due {dayLabel(task.due_at)}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Deals that need a next step</CardTitle>
        </CardHeader>
        <CardContent>
          {board.stalledDeals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Every open deal has a next step.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {board.stalledDeals.map((deal) => (
                <li key={deal.id} className="text-sm">
                  <Link href="/leads">{deal.title}</Link>
                  <span className="ml-2 text-muted-foreground">{deal.organizationName}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Waiting on a client</CardTitle>
        </CardHeader>
        <CardContent>
          {board.waitingSpaces.length === 0 ? (
            <p className="text-sm text-muted-foreground">No spaces waiting on a client.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {board.waitingSpaces.map((space) => (
                <li key={`${space.id}-${space.requestTitle}`} className="text-sm">
                  <Button variant="outline" size="sm" asChild>
                    <a href={clientSpaceHref(space.slug)}>{space.displayName}</a>
                  </Button>
                  <span className="ml-2 text-muted-foreground">{space.requestTitle}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {board.invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices due.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {board.invoices.map((invoice) => (
                <li key={invoice.id} className="text-sm">
                  <span>{invoice.number}</span>
                  <span className="ml-2 text-muted-foreground">{invoice.organizationName}</span>
                  <span className="ml-2 text-muted-foreground">Due {dayLabel(invoice.dueAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Needs you</CardTitle>
        </CardHeader>
        <CardContent>
          {board.workRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No client requests waiting.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {board.workRequests.map((request) => (
                <li key={request.id} className="text-sm">
                  <Link href={`/clients/${request.organizationId}`}>{request.organizationName}</Link>
                  <span className="ml-2 text-muted-foreground">{request.channel}</span>
                  <p>{request.body}</p>
                  <RequestDecisionForm id={request.id} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Agent notes</CardTitle>
        </CardHeader>
        <CardContent>
          {board.agentNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agent notes.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {board.agentNotes.map((note) => (
                <li key={note.id} className="text-sm">
                  {note.organizationId ? (
                    <Link href={`/clients/${note.organizationId}`}>{note.organizationName || "Client"}</Link>
                  ) : (
                    <span>{note.organizationName || "Note"}</span>
                  )}
                  {note.body ? <p>{note.body}</p> : null}
                  <span className="font-mono text-xs text-muted-foreground">{dayLabel(note.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
