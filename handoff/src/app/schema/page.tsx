import { ExternalLink } from "lucide-react";
import { recentSchemaChecks, schemaCheckSites, schemaReportsFor, type SchemaCheckRow, type SchemaSiteRow } from "@/db/schema-checks";
import { clock } from "@/lib/clock";
import { requireHqStaffPage } from "@/lib/current";
import { formatRelative } from "@/lib/format";
import { stripAnswerPrefix } from "@/lib/schema-report";
import { statusToken } from "@/lib/status-token";
import { sortRows } from "@/components/data-table-sort";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Metric } from "@/components/metric";
import { PageFrame } from "@/components/page-frame";
import { StatusBadge } from "@/components/status-badge";
import { StaffShell } from "../staff-shell";
import { SchemaCheckDrawer } from "./schema-form";

const CHECK_ORIGIN = "https://check.abra-ca-dabra.app";

type Contact = { name?: string; title?: string; email?: string; phone?: string };

type SchemaHistoryRow = {
  id: string;
  site: string;
  domain: string;
  checked: number;
  flag: string | null;
  prose: string;
  contacts: string;
  score: number | null;
  issues: number | null;
  reportUrl: string | null;
  clientId: string | null;
};

function contactsOf(raw: string): Contact[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Contact[]) : [];
  } catch {
    return [];
  }
}

function contactLine(raw: string): string {
  return contactsOf(raw)
    .map((contact) => [contact.name, contact.title, contact.email, contact.phone].filter(Boolean).join(" · "))
    .filter(Boolean)
    .join(", ");
}

function siteLabel(site: SchemaSiteRow): string {
  const name = site.name?.trim();
  return name || site.domain;
}

function checkLabel(check: SchemaCheckRow): string {
  const text = check.objective.trim();
  if (text.length <= 72) return text;
  return `${text.slice(0, 72)}…`;
}

function historyRow(
  check: SchemaCheckRow,
  site: SchemaSiteRow | null,
  reportStatus: string | null,
  issues: number | null,
  score: number | null,
  reportUrl: string | null,
): SchemaHistoryRow {
  const stripped = site?.answer ? stripAnswerPrefix(site.answer) : { flag: null, text: "" };
  const running =
    check.status === "queued" || check.status === "running" || reportStatus === "queued" || reportStatus === "running";
  const failed = check.status === "failed" || reportStatus === "failed";
  const flag = stripped.flag ?? (running ? "pending" : failed ? "fail" : null);
  return {
    id: site?.id ?? check.id,
    site: site ? siteLabel(site) : checkLabel(check),
    domain: site?.domain ?? "",
    checked: check.created_at,
    flag,
    prose: stripped.text || check.error_message || "",
    contacts: site ? contactLine(site.contacts_json) : "",
    score,
    issues,
    reportUrl,
    clientId: site?.organization_id ?? null,
  };
}

function columns(now: number): Column<SchemaHistoryRow>[] {
  return [
    {
      key: "site",
      header: "Site",
      sortable: true,
      cell: (row) => (
        <span className="flex flex-col gap-1">
          <span className="font-medium">{row.site}</span>
          {row.domain && row.domain !== row.site ? (
            <span className="text-sm font-normal text-muted-foreground">{row.domain}</span>
          ) : null}
          {row.prose ? <span className="text-sm font-normal text-muted-foreground">{row.prose}</span> : null}
          {row.contacts ? <span className="text-sm font-normal">{row.contacts}</span> : null}
        </span>
      ),
    },
    {
      key: "checked",
      header: "Checked",
      sortable: true,
      cell: (row) => formatRelative(row.checked, now),
    },
    {
      key: "result",
      header: "Result",
      sortable: true,
      cell: (row) => (row.flag ? <StatusBadge domain="schema" value={row.flag} /> : null),
    },
    {
      key: "issues",
      header: "Issues",
      sortable: true,
      align: "right",
      cell: (row) => (row.issues === null ? "" : <span className="tabular-nums">{row.issues}</span>),
    },
    {
      key: "report",
      header: "Report",
      cell: (row) =>
        row.reportUrl ? (
          <a href={row.reportUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">
            Report
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null,
    },
  ];
}

export default async function SchemaPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const query = await searchParams;
  const sort = typeof query.sort === "string" ? query.sort : undefined;
  const { sql } = await requireHqStaffPage();
  const checks = await recentSchemaChecks(sql);
  const now = clock();
  const grouped = await Promise.all(
    checks.map(async (check) => ({ check, sites: await schemaCheckSites(sql, check.id) })),
  );
  const reports = await schemaReportsFor(
    sql,
    grouped.flatMap(({ sites }) => sites.flatMap((site) => (site.scan_id ? [site.scan_id] : []))),
  );

  const rows: SchemaHistoryRow[] = [];
  for (const { check, sites } of grouped) {
    if (sites.length === 0) {
      rows.push(historyRow(check, null, null, null, null, null));
      continue;
    }
    for (const site of sites) {
      const report = site.scan_id ? reports.get(site.scan_id) : undefined;
      const ready = report?.status === "complete";
      rows.push(
        historyRow(
          check,
          site,
          report?.status ?? null,
          ready ? report.gaps.length : null,
          ready ? report.scoreTotal : null,
          report?.publicToken ? `${CHECK_ORIGIN}/scan/${report.publicToken}` : null,
        ),
      );
    }
  }

  const ordered = sortRows(rows, sort, (row, key) => {
    if (key === "site") return row.site;
    if (key === "checked") return row.checked;
    if (key === "result") return row.flag ?? "";
    if (key === "issues") return row.issues;
    return null;
  });
  const newestAt = rows[0]?.checked;
  const latestBatch = rows.filter((row) => row.checked === newestAt);
  const latest = latestBatch.find((row) => row.score !== null) ?? latestBatch[0];
  const latestToken = latest?.flag ? statusToken("schema", latest.flag) : null;

  return (
    <StaffShell>
      <PageFrame
        title="Schema"
        width="wide"
        description="Name the sites. The latest result sits on top. Older checks stay in the table."
        actions={<SchemaCheckDrawer />}
      >
        {latest ? (
          <div className="mb-6 max-w-sm">
            <Metric
              label="Latest result"
              value={latest.score !== null ? latest.score : (latestToken?.label ?? "No result")}
              hint={`${latest.site}. Checked ${formatRelative(latest.checked, now)}.`}
              tone={latestToken?.tone ?? "neutral"}
            />
          </div>
        ) : null}
        <DataTable
          columns={columns(now)}
          rows={ordered}
          rowKey={(row) => row.id}
          rowHref={(row) => (row.clientId ? `/clients/${row.clientId}` : "")}
          sort={sort}
          basePath="/schema"
          empty={<EmptyState title="No checks yet." body="Run a check to read a site." />}
        />
      </PageFrame>
    </StaffShell>
  );
}
