import Link from "next/link";
import {
  DEAL_STAGE_LABEL,
  type ActivityRow,
  type AssessmentView,
  type Contact,
  type DealCard,
  type LinkedRepo,
  type Organization,
  type TaskRow,
  type WorkspaceLink,
} from "@/db/crm";
import type { SchemaLeadView } from "@/lib/schema-report";
import { clientSpaceHref } from "@/lib/host";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PersonForm } from "../activity-forms";
import { ActivityLines } from "./activity-tab";
import { CLIENT_KIND_LABEL, tabHref } from "./tabs";

export function OverviewTab({
  client,
  contacts,
  tasks,
  timeline,
  linked,
  repos,
  deals,
  readiness,
  schema,
}: {
  client: Organization;
  contacts: Contact[];
  tasks: TaskRow[];
  timeline: ActivityRow[];
  linked: WorkspaceLink[];
  repos: LinkedRepo[];
  deals: DealCard[];
  readiness: AssessmentView | null;
  schema: SchemaLeadView | null;
}) {
  const main = contacts.find((person) => person.is_primary === 1);
  const recent = timeline.slice(0, 5);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Plan</CardTitle>
            <CardDescription>{CLIENT_KIND_LABEL[client.kind]}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {client.website ? <p>{client.website}</p> : <p className="text-muted-foreground">No website yet.</p>}
            {client.industry ? <p>{client.industry}</p> : null}
            {client.notes ? <p className="whitespace-pre-wrap">{client.notes}</p> : null}
            <p>
              Main contact
              <span className="ml-2">
                {main?.name ? main.name : "None yet."}
                {main?.title ? `, ${main.title}` : ""}
                {main?.email ? ` · ${main.email}` : ""}
                {main?.phone ? ` · ${main.phone}` : ""}
              </span>
            </p>
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
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Next steps</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href={tabHref(client.id, "work")}>Work</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open tasks.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {tasks.map((task) => (
                  <li key={task.id}>{task.title}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Recent activity</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href={tabHref(client.id, "activity")}>Activity</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ActivityLines rows={recent} />
          </CardContent>
        </Card>
      </div>
      <aside className="flex flex-col gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Contacts</CardTitle>
            <PersonForm organizationId={client.id} />
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Spaces</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href={tabHref(client.id, "files")}>Files</Link>
            </Button>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Repos</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href={tabHref(client.id, "repos")}>Repos</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {repos.length === 0 ? (
              <p className="text-sm text-muted-foreground">No repos linked yet.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {repos.map((repo) => (
                  <li key={repo.id} className="font-mono">
                    {repo.full_name}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
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
      </aside>
    </div>
  );
}
