import { z } from "zod";
import { SIGN_IN_MESSAGE } from "@/lib/session";

const inviteEmail = z.string().trim().email();

export type AccessReply = { message: string };

/** The form never says whether an address is on file. */
export function explainAccessRequest(email: string): AccessReply {
  const parsed = inviteEmail.safeParse(email);
  if (!parsed.success) {
    return { message: "Type the email your invite was sent to." };
  }
  return { message: SIGN_IN_MESSAGE };
}
