"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { workspacesFor } from "@/db/records";
import { can } from "@/lib/authz";
import { openSession } from "@/lib/current";
import { closeRequest, createRequest, reopenRequest, updateRequest } from "@/lib/store/requests";

export type RequestState = { message: string };

function dueFromForm(value: string): number | null | undefined {
  if (value.trim().length === 0) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const due = Date.UTC(year, month - 1, day);
  const check = new Date(due);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return undefined;
  }
  return due;
}

async function workspaceForSlug(slug: string) {
  const { sql, caller } = await openSession();
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace || !can(caller, "request.manage", { workspaceId: workspace.id })) notFound();
  return { sql, caller, workspace };
}

export async function createRequestAction(
  _previous: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const { sql, caller, workspace } = await workspaceForSlug(String(formData.get("slug") ?? ""));
  const due = dueFromForm(String(formData.get("dueOn") ?? ""));
  if (due === undefined) return { message: "You can't do that." };
  const created = await createRequest({
    sql,
    caller,
    workspaceId: workspace.id,
    title: String(formData.get("title") ?? ""),
    guidance: String(formData.get("guidance") ?? ""),
    suggestedTag: String(formData.get("suggestedTag") ?? ""),
    dueOn: due,
  });
  if (!created.ok) return { message: created.message };
  revalidatePath(`/w/${workspace.slug}`);
  revalidatePath(`/w/${workspace.slug}/requests`);
  return { message: "Request added." };
}

export async function updateRequestAction(
  _previous: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const { sql, caller, workspace } = await workspaceForSlug(String(formData.get("slug") ?? ""));
  const due = dueFromForm(String(formData.get("dueOn") ?? ""));
  if (due === undefined) return { message: "You can't do that." };
  const updated = await updateRequest({
    sql,
    caller,
    workspaceId: workspace.id,
    requestId: String(formData.get("requestId") ?? ""),
    title: String(formData.get("title") ?? ""),
    guidance: String(formData.get("guidance") ?? ""),
    suggestedTag: String(formData.get("suggestedTag") ?? ""),
    dueOn: due,
  });
  if (!updated.ok) return { message: updated.message };
  revalidatePath(`/w/${workspace.slug}`);
  revalidatePath(`/w/${workspace.slug}/requests`);
  return { message: "Saved." };
}

export async function closeRequestAction(
  _previous: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const { sql, caller, workspace } = await workspaceForSlug(String(formData.get("slug") ?? ""));
  const closed = await closeRequest({
    sql,
    caller,
    workspaceId: workspace.id,
    requestId: String(formData.get("requestId") ?? ""),
    now: Date.now(),
  });
  if (!closed.ok) return { message: closed.message };
  revalidatePath(`/w/${workspace.slug}`);
  revalidatePath(`/w/${workspace.slug}/requests`);
  return { message: "Closed." };
}

export async function reopenRequestAction(
  _previous: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const { sql, caller, workspace } = await workspaceForSlug(String(formData.get("slug") ?? ""));
  const reopened = await reopenRequest({
    sql,
    caller,
    workspaceId: workspace.id,
    requestId: String(formData.get("requestId") ?? ""),
    now: Date.now(),
  });
  if (!reopened.ok) return { message: reopened.message };
  revalidatePath(`/w/${workspace.slug}`);
  revalidatePath(`/w/${workspace.slug}/requests`);
  return { message: "Reopened." };
}
