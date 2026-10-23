import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelative } from "@/lib/format";
import { USAGE_WINDOWS, type UsageRow, type UsageStats } from "@/lib/skill-usage";
import { cn } from "@/lib/utils";

function rate(row: UsageRow): string {
  return row.approvalRate == null ? "—" : `${Math.round(row.approvalRate * 100)}%`;
}

/** A Useful / Not useful count from agents' skill_feedback. Zero shows a quiet dash. */
function Verdict({ count, tone }: { count: number; tone: "useful" | "not-useful" }) {
  if (count === 0) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={tone === "useful" ? "secondary" : "outline"}>{count}</Badge>;
}

function columns(kind: "pack" | "skill", now: number): Column<UsageRow>[] {
  return [
    {
      key: "name",
      header: kind === "pack" ? "Pack" : "Skill",
      cell: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{row.name}</span>
          <span className="truncate font-mono text-xs text-muted-foreground">{row.key}</span>
        </div>
      ),
    },
    { key: "reads", header: "Reads", align: "right", cell: (row) => row.reads },
    { key: "cites", header: "Cited", align: "right", cell: (row) => row.cites },
    ...(kind === "pack" ? [{ key: "attaches", header: "Attached", align: "right" as const, cell: (row: UsageRow) => row.attaches }] : []),
    { key: "useful", header: "Useful", align: "right", cell: (row) => <Verdict count={row.useful} tone="useful" /> },
    { key: "notUseful", header: "Not useful", align: "right", cell: (row) => <Verdict count={row.notUseful} tone="not-useful" /> },
    { key: "cards", header: "Cards", align: "right", cell: (row) => row.cards },
    { key: "approved", header: "Approved", align: "right", cell: (row) => row.approved },
    { key: "sentBack", header: "Sent back", align: "right", cell: (row) => row.sentBack },
    { key: "rate", header: "Approval", align: "right", cell: (row) => <span title={`${row.approved} of ${row.reviewed} reviewed cards`}>{rate(row)}</span> },
    {
      key: "last",
      header: "Last used",
      cell: (row) => (row.lastUsedAt == null ? <span className="text-muted-foreground">Never</span> : formatRelative(row.lastUsedAt, now)),
    },
  ];
}

/**
 * Agents page: is the library being used, and does it help? Reads and cites per pack and skill, whether agents marked a skill Useful or Not useful on their filings, and how Client Services
 * reviewed the cards that used them. Approval = cards whose latest review is approve, of the cards reviewed.
 */
export function SkillUsageCard({ stats, now }: { stats: UsageStats; now: number }) {
  const t = stats.totals;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>Skill usage</CardTitle>
          <CardDescription>
            Last {stats.days} days: {t.reads} reads, {t.cites} cited on filings, {t.useful} marked useful, {t.notUseful} not useful, {t.attaches} attached to cards, {t.searches} searches.
            {stats.trackingSince == null ? " Nothing logged yet." : ` Tracking since ${formatRelative(stats.trackingSince, now)}.`}
          </CardDescription>
        </div>
        <nav aria-label="Usage window" className="inline-flex rounded-lg border border-border p-0.5 text-sm">
          {USAGE_WINDOWS.map((days) => (
            <Link
              key={days}
              href={`/agents?usage=${days}`}
              aria-current={days === stats.days ? "page" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1 text-muted-foreground hover:text-foreground",
                days === stats.days && "bg-muted font-medium text-foreground",
              )}
            >
              {days} days
            </Link>
          ))}
        </nav>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">By pack</h3>
          <DataTable
            columns={columns("pack", now)}
            rows={stats.packs}
            rowKey={(row) => row.key}
            empty={<EmptyState title="No pack used yet" body="Reads, cites, and attachments by agents show up here." />}
          />
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">By skill</h3>
          <DataTable
            columns={columns("skill", now)}
            rows={stats.skills.slice(0, 50)}
            rowKey={(row) => row.key}
            empty={<EmptyState title="No skill read yet" body="An agent reading a SKILL.md or citing it on a filing shows up here." />}
          />
          {stats.skills.length > 50 ? <p className="text-xs text-muted-foreground">Top 50 of {stats.skills.length} skills.</p> : null}
        </section>
        <details className="rounded-lg border border-border p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Never used: {stats.neverUsedPacks.length} pack{stats.neverUsedPacks.length === 1 ? "" : "s"}
          </summary>
          {stats.neverUsedPacks.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {stats.neverUsedPacks.map((pack) => (
                <li key={pack.prefix} className="rounded-md border border-border px-1.5 font-mono text-xs">
                  {pack.prefix} <span className="text-muted-foreground">({pack.count})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-muted-foreground">Every pack has been used at least once.</p>
          )}
        </details>
      </CardContent>
    </Card>
  );
}
