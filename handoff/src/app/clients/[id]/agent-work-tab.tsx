import Link from "next/link";
import type { ClientAgentWork } from "@/lib/agent-admin";
import { clientSpaceHref } from "@/lib/host";
import { formatRelative } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const UPDATE_LABEL: Record<string, string> = {
  "client_agent.board": "Board",
  "client_agent.handoff": "Handoff",
  "client_agent.dispatch": "Handed to agent",
  "client_agent.assigned": "Assigned",
  "client_agent.unassigned": "Unassigned",
  "client_agent.work_superseded": "Superseded",
  "client_agent.work_withdrawn": "Withdrawn",
  "client_work.update_ready": "Client update to draft",
};

const VISIBILITY: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  held: { label: "Held for review", variant: "default" },
  released: { label: "Released to client", variant: "secondary" },
  superseded: { label: "Superseded", variant: "outline" },
  replacing: { label: "Client sees it until the new version is approved", variant: "outline" },
  withdrawn: { label: "Withdrawn", variant: "outline" },
  published: { label: "In space (before hold)", variant: "outline" },
};

export function AgentWorkTab({ organizationId, work, now }: { organizationId: string; work: ClientAgentWork; now: number }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Agent work</CardTitle>
          <CardDescription>
            Everything this client&apos;s agents filed, newest first. New filings are held: the client sees them only once
            Client Services approves the card.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {work.filed.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agent work filed yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {work.filed.map((item) => (
                <li key={item.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{item.title}</span>
                    <Badge variant="secondary">{item.kind}</Badge>
                    <Badge variant={VISIBILITY[item.visibility]?.variant ?? "outline"}>{VISIBILITY[item.visibility]?.label ?? item.visibility}</Badge>
                    {item.deliverableVersion != null ? <Badge variant="outline">v{item.deliverableVersion}</Badge> : null}
                    {item.taskTitle ? (
                      <Badge variant="outline">{item.taskClosed ? `Done: ${item.taskTitle}` : `Task: ${item.taskTitle}`}</Badge>
                    ) : null}
                    {item.handoffTo ? <Badge variant="outline">Handed to {item.handoffTo}</Badge> : null}
                  </div>
                  {item.summary ? <p className="text-sm text-muted-foreground">{item.summary}</p> : null}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {item.agentLabel} · {formatRelative(item.filedAt, now)}
                    </span>
                    {item.spaceSlug && item.batchId ? (
                      <a className="underline underline-offset-4" href={`${clientSpaceHref(item.spaceSlug)}/batches/${item.batchId}`}>
                        Open in {item.spaceName ?? item.spaceSlug}
                      </a>
                    ) : null}
                    {item.links.map((link) => (
                      <a key={link.url} className="underline underline-offset-4" href={link.url} target="_blank" rel="noreferrer">
                        {link.label}
                      </a>
                    ))}
                  </div>
                  {item.paths.length ? (
                    <ul className="flex flex-col font-mono text-[11px] text-muted-foreground">
                      {item.paths.slice(0, 4).map((path) => (
                        <li key={path}>{path}</li>
                      ))}
                      {item.paths.length > 4 ? <li>+{item.paths.length - 4} more</li> : null}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Agents</CardTitle>
            <CardDescription>
              <Link className="underline underline-offset-4" href="/agents">
                Manage agents
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {work.agents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No agent is assigned to this client.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {work.agents.map((agent) => (
                  <li key={agent.id} className="flex flex-wrap items-center gap-2">
                    <span>{agent.label}</span>
                    <Badge variant={agent.role === "lead" ? "default" : "outline"}>{agent.role === "lead" ? "Lead" : "Hire"}</Badge>
                    {agent.revoked ? <Badge variant="destructive">Revoked</Badge> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Board updates and handoffs</CardTitle>
            <CardDescription>What the agents changed on this client&apos;s board.</CardDescription>
          </CardHeader>
          <CardContent>
            {work.updates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No agent updates yet.</p>
            ) : (
              <ol className="flex flex-col gap-2.5" data-organization={organizationId}>
                {work.updates.map((update) => (
                  <li key={update.id} className="flex flex-col gap-0.5 text-sm">
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{UPDATE_LABEL[update.kind] ?? update.kind}</Badge>
                      {formatRelative(update.at, now)}
                    </span>
                    <span>{update.body}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
