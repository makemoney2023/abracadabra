import Link from "next/link";
import { notFound } from "next/navigation";
import { organizationById, unlinkedWorkspaces, type OrgKind } from "@/db/crm";
import { requireHqStaffPage } from "@/lib/current";
import { clientSpaceHref } from "@/lib/host";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffNav } from "../../staff-nav";
import { LinkSpaceForm } from "../link-space-form";

const KIND_LABEL: Record<OrgKind, string> = {
  lead: "Lead",
  client: "Client",
  past_client: "Past client",
  partner: "Partner",
};

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sql, caller } = await requireHqStaffPage();
  const client = await organizationById(sql, caller, id);
  if (!client) notFound();
  const [free, linked] = await Promise.all([
    unlinkedWorkspaces(sql, caller),
    sql.all<{ id: string; slug: string; display_name: string }>(
      `SELECT id, slug, display_name FROM workspaces
       WHERE organization_id = ? AND status != 'purged'
       ORDER BY display_name`,
      [client.id],
    ),
  ]);
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-wide text-optic">Handoff</p>
        <h1 className="font-heading text-4xl leading-tight">{client.name}</h1>
        <StaffNav />
        <Link href="/clients" className="text-sm">
          Clients
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{KIND_LABEL[client.kind]}</CardTitle>
          <CardDescription>
            {client.website ? client.website : "No website yet."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {linked.length === 0 ? (
            <p className="text-sm text-muted-foreground">No space linked yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {linked.map((space) => (
                <li key={space.id}>
                  <a href={clientSpaceHref(space.slug)}>{space.display_name}</a>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{space.slug}</span>
                </li>
              ))}
            </ul>
          )}
          <LinkSpaceForm organizationId={client.id} spaces={free} />
        </CardContent>
      </Card>
    </main>
  );
}
