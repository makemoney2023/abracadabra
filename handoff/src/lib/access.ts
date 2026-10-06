import { z } from "zod";

const inviteEmail = z.string().trim().email();

export type AccessReply = { message: string };

/** Signed-out visitors are not signed in from this form. Invites come from an operator. */
export function explainAccessRequest(email: string): AccessReply {
  const parsed = inviteEmail.safeParse(email);
  if (!parsed.success) {
    return { message: "Enter the email on your invite." };
  }
  return {
    message: "Handoff opens from an invite. This address is not signed in.",
  };
}
