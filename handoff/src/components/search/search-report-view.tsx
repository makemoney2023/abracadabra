import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown, CircleAlert, Clock, SearchX, Unplug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SearchProperty } from "@/lib/search/properties";
import { PROPERTY_STATUS } from "@/lib/search/present";
import {
  SEARCH_RANGES,
  TOP_ROWS,
  type Change,
  type SearchRangeId,
  type SearchReport,
  type SearchSort,
  type TopRow,
  type Totals,
} from "@/lib/search/report";
import { cn } from "@/lib/utils";
import { SearchChart } from "./search-chart";
import { formatChange, formatCount, formatCtr, formatDay, formatPosition } from "./format";

export type SearchPropertyView = Pick<
  SearchProperty,
  "id" | "site_url" | "status" | "last_error" | "data_through" | "backfill_state"
>;

export type SearchViewState = "no_property" | "pending" | "unavailable" | "sync_error" | "no_data" | "data";

/** Which state the Search view shows for the chosen property. Exported for tests. */
export function searchViewState(property: SearchPropertyView | null, report: SearchReport | null): SearchViewState {
  if (!property) return "no_property";
  if (report?.state === "ok") return "data";
  if (property.status === "pending") return "pending";
  if (property.last_error) return "sync_error";
  if (!report || report.state === "unavailable") return report?.reason === "error" ? "sync_error" : "unavailable";
  return "no_data";
}

type Audience = "staff" | "client";

function href(base: string, params: Record<string, string | undefined>): string {
  const [path, existing = ""] = base.split("?");
  const query = new URLSearchParams(existing);
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
    else query.delete(key);
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

function StateCard({
  icon,
  title,
  children,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">{icon}</EmptyMedia>
            <EmptyTitle>{title}</EmptyTitle>
            <EmptyDescription>{children}</EmptyDescription>
          </EmptyHeader>
          {action ? <EmptyContent>{action}</EmptyContent> : null}
        </Empty>
      </CardContent>
    </Card>
  );
}

function ChangeBadge({ kind, change }: { kind: keyof Totals; change: Change }) {
  const text = formatChange(kind, change);
  if (!text) return <span className="text-xs text-muted-foreground">No earlier period</span>;
  const up = (change.delta ?? 0) > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        change.better === true && "text-emerald-700 dark:text-emerald-400",
        change.better === false && "text-red-700 dark:text-red-400",
        change.better === null && "text-muted-foreground",
      )}
    >
      {change.delta === 0 ? null : up ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />}
      {text}
      <span className="sr-only">{change.better === true ? " (better)" : change.better === false ? " (worse)" : ""}</span>
    </span>
  );
}

const METRICS: {
  key: keyof Totals;
  label: string;
  value: (totals: Totals) => string;
}[] = [
  { key: "clicks", label: "Clicks", value: (t) => formatCount(t.clicks) },
  {
    key: "impressions",
    label: "Impressions",
    value: (t) => formatCount(t.impressions),
  },
  { key: "ctr", label: "CTR", value: (t) => formatCtr(t.ctr) },
  {
    key: "position",
    label: "Avg. position",
    value: (t) => formatPosition(t.position),
  },
];

const SORT_LABEL: Record<SearchSort, string> = {
  clicks: "Clicks",
  impressions: "Impressions",
  ctr: "CTR",
  position: "Position",
};

