"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  CRM_ERRORS,
  addNote,
  completeTask,
  createContact,
  createOrganization,
  createTask,
  linkWorkspace,
  logCall,
  mergeOrganizations,
  type CrmError,
  type OrgKind,
} from "@/db/crm";
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

function fieldMessage(error: CrmError, field: "contact" | "note" | "call" | "task" | "merge"): string {
  if (error === "invalid") {
    if (field === "contact") return "Check the name and email.";
    if (field === "note") return "Write a short note.";
    if (field === "call") return "Write what you talked about.";
    if (field === "task") return "Give the task a name.";
    return "Pick a different client.";
  }
  return CRM_ERRORS[error];
}

function refresh(organizationId: string): void {
  revalidatePath(`/clients/${organizationId}`);
  revalidatePath("/clients");
  revalidatePath("/work");
  revalidatePath("/");
}

export async function createContactAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await requireHqStaffPage();
  const organizationId = String(formData.get("organizationId") ?? "");
  const created = await createContact(
    sql,
    caller,
    {
      organizationId,
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      title: String(formData.get("title") ?? ""),
      primary: formData.get("primary") === "1",
    },
    Date.now(),
  );
  if (!created.ok) return { message: fieldMessage(created.error, "contact") };
  refresh(organizationId);
  return { message: "Person added." };
}

export async function addNoteAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await requireHqStaffPage();
  const organizationId = String(formData.get("organizationId") ?? "");
  const saved = await addNote(sql, caller, { organizationId, body: String(formData.get("body") ?? "") }, Date.now());
  if (!saved.ok) return { message: fieldMessage(saved.error, "note") };
  refresh(organizationId);
  return { message: "Note added." };
}

export async function logCallAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await requireHqStaffPage();
  const organizationId = String(formData.get("organizationId") ?? "");
  const saved = await logCall(sql, caller, { organizationId, body: String(formData.get("body") ?? "") }, Date.now());
  if (!saved.ok) return { message: fieldMessage(saved.error, "call") };
  refresh(organizationId);
  return { message: "Call logged." };
}

export async function createTaskAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await requireHqStaffPage();
  const organizationId = String(formData.get("organizationId") ?? "");
  const saved = await createTask(
    sql,
    caller,
    { organizationId, title: String(formData.get("title") ?? "") },
    Date.now(),
  );
  if (!saved.ok) return { message: fieldMessage(saved.error, "task") };
  refresh(organizationId);
  return { message: "Task added." };
}

export async function completeTaskAction(formData: FormData): Promise<void> {
  const { sql, caller } = await requireHqStaffPage();
  const organizationId = String(formData.get("organizationId") ?? "");
  await completeTask(sql, caller, { taskId: String(formData.get("taskId") ?? "") }, Date.now());
  refresh(organizationId);
}

export async function mergeClientAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await requireHqStaffPage();
  const keepId = String(formData.get("keepId") ?? "");
  const merged = await mergeOrganizations(
    sql,
    caller,
    { keepId, dropId: String(formData.get("dropId") ?? "") },
    Date.now(),
  );
  if (!merged.ok) return { message: fieldMessage(merged.error, "merge") };
  refresh(keepId);
  redirect(`/clients/${keepId}?merged=1`);
}
