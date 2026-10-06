"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { workspacesFor } from "@/db/records";
import { openSession } from "@/lib/current";
import { sendWithResend } from "@/lib/mail";
import { createInvite, removeMember, resendInvite } from "@/lib/store/invites";
import { parseAllowlist } from "@/lib/store/staff";

export type PeopleState = { message: string };

async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host) throw new Error("mail is not configured");
  const forwarded = headerList.get("x-forwarded-proto");
  const proto =
    forwarded ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

function mail() {
  return {
    origin: "",
    from: process.env.HANDOFF_FROM_EMAIL ?? "",
    allowlist: parseAllowlist(process.env.HANDOFF_SUPER_ADMIN_EMAILS),
    send: sendWithResend,
  };
}

export async function invitePersonAction(
  _previous: PeopleState,
  formData: FormData,
): Promise<PeopleState> {
  const { sql, caller } = await openSession();
  const slug = String(formData.get("slug") ?? "");
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace) notFound();
  try {
    const created = await createInvite({
      sql,
      caller,
      workspaceId: workspace.id,
      email: String(formData.get("email") ?? ""),
      role: String(formData.get("role") ?? ""),
      now: Date.now(),
      ...mail(),
      origin: await requestOrigin(),
    });
    if (!created.ok) return { message: created.message };
  } catch {
    return { message: "We couldn't send the email. Please try again soon." };
  }
  revalidatePath(`/w/${workspace.slug}/people`);
  return { message: "Invited." };
}

export async function resendInviteAction(
  _previous: PeopleState,
  formData: FormData,
): Promise<PeopleState> {
  const { sql, caller } = await openSession();
  const slug = String(formData.get("slug") ?? "");
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace) notFound();
  const resent = await resendInvite({
    sql,
    caller,
    inviteId: String(formData.get("inviteId") ?? ""),
    now: Date.now(),
    ...mail(),
    origin: await requestOrigin(),
  });
  if (!resent.ok) return { message: resent.message };
  revalidatePath(`/w/${workspace.slug}/people`);
  return { message: "Sent again." };
}

export async function removeMemberAction(
  _previous: PeopleState,
  formData: FormData,
): Promise<PeopleState> {
  const { sql, caller } = await openSession();
  const slug = String(formData.get("slug") ?? "");
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace) notFound();
  const removed = await removeMember({
    sql,
    caller,
    membershipId: String(formData.get("membershipId") ?? ""),
    now: Date.now(),
  });
  if (!removed.ok) return { message: removed.message };
  redirect(`/w/${workspace.slug}/people?notice=removed`);
}
