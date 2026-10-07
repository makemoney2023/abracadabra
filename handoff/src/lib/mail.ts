import type { OutboundMail } from "@/lib/session";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

type EmailMessage = {
  to: string;
  from: string;
  subject: string;
  text: string;
};

type EmailBinding = {
  send: (message: EmailMessage) => Promise<{ messageId: string }>;
};

type ContextHolder = typeof globalThis & {
  [CLOUDFLARE_CONTEXT]?: { env?: { EMAIL?: EmailBinding } };
};

function emailBinding(): EmailBinding | undefined {
  return (globalThis as ContextHolder)[CLOUDFLARE_CONTEXT]?.env?.EMAIL;
}

/** Sends one Handoff message through Cloudflare Email Service. Errors stay generic so tokens and response bodies are not logged. */
export async function sendHandoffMail(message: OutboundMail): Promise<void> {
  const binding = emailBinding();
  if (binding) {
    await binding.send({
      to: message.to,
      from: message.from,
      subject: message.subject,
      text: message.text,
    });
    return;
  }

  const token = process.env.CLOUDFLARE_API_TOKEN?.trim() ?? "";
  const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
  if (!token || !account) throw new Error("mail is not configured");

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/email/sending/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: message.to,
        from: message.from,
        subject: message.subject,
        text: message.text,
      }),
    },
  );

  let accepted = false;
  if (response.ok) {
    try {
      const body = (await response.json()) as { success?: boolean };
      accepted = body.success === true;
    } catch {
      accepted = false;
    }
  }
  if (!accepted) throw new Error("mail was refused");
}
