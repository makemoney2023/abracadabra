"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CRM_ERRORS, createOrganization, linkWorkspace, type OrgKind } from "@/db/crm";
import { requireHqStaffPage } from "@/lib/current";

export type FormState = { message: string };

function kindOf(value: FormDataEntryValue | null): OrgKind | undefined {
  if (value === "lead" || value === "client" || value === "past_client" || value === "partner") return value;
  return undefined;
}

export async function createClientAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await requireHqStaffPage();
  const kind = kindOf(formData.get("kind"));
  const created = await createOrganization(
    sql,
    caller,
    {
      name: String(formData.get("name") ?? ""),
      website: String(formData.get("website") ?? ""),
      kind,
    },
    Date.now(),
  );
  if (!created.ok) return { message: CRM_ERRORS[created.error] };
  redirect(`/clients/${created.value.id}`);
}

export async function linkSpaceAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await requireHqStaffPage();
  const organizationId = String(formData.get("organizationId") ?? "");
  const linked = await linkWorkspace(
    sql,
    caller,
    {
      organizationId,
      workspaceId: String(formData.get("workspaceId") ?? ""),
    },
    Date.now(),
  );
  if (!linked.ok) return { message: CRM_ERRORS[linked.error] };
  revalidatePath(`/clients/${organizationId}`);
  revalidatePath("/clients");
  return { message: "This space is now linked." };
}
