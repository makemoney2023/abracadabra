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
import { recordStaffReply, workRequestById } from "@/db/conversations";
import { requireHqStaffPage } from "@/lib/current";
import { runHqTool } from "@/lib/hq-tools";
import { sendHandoffMail } from "@/lib/mail";

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

export async function decideRequestAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await requireHqStaffPage();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const result = await runHqTool(
    sql,
    caller,
    {
      tool: "decide_work_request",
      input: {
        id,
        decision,
        kind: String(formData.get("kind") ?? ""),
        outcome: String(formData.get("outcome") ?? ""),
        body: String(formData.get("body") ?? ""),
      },
      idempotencyKey: `today:${id}:${decision}`,
      approved: true,
    },
    Date.now(),
  );
  if ("needsApproval" in result) return { message: "That still needs approval." };
  if (!result.ok) return { message: result.error === "invalid" ? "Name the piece, or give a reason." : "That request is not here." };
  const row = await workRequestById(sql, id);
  if (row && decision === "declined" && row.channel === "email" && row.sender.includes("@")) {
    try {
      await sendHandoffMail({
        to: row.sender,
        from: process.env.HANDOFF_FROM_EMAIL ?? "magic@abra-ca-dabra.app",
        subject: "Re: your request",
        text: row.decline_reason ?? "We can't take this on.",
      });
    } catch {
      return { message: "Declined. The email did not send." };
    }
  }
  revalidatePath("/");
  if (row) revalidatePath(`/clients/${row.organization_id}`);
  return { message: decision === "approved" ? "Approved. A draft invoice is waiting for a price." : "Declined." };
}

export async function replyToThreadAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await requireHqStaffPage();
  const organizationId = String(formData.get("organizationId") ?? "");
  const threadId = String(formData.get("threadId") ?? "");
  const channel = String(formData.get("channel") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const sender = String(formData.get("sender") ?? "");
  if (!caller.userId || !body) return { message: "Write a reply." };
  await recordStaffReply(sql, { organizationId, userId: caller.userId, threadId, channel, body }, Date.now());
  if (channel === "email" && sender.includes("@")) {
    try {
      await sendHandoffMail({
        to: sender,
        from: process.env.HANDOFF_FROM_EMAIL ?? "magic@abra-ca-dabra.app",
        subject: "Re: your note",
        text: body,
      });
    } catch {
      revalidatePath(`/clients/${organizationId}`);
      return { message: "Saved. The email did not send." };
    }
  }
  revalidatePath(`/clients/${organizationId}`);
  return { message: "Sent." };
}
