import Link from "next/link";
import { workspacesFor } from "@/db/records";
import { requireSuperAdminPage } from "@/lib/current";
import { clientSpaceHref } from "@/lib/host";
import { liveStaff } from "@/lib/store/staff";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffShell } from "../staff-shell";

export default async function AdminPage() {
  const { sql, caller } = await requireSuperAdminPage();
  const [workspaces, staff] = await Promise.all([workspacesFor(sql, caller), liveStaff(sql)]);
  return (
    <StaffShell>
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-4xl leading-tight">Staff tools</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/spaces/new">New space</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/spaces/staff">Add staff</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/spaces/templates">Request templates</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/spaces/held">Held files</Link>
          </Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Spaces</CardTitle>
          <CardDescription>Each space has its own name, logo, and storage limit.</CardDescription>
        </CardHeader>
        <CardContent>
          {workspaces.length === 0 ? (
            <p className="text-sm text-muted-foreground">No spaces yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {workspaces.map((workspace) => (
                <li key={workspace.id} className="flex items-center gap-2">
                  <Button variant="outline" className="justify-start" asChild>
                    <a href={clientSpaceHref(workspace.slug)}>{workspace.display_name}</a>
                  </Button>
                  <Badge variant="secondary">{workspace.slug}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Staff</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {staff.map((person) => (
              <li key={person.userId} className="text-sm">
                {person.email}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
    </StaffShell>
  );
}
