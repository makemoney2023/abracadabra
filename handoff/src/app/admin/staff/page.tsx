import { workspacesFor } from "@/db/records";
import { requireSuperAdminPage } from "@/lib/current";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffForm } from "../staff-form";

export default async function StaffPage() {
  const { sql, caller } = await requireSuperAdminPage();
  const workspaces = await workspacesFor(sql, caller);
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-wide text-optic">Handoff</p>
        <h1 className="font-heading text-4xl leading-tight">Add staff</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Operator</CardTitle>
        </CardHeader>
        <CardContent>
          <StaffForm
            workspaces={workspaces.map((workspace) => ({
              id: workspace.id,
              displayName: workspace.display_name,
            }))}
          />
        </CardContent>
      </Card>
    </main>
  );
}
