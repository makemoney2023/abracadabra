"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { workspacesFor } from "@/db/records";
import { openSession } from "@/lib/current";
import { openBranding } from "@/lib/store/branding";
import { isLiveSuperAdmin } from "@/lib/store/staff";
import { configureWorkspace, setWorkspaceLogo, type PolicyProfile } from "@/lib/store/workspaces";

export type SettingsState = { message: string };

export async function saveSettingsAction(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { sql, caller } = await openSession();
  const slug = String(formData.get("slug") ?? "");
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace) notFound();
  if (await isLiveSuperAdmin(sql, caller)) {
    const profile = formData.get("policyProfile");
    const policyProfile: PolicyProfile | undefined =
      profile === "standard" || profile === "software" ? profile : undefined;
    const quotaBytes = Number(formData.get("quotaBytes"));
    if (!policyProfile || !Number.isInteger(quotaBytes)) {
      return { message: "You cannot do that." };
    }
    const configured = await configureWorkspace({
      sql,
      caller,
      workspaceId: workspace.id,
      policyProfile,
      quotaBytes,
    });
    if (!configured.ok) return { message: configured.message };
  }
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const stored = await setWorkspaceLogo({
      sql,
      caller,
      workspaceId: workspace.id,
      bytes: new Uint8Array(await logo.arrayBuffer()),
      branding: openBranding(),
    });
    if (!stored.ok) return { message: stored.message };
  }
  revalidatePath(`/w/${workspace.slug}`);
  return { message: "Saved." };
}
