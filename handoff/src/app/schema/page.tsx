import Link from "next/link";
import { recentSchemaChecks, schemaCheckSites } from "@/db/schema-checks";
import { requireHqStaffPage } from "@/lib/current";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffShell } from "../staff-shell";
import { SchemaForm } from "./schema-form";

const VERDICT: Record<string, string> = {
  needs_us: "Needs us",
  covered: "Covered",
  unread: "Unread",
};

type Contact = { name?: string; title?: string; email?: string; phone?: string };

function contactsOf(raw: string): Contact[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Contact[]) : [];
  } catch {
    return [];
  }
}

export default async function SchemaPage({ searchParams }: { searchParams: Promise<{ check?: string }> }) {
  const query = await searchParams;
  const { sql } = await requireHqStaffPage();
  const checks = await recentSchemaChecks(sql);
  const selected = query.check && checks.some((check) => check.id === query.check) ? query.check : checks[0]?.id;
  const sites = selected ? await schemaCheckSites(sql, selected) : [];
  const current = checks.find((check) => check.id === selected);

  return (
    <StaffShell>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-16">
        <div className="flex flex-col gap-3">
          <h1 className="font-heading text-4xl leading-tight">Schema</h1>
          <p className="max-w-xl text-muted-foreground">
            Name the sites. Every one shows a result. A site that needs us becomes a lead, with the contacts found on the page.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Check sites</CardTitle>
            <CardDescription>Paste URLs or bare domains. This can take a minute.</CardDescription>
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
