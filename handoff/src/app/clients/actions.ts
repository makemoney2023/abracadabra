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
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireHqStaffPage } from "@/lib/current";
import { runHqTool } from "@/lib/hq-tools";
import { beginDirectClient, scanIntakeBindings } from "@/lib/lead-schema";
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
  if ((kind ?? "client") === "client") {
    const bound = scanIntakeBindings();
    await beginDirectClient({
      sql,
      organizationId: created.value.id,
      website: created.value.website ?? "",
      now: Date.now(),
      queue: bound.queue,
      env: bound.env,
    });
  }
  redirect(`/clients/${created.value.id}`);
}

export async function createClientDrawerAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { sql, caller } = await requireHqStaffPage();
  const name = String(formData.get("name") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  const created = await createOrganization(
    sql,
    caller,
    { name, website, kind: kindOf(formData.get("kind")) },
    Date.now(),
  );
  if (!created.ok) {
    if (created.error === "taken") return fail(CRM_ERRORS.taken, "website");
    if (created.error === "invalid") return fail(CRM_ERRORS.invalid, name.length < 1 ? "name" : "website");
    return fail(CRM_ERRORS[created.error]);
  }
  if ((kindOf(formData.get("kind")) ?? "client") === "client") {
    const bound = scanIntakeBindings();
    await beginDirectClient({
      sql,
      organizationId: created.value.id,
      website: created.value.website ?? "",
      now: Date.now(),
      queue: bound.queue,
      env: bound.env,
    });
  }
  revalidatePath("/clients");
  revalidatePath("/");
  return ok("Client added.");
}

export async function linkSpaceAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
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
  if (!linked.ok) {
    return linked.error === "invalid"
      ? fail(CRM_ERRORS[linked.error], "workspaceId")
      : fail(CRM_ERRORS[linked.error]);
  }
  revalidatePath(`/clients/${organizationId}`);
  revalidatePath("/clients");
  return ok("This space is now linked.");
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

function actionError(error: CrmError, field: "contact" | "note" | "call" | "task" | "merge", name: string): ActionResult {
  return error === "invalid" ? fail(fieldMessage(error, field), name) : fail(fieldMessage(error, field));
}

export async function createContactAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
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
  if (!created.ok) return actionError(created.error, "contact", "name");
  refresh(organizationId);
  return ok("Person added.");
}

export async function addNoteAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { sql, caller } = await requireHqStaffPage();
  const organizationId = String(formData.get("organizationId") ?? "");
  const saved = await addNote(sql, caller, { organizationId, body: String(formData.get("body") ?? "") }, Date.now());
  if (!saved.ok) return actionError(saved.error, "note", "body");
  refresh(organizationId);
  return ok("Note added.");
}

export async function logCallAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { sql, caller } = await requireHqStaffPage();
  const organizationId = String(formData.get("organizationId") ?? "");
  const saved = await logCall(sql, caller, { organizationId, body: String(formData.get("body") ?? "") }, Date.now());
  if (!saved.ok) return actionError(saved.error, "call", "body");
  refresh(organizationId);
  return ok("Call logged.");
}

export async function createTaskAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { sql, caller } = await requireHqStaffPage();
  const organizationId = String(formData.get("organizationId") ?? "");
  const saved = await createTask(
    sql,
    caller,
    { organizationId, title: String(formData.get("title") ?? "") },
    Date.now(),
  );
  if (!saved.ok) return actionError(saved.error, "task", "title");
  refresh(organizationId);
  return ok("Task added.");
}

export async function completeTaskAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { sql, caller } = await requireHqStaffPage();
  const organizationId = String(formData.get("organizationId") ?? "");
  const saved = await completeTask(sql, caller, { taskId: String(formData.get("taskId") ?? "") }, Date.now());
  if (!saved.ok) return fail(CRM_ERRORS[saved.error]);
  refresh(organizationId);
  return ok("Marked done.");
}

export async function mergeClientAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { sql, caller } = await requireHqStaffPage();
  const keepId = String(formData.get("keepId") ?? "");
  const merged = await mergeOrganizations(
    sql,
    caller,
    { keepId, dropId: String(formData.get("dropId") ?? "") },
    Date.now(),
  );
  if (!merged.ok) return actionError(merged.error, "merge", "dropId");
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

export async function replyToThreadAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { sql, caller } = await requireHqStaffPage();
  const organizationId = String(formData.get("organizationId") ?? "");
  const threadId = String(formData.get("threadId") ?? "");
  const channel = String(formData.get("channel") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const sender = String(formData.get("sender") ?? "");
  if (!caller.userId || !body) return fail("Write a reply.", "body");
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
      return fail("Saved. The email did not send.");
    }
  }
  revalidatePath(`/clients/${organizationId}`);
  return ok("Sent.");
}
