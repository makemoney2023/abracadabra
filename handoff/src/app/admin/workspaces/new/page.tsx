import { requireSuperAdminPage } from "@/lib/current";
import { liveTemplates } from "@/lib/store/workspaces";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewWorkspaceForm } from "../../new-workspace-form";

export default async function NewWorkspacePage() {
  const { sql } = await requireSuperAdminPage();
  const templates = await liveTemplates(sql);
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-wide text-optic">Handoff</p>
        <h1 className="font-heading text-4xl leading-tight">Add a client</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>New space</CardTitle>
          <CardDescription>
            This makes a new folder for that client. Pick a file ask if you already have one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewWorkspaceForm templates={templates} />
        </CardContent>
      </Card>
    </main>
  );
}
