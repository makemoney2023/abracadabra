"use server";

import { redirect } from "next/navigation";
import { openSession } from "@/lib/current";
import { acceptInvite } from "@/lib/store/invites";

export type AcceptState = { message: string };

export async function acceptInviteAction(
  _previous: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const { sql, caller } = await openSession();
  const accepted = await acceptInvite({
    sql,
    caller,
    inviteId: String(formData.get("inviteId") ?? ""),
    now: Date.now(),
  });
  if (!accepted.ok) return { message: accepted.message };
  const workspace = await sql.get<{ slug: string }>("SELECT slug FROM workspaces WHERE id = ?", [
    accepted.value.workspaceId,
  ]);
  if (!workspace) return { message: "That invite doesn't work anymore." };
  redirect(`/w/${workspace.slug}`);
}
