"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHqSuperAdminPage } from "@/lib/current";
import { portalRuntime } from "@/lib/portal-env";
import { setPortalServer } from "@/lib/portal-session";

export async function togglePortalServerAction(formData: FormData): Promise<void> {
  await requireHqSuperAdminPage();
  const serverId = String(formData.get("serverId") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  const result = await setPortalServer(portalRuntime(), { serverId, enabled });
  if (!result.ok) redirect(`/mcp?error=${encodeURIComponent(result.error)}`);
  revalidatePath("/mcp");
}
