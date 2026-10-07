"use server";

import { headers } from "next/headers";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { explainAccessRequest, type AccessReply } from "@/lib/access";
import { sendHandoffMail } from "@/lib/mail";
import { requestMagicLink, SIGN_IN_MESSAGE } from "@/lib/session";
import { parseAllowlist } from "@/lib/store/staff";

async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host) throw new Error("mail is not configured");
  const forwarded = headerList.get("x-forwarded-proto");
  const proto =
    forwarded ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function requestAccess(
  _previous: AccessReply,
  formData: FormData,
): Promise<AccessReply> {
  const email = String(formData.get("email") ?? "");
  const explained = explainAccessRequest(email);
  if (explained.message !== SIGN_IN_MESSAGE) return explained;
  try {
    const sql = await openHandoffDb();
    await migrate(sql);
    return await requestMagicLink({
      sql,
      email,
      now: Date.now(),
      origin: await requestOrigin(),
      from: process.env.HANDOFF_FROM_EMAIL ?? "",
      allowlist: parseAllowlist(process.env.HANDOFF_SUPER_ADMIN_EMAILS),
      send: sendHandoffMail,
    });
  } catch {
    return { message: "We couldn't send the email. Please try again soon." };
  }
}
