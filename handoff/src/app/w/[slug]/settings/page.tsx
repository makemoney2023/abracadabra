import { notFound } from "next/navigation";
import { workspacesFor } from "@/db/records";
import { can } from "@/lib/authz";
import { openSession } from "@/lib/current";
import { isLiveSuperAdmin } from "@/lib/store/staff";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RetentionControls } from "./retention-controls";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sql, caller } = await openSession();
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace) notFound();
  const canConfigure = await isLiveSuperAdmin(sql, caller);
  const canBrand = canConfigure || caller.operatorOf.includes(workspace.id);
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-6 py-16">
      <h1 className="font-heading text-4xl leading-tight">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>{workspace.display_name}</CardTitle>
          <CardDescription>Profile and quota are set by a super-admin. Staff can replace the logo.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm
            slug={workspace.slug}
            policyProfile={workspace.policy_profile}
            quotaBytes={workspace.quota_bytes}
            canConfigure={canConfigure}
            canBrand={canBrand}
          />
          <RetentionControls
            slug={workspace.slug}
            status={workspace.status}
            purgeOn={workspace.purge_after === null ? null : new Date(workspace.purge_after).toISOString().slice(0, 10)}
            canArchive={can(caller, "workspace.archive", { workspaceId: workspace.id })}
            canExport={can(caller, "workspace.export", { workspaceId: workspace.id })}
            canPurge={can(caller, "workspace.purge", { workspaceId: workspace.id })}
          />
        </CardContent>
      </Card>
    </main>
  );
}
