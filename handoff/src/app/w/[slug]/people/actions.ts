"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { workspacesFor } from "@/db/records";
import { openSession } from "@/lib/current";
import { sendHandoffMail } from "@/lib/mail";
import { publicClientOrigin } from "@/lib/share-link";
import { createInvite, removeMember, resendInvite } from "@/lib/store/invites";
import { parseAllowlist } from "@/lib/store/staff";

export type PeopleState = { message: string };

const SIGN_IN_AGAIN = "Sign in again to do that.";

async function clientOrigin(): Promise<string> {
  const headerList = await headers();
  return publicClientOrigin({
    origin: process.env.HANDOFF_APP_ORIGIN,
    host: headerList.get("x-forwarded-host") ?? headerList.get("host"),
    proto: headerList.get("x-forwarded-proto"),
  });
}

function mail() {
  return {
    origin: "",
    from: process.env.HANDOFF_FROM_EMAIL ?? "",
    allowlist: parseAllowlist(process.env.HANDOFF_SUPER_ADMIN_EMAILS),
    send: sendHandoffMail,
  };
}

export async function invitePersonAction(
  _previous: PeopleState,
  formData: FormData,
): Promise<PeopleState> {
  const { sql, caller } = await openSession();
  const slug = String(formData.get("slug") ?? "");
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace) return { message: SIGN_IN_AGAIN };
  try {
    const created = await createInvite({
      sql,
      caller,
      workspaceId: workspace.id,
      email: String(formData.get("email") ?? ""),
      role: String(formData.get("role") ?? ""),
      now: Date.now(),
      ...mail(),
      origin: await clientOrigin(),
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
  if (!workspace) return { message: SIGN_IN_AGAIN };
  const resent = await resendInvite({
    sql,
    caller,
    inviteId: String(formData.get("inviteId") ?? ""),
    now: Date.now(),
    ...mail(),
    origin: await clientOrigin(),
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
  if (!workspace) return { message: SIGN_IN_AGAIN };
  const removed = await removeMember({
    sql,
    caller,
    membershipId: String(formData.get("membershipId") ?? ""),
    now: Date.now(),
  });
  if (!removed.ok) return { message: removed.message };
  redirect(`/w/${workspace.slug}/people?notice=removed`);
}
