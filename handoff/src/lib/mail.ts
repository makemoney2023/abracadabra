import type { OutboundMail } from "@/lib/session";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

/** Visible sender on every product email. The address stays HANDOFF_FROM_EMAIL. */
export const HANDOFF_FROM_NAME = "Abra-ca-dabra Ai";

type NamedAddress = {
  email?: string;
  address?: string;
  name: string;
};

type EmailMessage = {
  to: string;
  from: string | NamedAddress;
  subject: string;
  text: string;
  html?: string;
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

function senderAddress(from: string): string {
  const trimmed = from.trim();
  const wrapped = trimmed.match(/<([^>]+)>\s*$/);
  return (wrapped?.[1] ?? trimmed).trim();
}

/** Workers uses `email`. The REST API uses `address`. Both take the same display name. */
function namedFrom(from: string, key: "email" | "address"): string | NamedAddress {
  const email = senderAddress(from);
  if (!email.includes("@")) return from;
  return { [key]: email, name: HANDOFF_FROM_NAME };
}

function outbound(message: OutboundMail, key: "email" | "address"): EmailMessage {
  return {
    to: message.to,
    from: namedFrom(message.from, key),
    subject: message.subject,
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
  };
}

/** Sends one Handoff message through Cloudflare Email Service. Errors stay generic so tokens and response bodies are not logged. */
export async function sendHandoffMail(message: OutboundMail): Promise<void> {
  const binding = emailBinding();
  if (binding) {
    await binding.send(outbound(message, "email"));
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
      body: JSON.stringify(outbound(message, "address")),
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
