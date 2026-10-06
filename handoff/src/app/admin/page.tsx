import Link from "next/link";
import { workspacesFor } from "@/db/records";
import { requireSuperAdminPage } from "@/lib/current";
import { liveStaff } from "@/lib/store/staff";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminPage() {
  const { sql, caller } = await requireSuperAdminPage();
  const [workspaces, staff] = await Promise.all([workspacesFor(sql, caller), liveStaff(sql)]);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-wide text-optic">Handoff</p>
        <h1 className="font-heading text-4xl leading-tight">Staff tools</h1>
        <div className="flex gap-4 text-sm">
          <Link href="/admin/workspaces/new">Open a workspace</Link>
          <Link href="/admin/staff">Add staff</Link>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Workspaces</CardTitle>
          <CardDescription>Each locker has its own display name, logo, and quota.</CardDescription>
        </CardHeader>
        <CardContent>
          {workspaces.length === 0 ? (
            <p className="text-sm text-muted-foreground">No workspaces yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {workspaces.map((workspace) => (
                <li key={workspace.id}>
                  <Link href={`/w/${workspace.slug}`}>{workspace.display_name}</Link>
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
