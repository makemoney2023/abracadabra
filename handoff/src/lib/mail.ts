import type { OutboundMail } from "@/lib/session";

/** Sends one Handoff message through Resend. Errors stay generic so tokens and response bodies are not logged. */
export async function sendWithResend(message: OutboundMail): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim() ?? "";
  if (key.length === 0) throw new Error("mail is not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: message.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    }),
  });
  if (!response.ok) throw new Error("mail was refused");
}
