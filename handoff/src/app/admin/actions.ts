"use server";

import { redirect } from "next/navigation";
import { openSession } from "@/lib/current";
import { addStaff } from "@/lib/store/staff";
import { assignOperator, createWorkspace, type PolicyProfile } from "@/lib/store/workspaces";

export type FormState = { message: string };

function profileOf(value: FormDataEntryValue | null): PolicyProfile | undefined {
  return value === "standard" || value === "software" ? value : undefined;
}

export async function createWorkspaceAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await openSession();
  const quotaRaw = String(formData.get("quotaBytes") ?? "").trim();
  const quotaBytes = quotaRaw.length === 0 ? undefined : Number(quotaRaw);
  const retentionRaw = String(formData.get("retentionDays") ?? "").trim();
  const retentionDays = retentionRaw.length === 0 ? undefined : Number(retentionRaw);
  const profile = profileOf(formData.get("policyProfile"));
  if (!profile || (quotaBytes !== undefined && !Number.isInteger(quotaBytes)) || (retentionDays !== undefined && !Number.isInteger(retentionDays))) {
    return { message: "You can't do that." };
  }
  const created = await createWorkspace({
    sql,
    caller,
    now: Date.now(),
    fields: {
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      displayName: String(formData.get("displayName") ?? ""),
      senderName: String(formData.get("senderName") ?? ""),
      policyProfile: profile,
      templateId: String(formData.get("templateId") ?? ""),
      quotaBytes,
      retentionDays,
    },
  });
  if (!created.ok) return { message: created.message };
  redirect(`/w/${created.value.slug}`);
}

export async function addStaffAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await openSession();
  const now = Date.now();
  const added = await addStaff({
    sql,
    caller,
    email: String(formData.get("email") ?? ""),
    now,
  });
  if (!added.ok) return { message: added.message };
  const workspaceId = String(formData.get("workspaceId") ?? "");
  if (workspaceId.length === 0) return { message: "Added to the team." };
  const assigned = await assignOperator({
    sql,
    caller,
    now,
    workspaceId,
    userId: added.value.userId,
  });
  if (!assigned.ok) return { message: assigned.message };
  return { message: "Assigned." };
}
