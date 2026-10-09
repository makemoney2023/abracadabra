import Link from "next/link";
import type { DealCard, TodayBoard } from "@/db/crm";
import { DEAL_STAGE_LABEL } from "@/db/crm";
import { formatRelative } from "@/lib/format";
import { PageFrame } from "@/components/page-frame";
import { Metric } from "@/components/metric";
import { MetricStrip } from "@/components/metric-strip";
import { DataTable, type Column } from "@/components/data-table";
import { Timeline, type TimelineItem } from "@/components/timeline";
import { EmptyState } from "@/components/empty-state";
import { StatusDot } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import { RequestDecisionForm } from "./clients/thread-forms";
import { OpenPaletteButton, TodayFeedToggle } from "./today-controls";
import {
  activityItems,
  clientsAtRisk,
  greeting,
  needsYou,
  pipelineCounts,
  timelineFilter,
  todayKicker,
  todayMetrics,
  type ClientHealth,
  type TodayFeed,
  type TodayItem,
} from "./today-view";

const GROUPS = ["Today", "Yesterday", "Earlier"] as const;

function dayKey(ms: number): string {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
}

function groupOf(at: number | undefined, now: number): (typeof GROUPS)[number] {
  const stamp = at ?? now;
  if (dayKey(stamp) === dayKey(now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (dayKey(stamp) === dayKey(yesterday.getTime())) return "Yesterday";
  return "Earlier";
}

function ageOf(at: number | undefined, now: number): string {
  if (at === undefined || at > now) return "";
  return formatRelative(at, now);
}

function statusValue(tone: TodayItem["tone"]): { domain: "task" | "project"; value: string } {
  if (tone === "late") return { domain: "task", value: "late" };
  if (tone === "blocked") return { domain: "task", value: "blocked" };
  return { domain: "project", value: "waiting_on_client" };
}

const COLUMNS: Column<TodayItem>[] = [
  {
    key: "status",
    header: "Status",
    width: "4.5rem",
    cell: (row) => {
      const status = statusValue(row.tone);
      return <StatusDot domain={status.domain} value={status.value} />;
    },
  },
  {
    key: "title",
    header: "Title",
    cell: (row) =>
      row.href ? (
        <Link href={row.href} className="font-medium hover:underline">
          {row.title}
        </Link>
      ) : (
        row.title
      ),
  },
  {
    key: "client",
    header: "Client",
    cell: (row) => row.client ?? "",
  },
  {
    key: "age",
    header: "Age",
    align: "right",
    cell: () => "",
  },
];

export function TodayScreen({
  board,
  now,
  activeClients,
  deals,
  health,
  name,
  feed,
}: {
  board: TodayBoard;
  now: number;
  activeClients: number;
  deals: Pick<DealCard, "stage">[];
  health: ClientHealth[];
  name?: string;
  feed: TodayFeed;
}) {
  const when = new Date(now);
  const metrics = todayMetrics(board, now, activeClients);
  const rows = needsYou(board, 8, now);
  const tasks = rows.filter((row) => !row.request);
  const requests = rows.filter((row) => row.request);
  const activity = timelineFilter(activityItems(board), feed);
  const stages = pipelineCounts(deals);
  const risk = clientsAtRisk(health);
  const runs = activityItems(board)
    .filter((item) => item.run)
    .slice(0, 5);
  const columns: Column<TodayItem>[] = COLUMNS.map((column) =>
    column.key === "age" ? { ...column, cell: (row) => ageOf(row.at, now) } : column,
  );
  const grouped = GROUPS.map((label) => ({
    label,
    items: activity
      .filter((item) => groupOf(item.at, now) === label)
      .map(
        (item): TimelineItem => ({
          id: item.id,
          at: item.at ?? now,
          title: item.title,
          body: item.body ?? item.client,
          href: item.href,
        }),
      ),
  })).filter((group) => group.items.length > 0);

  return (
    <PageFrame
      kicker={todayKicker(when)}
      title={greeting(when, name)}
      actions={
        <>
          <Button size="sm" asChild>
            <Link href="/leads">New lead</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/work">New task</Link>
          </Button>
          <OpenPaletteButton />
        </>
      }
    >
      <MetricStrip>
        {metrics.map((metric) => (
          <Metric
            key={metric.label}
            label={metric.label}
            value={metric.value}
            tone={metric.tone}
            href={metric.href}
          />
        ))}
      </MetricStrip>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-medium">Needs you</h2>
          {rows.length > 0 ? (
            <Link href="/work" className="text-sm text-muted-foreground hover:text-foreground">
              View all
            </Link>
          ) : null}
        </div>
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing needs you"
            action={
              <Button variant="outline" size="sm" asChild>
                <Link href="/work">Work</Link>
              </Button>
            }
          />
        ) : (
          <>
            {tasks.length > 0 ? (
              <DataTable columns={columns} rows={tasks} rowKey={(row) => row.id} empty={null} />
            ) : null}
            {requests.length > 0 ? (
              <ul className="flex flex-col gap-4">
                {requests.map((request) => (
                  <li key={request.id} className="rounded-lg border border-border p-4 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link href={request.href ?? "/clients"} className="font-medium hover:underline">
                        {request.client || "Client"}
                      </Link>
                      <span className="text-muted-foreground">{request.title}</span>
                    </div>
                    <RequestDecisionForm id={request.id} />
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-medium">Activity</h2>
            <TodayFeedToggle value={feed} />
          </div>
          {grouped.length === 0 ? (
            <EmptyState title="Nothing new" />
          ) : (
            grouped.map((group) => (
              <div key={group.label} className="space-y-2">
                <h3 className="font-mono text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {group.label}
                </h3>
                <Timeline items={group.items} now={now} />
              </div>
            ))
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-border p-4">
            <h2 className="mb-3 font-heading text-sm font-medium">Pipeline</h2>
            <ul className="flex flex-col gap-1.5 text-sm">
              {stages.map((stage) => (
                <li key={stage.stage} className="flex items-baseline justify-between gap-3">
                  <span>{DEAL_STAGE_LABEL[stage.stage]}</span>
                  <span className="tabular-nums text-muted-foreground">{stage.count}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-border p-4">
            <h2 className="mb-3 font-heading text-sm font-medium">Clients at risk</h2>
            {risk.length === 0 ? (
              <p className="text-sm text-muted-foreground">Every client is on track.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {risk.map((client) => (
                  <li key={client.id} className="flex items-center gap-2">
                    <StatusDot domain="health" value={client.health} />
                    <Link href={`/clients/${client.id}`} className="hover:underline">
                      {client.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-border p-4">
            <h2 className="mb-3 font-heading text-sm font-medium">Agent runs</h2>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No agent runs in the last 7 days.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {runs.map((run) => (
                  <li key={run.id}>
                    {run.href ? (
                      <Link href={run.href} className="hover:underline">
                        {run.title}
                      </Link>
                    ) : (
                      <span>{run.title}</span>
                    )}
                    <span className="ml-2 text-muted-foreground">{formatRelative(run.at ?? now, now)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </PageFrame>
  );
}