function TopTable({
  title,
  description,
  column,
  rows,
  sort,
  sortHref,
  display = (label) => label,
}: {
  title: string;
  description: string;
  column: string;
  rows: TopRow[];
  sort: SearchSort;
  sortHref: (sort: SearchSort) => string;
  display?: (label: string) => string;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">None in this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{column}</TableHead>
                {(Object.keys(SORT_LABEL) as SearchSort[]).map((key) => (
                  <TableHead
                    key={key}
                    className="text-right"
                    aria-sort={sort === key ? (key === "position" ? "ascending" : "descending") : "none"}
                  >
                    <Link
                      href={sortHref(key)}
                      scroll={false}
                      className={cn("inline-flex items-center gap-1 hover:text-foreground", sort === key && "text-foreground")}
                    >
                      {SORT_LABEL[key]}
                      {sort === key ? (
                        key === "position" ? (
                          <ArrowUp className="size-3" aria-hidden />
                        ) : (
                          <ArrowDown className="size-3" aria-hidden />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3 opacity-50" aria-hidden />
                      )}
                    </Link>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="max-w-[12rem] truncate sm:max-w-[32rem]" title={row.label}>
                    {display(row.label)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCount(row.clicks)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCount(row.impressions)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCtr(row.ctr)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPosition(row.position)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/** Pages show as their path; the full URL is in the cell's title. */
export function pagePath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

/**
 * Search Console performance for one client: a property picker, a range picker, totals with change, a chart, and the
 * top queries and pages. Shared by the staff client page (Search tab) and the client's own space.
 */
export function SearchReportView({
  audience,
  basePath,
  properties,
  property,
  report,
  range,
  sort,
  settingsHref,
}: {
  audience: Audience;
  /** The page this view lives on, with any params it must keep (for example /clients/abc?tab=search). */
  basePath: string;
  properties: SearchPropertyView[];
  property: SearchPropertyView | null;
  report: SearchReport | null;
  range: SearchRangeId;
  sort: SearchSort;
  /** Staff only: where the Search Console card is. */
  settingsHref?: string;
}) {
  const state = searchViewState(property, report);
  const keep = {
    property: property?.id,
    range: range === "28d" ? undefined : range,
    sort: sort === "clicks" ? undefined : sort,
  };
  const link = (params: Record<string, string | undefined>) => href(basePath, { ...keep, ...params });

  if (state === "no_property") {
    return (
      <StateCard
        icon={<Unplug />}
        title="No Search Console site connected"
        action={
          audience === "staff" && settingsHref ? (
            <Button asChild>
              <Link href={settingsHref}>Connect it in Settings</Link>
            </Button>
          ) : null
        }
      >
        {audience === "staff"
          ? "Map this client's Search Console property on the Settings tab. Clicks, impressions, search terms and top pages show here after the first sync."
          : "We haven't connected your Google Search Console yet. Ask us and we'll set it up."}
      </StateCard>
    );
  }

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        {properties.length > 1 ? (
          <Tabs value={property!.id}>
            <TabsList className="max-w-full justify-start overflow-x-auto">
              {properties.map((item) => (
                <TabsTrigger key={item.id} value={item.id} asChild>
                  <Link href={link({ property: item.id })}>{item.site_url.replace(/^sc-domain:/, "")}</Link>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <code className="truncate text-sm">{property!.site_url}</code>
            <Badge variant={PROPERTY_STATUS[property!.status].tone}>{PROPERTY_STATUS[property!.status].label}</Badge>
          </div>
        )}
        {report && report.state !== "unavailable" ? (
          <p className="text-xs text-muted-foreground">
            {formatDay(report.window.current.start)} to {formatDay(report.window.current.end)}
            {report.window.previous ? `, compared with the ${report.window.current.days} days before` : ""}. Google Search, web
            results.
          </p>
        ) : null}
      </div>
      {report?.state === "ok" ? (
        <Tabs value={range}>
          <TabsList aria-label="Date range">
            {SEARCH_RANGES.map((item) => (
              <TabsTrigger key={item.id} value={item.id} asChild>
                <Link
                  href={link({
                    range: item.id === "28d" ? undefined : item.id,
                  })}
                >
                  {item.label}
                </Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}
    </div>
  );

  if (state !== "data" || report?.state !== "ok") {
    const status = PROPERTY_STATUS[property!.status];
    const body =
      state === "pending" ? (
        <StateCard icon={<Clock />} title="Waiting for access">
          {audience === "staff"
            ? `${status.hint} HQ checks access every hour and starts syncing once Google confirms it.`
            : "We're waiting for access to your Search Console. Once Google confirms it, your search data shows here within a day."}
        </StateCard>
      ) : state === "sync_error" ? (
        <StateCard
          icon={<CircleAlert />}
          title="The last sync failed"
          action={
            audience === "staff" && settingsHref ? (
              <Button variant="outline" asChild>
                <Link href={settingsHref}>Open the Search Console card</Link>
              </Button>
            ) : null
          }
        >
          {audience === "staff"
            ? (property!.last_error ?? "HQ could not read the search data. Try again in a minute.")
            : "We couldn't load your search data just now. We've been told and will fix it."}
        </StateCard>
      ) : (
        <StateCard icon={<SearchX />} title="No search data yet">
          {property!.status === "active"
            ? "Google Search Console is connected. Data shows here after the first daily sync (early each morning, around 4:30 AM Eastern), and 16 months of history load after that."
            : `${status.label}. ${status.hint}`}
        </StateCard>
      );
    return (
      <div className="flex flex-col gap-4">
        {header}
        {body}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {header}
      {property!.status !== "active" || property!.last_error ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          {property!.status !== "active"
            ? `${PROPERTY_STATUS[property!.status].label}: this is the last data HQ saved.`
            : "The last sync had a problem, so the newest days may be missing."}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {METRICS.map((metric) => (
          <Card key={metric.key} className="gap-2 py-4">
            <CardHeader className="px-4">
              <CardDescription>{metric.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{metric.value(report.totals)}</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <ChangeBadge kind={metric.key} change={report.change[metric.key]} />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Clicks and impressions</CardTitle>
          <CardDescription>Per day, up to the newest day Google has finalized. The last two or three days are added once they settle.</CardDescription>
        </CardHeader>
        <CardContent>
          <SearchChart series={report.series} />
        </CardContent>
      </Card>
      <div className="flex flex-col gap-4">
        <TopTable
          title="Top search terms"
          description={`The top ${TOP_ROWS} by ${SORT_LABEL[sort].toLowerCase()}. Google hides rare terms for privacy, so this list adds up to less than the totals above.`}
          column="Search term"
          rows={report.queries}
          sort={sort}
          sortHref={(key) => link({ sort: key === "clicks" ? undefined : key })}
        />
        <TopTable
          title="Top pages"
          description={`The top ${TOP_ROWS} by ${SORT_LABEL[sort].toLowerCase()}.`}
          column="Page"
          rows={report.pages}
          display={pagePath}
          sort={sort}
          sortHref={(key) => link({ sort: key === "clicks" ? undefined : key })}
        />
      </div>
    </div>
  );
}
