import Link from "next/link";
import { workspacesFor } from "@/db/records";
import { requireSuperAdminPage } from "@/lib/current";
import { clientSpaceHref } from "@/lib/host";
import { liveStaff } from "@/lib/store/staff";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffNav } from "../staff-nav";

export default async function AdminPage() {
  const { sql, caller } = await requireSuperAdminPage();
  const [workspaces, staff] = await Promise.all([workspacesFor(sql, caller), liveStaff(sql)]);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-wide text-optic">Handoff</p>
        <h1 className="font-heading text-4xl leading-tight">Staff tools</h1>
        <StaffNav />
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/spaces/new">New space</Link>
          <Link href="/spaces/staff">Add staff</Link>
          <Link href="/spaces/templates">Request templates</Link>
          <Link href="/spaces/held">Held files</Link>
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
                <li key={workspace.id}>
                  <a href={clientSpaceHref(workspace.slug)}>{workspace.display_name}</a>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{workspace.slug}</span>
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
  );
}
