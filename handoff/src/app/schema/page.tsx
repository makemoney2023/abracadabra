import Link from "next/link";
import { recentSchemaChecks, schemaCheckSites, schemaReportsFor } from "@/db/schema-checks";
import { requireHqStaffPage } from "@/lib/current";
import type { SchemaScanReport } from "@/lib/schema-report";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffShell } from "../staff-shell";
import { SchemaForm } from "./schema-form";

const VERDICT: Record<string, string> = {
  needs_us: "Needs us",
  covered: "Covered",
  unread: "Unread",
};

const CHECK_ORIGIN = "https://check.abra-ca-dabra.app";

type Contact = { name?: string; title?: string; email?: string; phone?: string };

function contactsOf(raw: string): Contact[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Contact[]) : [];
  } catch {
    return [];
  }
}

function SchemaReportView({ report }: { report: SchemaScanReport | undefined }) {
  if (!report) {
    return <p className="studio-kicker mt-4">Scan has not started</p>;
  }
  if (report.status !== "complete") {
    return (
      <p className="studio-kicker mt-4">
        {report.status === "failed" ? report.error || "Scan failed" : "Scan running"}
      </p>
    );
  }
  return (
    <div className="studio-panel mt-4 flex flex-col gap-5 px-4 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="studio-kicker">Schema score</p>
          <p className="font-heading text-5xl leading-none">{report.scoreTotal ?? 0}</p>
        </div>
        {report.publicToken ? (
          <a className="text-sm text-primary underline" href={`${CHECK_ORIGIN}/scan/${report.publicToken}`}>
            Report
          </a>
        ) : null}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {report.pillars.map((pillar) => (
          <li key={pillar.label} className="border border-border px-3 py-2">
            <p className="studio-kicker">{pillar.label}</p>
            <p className="font-heading text-2xl">
              {pillar.score}
              <span className="text-base text-muted-foreground">/{pillar.max}</span>
            </p>
          </li>
        ))}
      </ul>
      {report.pages.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="studio-kicker">Pages</p>
          <ul className="flex flex-col gap-2">
            {report.pages.map((page) => (
              <li key={page.url} className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant={page.hasJsonLd ? "default" : "outline"}>{page.pageType}</Badge>
                <span>{page.hasJsonLd ? page.schemaTypes.join(", ") || "JSON-LD" : "No JSON-LD"}</span>
                <span className="text-muted-foreground">{page.url}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <p className="studio-kicker">Findings</p>
        {report.gaps.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {report.gaps.map((gap) => (
              <li key={`${gap.severity}-${gap.message}`} className="text-sm">
                <Badge variant={gap.severity === "critical" ? "destructive" : "outline"}>{gap.severity}</Badge>
                <span className="ml-2">{gap.message}</span>
                {gap.pageUrl ? <span className="mt-1 block text-muted-foreground">{gap.pageUrl}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No gaps on this scan.</p>
        )}
      </div>
    </div>
  );
}

export default async function SchemaPage({ searchParams }: { searchParams: Promise<{ check?: string }> }) {
  const query = await searchParams;
  const { sql } = await requireHqStaffPage();
  const checks = await recentSchemaChecks(sql);
  const selected = query.check && checks.some((check) => check.id === query.check) ? query.check : checks[0]?.id;
  const sites = selected ? await schemaCheckSites(sql, selected) : [];
  const current = checks.find((check) => check.id === selected);
  const reports = await schemaReportsFor(
    sql,
    sites.flatMap((site) => (site.scan_id ? [site.scan_id] : [])),
  );

  return (
    <StaffShell>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-16">
        <div className="flex flex-col gap-3">
          <h1 className="font-heading text-4xl leading-tight">Schema</h1>
          <p className="max-w-xl text-muted-foreground">
            Name the sites. Every one shows the schema scan: score, pages, and findings. A site that needs us becomes a
            lead, with the contacts found on the page.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Check sites</CardTitle>
            <CardDescription>Paste URLs or bare domains. The scan report follows a minute later.</CardDescription>
          </CardHeader>
          <CardContent>
            <SchemaForm />
          </CardContent>
        </Card>
        {checks.length > 0 ? (
          <section className="flex flex-col gap-4">
            <h2 className="font-heading text-2xl">Results</h2>
            <div className="flex flex-wrap gap-2">
              {checks.map((check) => (
                <Link
                  key={check.id}
                  href={`/schema?check=${check.id}`}
                  className={check.id === selected ? "text-sm underline" : "text-sm text-muted-foreground"}
                >
                  {check.status} · {check.objective.slice(0, 48)}
                </Link>
              ))}
            </div>
            {current?.error_message ? <p className="text-sm text-destructive">{current.error_message}</p> : null}
            <ul className="flex flex-col gap-3">
              {sites.map((site) => {
                const contacts = contactsOf(site.contacts_json);
                return (
                  <li key={site.id} className="rounded-lg border border-border px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium">{site.name || site.domain}</p>
                      <p className="text-sm">{VERDICT[site.verdict] ?? site.verdict}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">{site.domain}</p>
                    {site.answer ? <p className="mt-2 text-sm">{site.answer}</p> : null}
                    {contacts.length > 0 ? (
                      <ul className="mt-2 text-sm">
                        {contacts.map((contact, index) => (
                          <li key={`${site.id}-${index}`}>
                            {[contact.name, contact.title, contact.email, contact.phone].filter(Boolean).join(" · ")}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">No contact on the page.</p>
                    )}
                    {site.organization_id ? (
                      <Link href={`/clients/${site.organization_id}`} className="mt-2 inline-block text-sm underline">
                        Open the lead
                      </Link>
                    ) : null}
                    <SchemaReportView report={site.scan_id ? reports.get(site.scan_id) : undefined} />
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </main>
    </StaffShell>
  );
}
