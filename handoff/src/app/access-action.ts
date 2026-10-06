"use server";

import { explainAccessRequest, type AccessReply } from "@/lib/access";

export async function requestAccess(
  _previous: AccessReply,
  formData: FormData,
): Promise<AccessReply> {
  return explainAccessRequest(String(formData.get("email") ?? ""));
}
