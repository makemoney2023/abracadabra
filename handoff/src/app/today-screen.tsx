import Link from "next/link";
import type { TodayBoard } from "@/db/crm";
import { DEAL_STAGE_LABEL, type DealStage } from "@/db/crm";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageFrame } from "@/components/page-frame";
import { Metric } from "@/components/metric";
import { MetricStrip } from "@/components/metric-strip";
import { DataTable, type Column } from "@/components/data-table";
import { Timeline, type TimelineItem } from "@/components/timeline";
import { EmptyState } from "@/components/empty-state";
import { StatusDot } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import { RequestDecisionForm } from "./clients/thread-forms";
import { markFeedReadAction } from "./today-actions";
import { OpenPaletteButton, TodayFeedFilters } from "./today-controls";
import {
  FEED_PAGE,
  agentWork,
  agentWorkStats,
  clientChoices,
  dayGroup,
  eventNeeds,
  filterFeed,
  fyiRows,
  pageRows,
  unreadCount,
  type AgentWorkRow,
  type FeedFilter,
  type FeedRow,
} from "./today-feed";
import {
  clientsAtRisk,
  greeting,
  needsCount,
  needsYou,
  todayKicker,
  todayMetrics,
  type ClientHealth,
  type TodayItem,
} from "./today-view";

const GROUPS = ["Today", "Yesterday", "Earlier"] as const;
const NEEDS_SHOWN = 12;
const AGENT_WORK_SHOWN = 6;

function ageOf(at: number | undefined, now: number): string {
  if (at === undefined || at > now) return "";
  return formatRelative(at, now);
}

function statusValue(tone: TodayItem["tone"]): { domain: "task" | "project"; value: string } {
  if (tone === "late") return { domain: "task", value: "late" };
  if (tone === "blocked") return { domain: "task", value: "blocked" };
  return { domain: "project", value: "waiting_on_client" };
}

function columns(now: number): Column<TodayItem>[] {
  return [
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
      cell: (row) => (
        <div className="min-w-0">
          {row.href ? (
            <Link href={row.href} className="font-medium hover:underline">
              {row.title}
            </Link>
          ) : (
            <span className="font-medium">{row.title}</span>
          )}
          {row.body ? <p className="truncate text-xs text-muted-foreground">{row.body}</p> : null}
        </div>
      ),
    },
    { key: "client", header: "Client", cell: (row) => row.client ?? "" },
    { key: "age", header: "Age", align: "right", cell: (row) => ageOf(row.at, now) },
  ];
}

const DECISION_LABEL: Record<AgentWorkRow["decision"], string> = {
  approved: "Approved",
  sent_back: "Sent back",
  waiting: "Waiting",
  filed: "Filed",
  handoff: "Handed off",
};

const DECISION_TONE: Record<AgentWorkRow["decision"], string> = {
  approved: "text-status-complete",
  sent_back: "text-status-late",
  waiting: "text-status-waiting",
  filed: "text-status-active",
  handoff: "text-muted-foreground",
};

function feedHref(query: { type: FeedFilter; client: string | null }, limit: number): string {
  const params = new URLSearchParams();
  if (query.type !== "all") params.set("type", query.type);
  if (query.client) params.set("client", query.client);
  if (limit > FEED_PAGE) params.set("limit", String(limit));
  const text = params.toString();
  return text ? `/?${text}` : "/";
}

function feedItem(row: FeedRow, seenAt: number | null): TimelineItem {
  const unread = seenAt !== null && row.at > seenAt;
  return {
    id: row.id,
    at: row.at,
    title: row.title,
    body: row.body ? `${row.client} · ${row.body}` : row.client,
    href: row.href,
    dot: (
      <span
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          row.failed ? "bg-status-late" : unread ? "bg-optic" : "bg-muted-foreground/30",
        )}
        aria-label={unread ? "New" : undefined}
      />
    ),
  };
}

