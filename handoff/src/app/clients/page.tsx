import Link from "next/link";
import { listOrganizations, type OrgKind } from "@/db/crm";
import { requireHqStaffPage } from "@/lib/current";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffShell } from "../staff-shell";

const KIND_LABEL: Record<OrgKind, string> = {
  lead: "Lead",
  client: "Client",
  past_client: "Past client",
  partner: "Partner",
};

export default async function ClientsPage() {
  const { sql, caller } = await requireHqStaffPage();
  const clients = await listOrganizations(sql, caller);
  return (
    <StaffShell>
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-4xl leading-tight">Clients</h1>
        <Button variant="outline" size="sm" className="w-fit" asChild>
          <Link href="/clients/new">Add a client</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All clients</CardTitle>
          <CardDescription>Company records live here. File spaces stay linked to them.</CardDescription>
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">No clients yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {clients.map((client) => (
                <li key={client.id} className="flex items-center gap-2">
                  <Button variant="outline" className="justify-start" asChild>
                    <Link href={`/clients/${client.id}`}>{client.name}</Link>
                  </Button>
                  <Badge variant="secondary">{KIND_LABEL[client.kind]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
    </StaffShell>
  );
}
