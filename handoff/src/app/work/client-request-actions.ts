"use server";

import { revalidatePath } from "next/cache";
import { wakeOrganization } from "@/lib/agent-wake";
import { approveWorkRequest, declineWorkRequest, noteKickoff } from "@/lib/client-work";
import { requireHqStaffPage } from "@/lib/current";

/** Staff start a held client request. Unknown clients need an organization id. Project: id, blank (matched), or "new". */
export async function approveClientRequestAction(formData: FormData): Promise<void> {
  const { sql, caller } = await requireHqStaffPage();
  const now = Date.now();
  const result = await approveWorkRequest(sql, {
    id: String(formData.get("id") ?? ""),
    organizationId: String(formData.get("organizationId") ?? "") || null,
    projectId: String(formData.get("projectId") ?? "") || null,
    actor: caller.userId ?? "staff",
    now,
  });
  if (result.ok) {
    let woke = false;
    try {
      woke = await wakeOrganization(
        { AGENT_URL: process.env.AGENT_URL, AGENT_WAKE_SECRET: process.env.AGENT_WAKE_SECRET },
        result.organizationId,
        "work",
        now,
      );
    } catch {
      woke = false;
    }
    await noteKickoff(sql, result.organizationId, woke, now);
  }
  revalidatePath("/work");
}

export async function declineClientRequestAction(formData: FormData): Promise<void> {
  const { sql, caller } = await requireHqStaffPage();
  await declineWorkRequest(sql, {
    id: String(formData.get("id") ?? ""),
    actor: caller.userId ?? "staff",
    reason: String(formData.get("reason") ?? "") || "Declined.",
    now: Date.now(),
  });
  revalidatePath("/work");
}