export function TodayScreen({
  board,
  now,
  activeClients,
  health,
  name,
  query,
  seenAt,
}: {
  board: TodayBoard;
  now: number;
  activeClients: number;
  health: ClientHealth[];
  name?: string;
  query: { type: FeedFilter; client: string | null; limit: number };
  seenAt: number | null;
}) {
  const when = new Date(now);
  const metrics = todayMetrics(board, now, activeClients);
  const needs = needsYou(board, NEEDS_SHOWN, now);
  const needsTotal = needsCount(board, now);
  const tasks = needs.filter((row) => !row.request);
  const requests = needs.filter((row) => row.request);

  const work = filterFeed(agentWork(board.events), { client: query.client });
  const stats = agentWorkStats(board.events, board.reviewWaiting.length);

  const needIds = new Set(eventNeeds(board.events, now).map((alert) => alert.id));
  const fyi = filterFeed(fyiRows(board.events, board.newLeads, now, needIds), query);
  const page = pageRows(fyi, query.limit);
  const fresh = unreadCount(fyi, seenAt);
  const grouped = GROUPS.map((label) => ({
    label,
    items: page.rows.filter((row) => dayGroup(row.at, now) === label).map((row) => feedItem(row, seenAt)),
  })).filter((group) => group.items.length > 0);

  const risk = clientsAtRisk(health);
  const choices = clientChoices(board.clients);

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
          <Metric key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} href={metric.href} />
        ))}
      </MetricStrip>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-medium">Needs you</h2>
          {needs.length > 0 ? (
            <Link href="/work" className="text-sm text-muted-foreground hover:text-foreground">
              {needsTotal > needs.length ? `${needsTotal - needs.length} more · View all` : "View all"}
            </Link>
          ) : null}
        </div>
        {needs.length === 0 ? (
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
              <DataTable columns={columns(now)} rows={tasks} rowKey={(row) => row.id} empty={null} />
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

      <section className="space-y-3 rounded-lg border border-border p-4" aria-label="Agent work">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-medium">Agent work</h2>
          <Link href="/work" className="text-sm text-muted-foreground hover:text-foreground">
            Board
          </Link>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Waiting on Client Services", value: stats.waiting, tone: "text-status-waiting" },
            { label: "Filed this week", value: stats.filed, tone: "text-status-active" },
            { label: "Approved", value: stats.approved, tone: "text-status-complete" },
            { label: "Sent back", value: stats.sentBack, tone: "text-status-late" },
          ].map((stat) => (
            <div key={stat.label}>
              <dt className="eyebrow text-[11px] text-muted-foreground">{stat.label}</dt>
              <dd className={cn("font-heading text-2xl tabular-nums", stat.tone)}>{stat.value}</dd>
            </div>
          ))}
        </dl>
        {work.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agent filings or Client Services decisions this week.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {work.slice(0, AGENT_WORK_SHOWN).map((row) => (
              <li key={row.id} className="flex items-baseline justify-between gap-3 py-2">
                <div className="min-w-0">
                  <span className={cn("mr-2 eyebrow text-[11px]", DECISION_TONE[row.decision])}>
                    {DECISION_LABEL[row.decision]}
                  </span>
                  <Link href={row.href} className="font-medium hover:underline">
                    {row.title}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.body ? `${row.client} · ${row.body}` : row.client}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{formatRelative(row.at, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <h2 className="font-heading text-lg font-medium">FYI</h2>
              {fresh > 0 ? (
                <span className="text-sm text-optic">
                  {fresh} new since your last visit
                </span>
              ) : null}
              {fresh > 0 ? (
                <form action={markFeedReadAction}>
                  <button type="submit" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
                    Mark all read
                  </button>
                </form>
              ) : null}
            </div>
            <TodayFeedFilters type={query.type} client={query.client} choices={choices} />
          </div>
          {grouped.length === 0 ? (
            <EmptyState title="Nothing new" />
          ) : (
            grouped.map((group) => (
              <div key={group.label} className="space-y-2">
                <h3 className="eyebrow text-[11px] text-muted-foreground">
                  {group.label}
                </h3>
                <Timeline items={group.items} now={now} />
              </div>
            ))
          )}
          {page.more > 0 ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={feedHref(query, query.limit + FEED_PAGE)} scroll={false}>
                Show more ({page.more})
              </Link>
            </Button>
          ) : null}
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-border p-4">
            <h2 className="mb-3 font-heading text-sm font-medium">Pipeline</h2>
            <ul className="flex flex-col gap-1.5 text-sm">
              {board.pipeline.map((stage) => (
                <li key={stage.stage} className="flex items-baseline justify-between gap-3">
                  <Link href="/leads" className="hover:underline">
                    {DEAL_STAGE_LABEL[stage.stage as DealStage] ?? stage.stage}
                  </Link>
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
        </aside>
      </div>
    </PageFrame>
  );
}
