export const HANDOFF_TO = "houdini@abra-ca-dabra.app";
export const HANDOFF_FROM = "Abracadabra Chat <chat@abra-ca-dabra.app>";

export function handoffEnvelope(session, now) {
  return {
    schema: "abra.chat.handoff",
    version: "1.0",
    session_id: session.id,
    contact: session.contact,
    transcript: session.messages.map(({ role, text, at }) => ({ role, text, at })),
    booking: {
      offered: Boolean(session.bookingOffered),
      opened: Boolean(session.bookingOpened),
      completed: session.bookingCompleted,
    },
    readiness_clicked: Boolean(session.readinessClicked),
    page: session.page || null,
    sent_at: new Date(now).toISOString(),
  };
}

export function handoffSummary(envelope) {
  const contact = envelope.contact;
  const lines = [
    "Chat handoff. A person reviews this before anyone writes back.",
    contact ? `${contact.name} <${contact.email}>` : "No contact card yet.",
    contact?.goal ? `Goal: ${contact.goal}` : "",
    contact?.windows ? `Times: ${contact.windows}` : "",
    envelope.page ? `Page: ${envelope.page}` : "",
    `Booking offered: ${envelope.booking.offered ? "yes" : "no"}`,
    `Booking opened: ${envelope.booking.opened ? "yes" : "no"}`,
    envelope.booking.completed
      ? `Booked: ${envelope.booking.completed.startsAt} (${envelope.booking.completed.externalId})`
      : "Booked: no",
    "Transcript:",
    ...envelope.transcript.map((message) => `${message.role}: ${message.text}`),
  ];
  return lines.filter((line) => line !== "").join("\n");
}

export async function signHex(secret, body) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function mimeText({ from, to, subject, text, signature }) {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
  ];
  if (signature) headers.push(`X-Intake-Signature: ${signature}`);
  return `${headers.join("\r\n")}\r\n\r\n${text}`;
}

export function studioInbox(env) {
  const inbox = String(env?.CHAT_HANDOFF_TO || HANDOFF_TO).trim();
  if (!inbox.includes("houdini@abra-ca-dabra.app")) return HANDOFF_TO;
  return inbox;
}

export async function deliverHandoff(env, deps, message) {
  if (message.to !== studioInbox(env)) {
    throw new Error("Chat handoff mail must go to the studio inbox.");
  }
  if (typeof deps.sendHandoff === "function") {
    await deps.sendHandoff(message);
    return true;
  }
  if (env.EMAIL && typeof env.EMAIL.send === "function") {
    const { EmailMessage } = await import("cloudflare:email");
    await env.EMAIL.send(new EmailMessage(message.from, message.to, mimeText(message)));
    return true;
  }
  return false;
}

export function mailerConfigured(env, deps) {
  return typeof deps.sendHandoff === "function" || Boolean(env.EMAIL && typeof env.EMAIL.send === "function");
}
