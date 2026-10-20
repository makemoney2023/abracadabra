// Chat leads into HQ. A visitor who leaves a name and email (with consent) becomes a lead on the
// HQ board through the same signed intake the /start/ form uses: POST /api/intake/project-inquiry.
// HQ opens or reuses a deal, logs a project_inquiry activity and queues the reply (reply_needed),
// and the inbound routine hands it to Sales Outbound. This worker never emails the visitor.
//
// Signing (same as scrollcraft/builds/abracadabra-ai/worker/intake.js):
//   x-intake-signature = hex HMAC-SHA256 of the raw body with PROJECT_INQUIRY_SIGNING_SECRET
//   x-intake-timestamp = unix ms.  202 = queued.  external_id dedupes retries on HQ.
import { signHex } from "./handoff.js";

export const HQ_PATH = "/api/intake/project-inquiry";
const MESSAGE_MAX = 3800;

export function hqConfigured(env) {
  return Boolean(String(env?.HANDOFF_INTAKE_ORIGIN || "").trim() && String(env?.PROJECT_INQUIRY_SIGNING_SECRET || "").trim());
}

function transcriptTail(messages, budget) {
  const lines = [];
  let used = 0;
  for (const message of [...(messages || [])].reverse()) {
    const line = `${message.role === "user" ? "Visitor" : "Chat"}${message.voice ? " (voice)" : ""}: ${String(message.text || "").replace(/\s+/g, " ").trim()}`;
    if (used + line.length + 1 > budget) break;
    lines.unshift(line);
    used += line.length + 1;
  }
  return lines;
}

export function leadMessage(session, recap) {
  const contact = session.contact || {};
  const head = [
    "From the website chat on abra-ca-dabra.app. The visitor ticked consent for a person to write back.",
    contact.goal ? `What they need: ${contact.goal}` : "",
    contact.windows ? `Times that work: ${contact.windows}` : "",
    session.bookingCompleted ? `Booked: ${session.bookingCompleted.startsAt}` : session.bookingOpened ? "Opened the booking, not booked yet." : "",
    session.readinessClicked ? "Opened the Readiness Check." : "",
    recap ? `Recap: ${recap}` : "",
  ].filter(Boolean);
  const used = head.join("\n").length + 20;
  const tail = transcriptTail(session.messages, Math.max(0, MESSAGE_MAX - used));
  return [...head, ...(tail.length ? ["Transcript (latest last):", ...tail] : [])].join("\n").slice(0, MESSAGE_MAX);
}

export function hqLeadBody(session, now, recap = "") {
  const contact = session.contact || {};
  return {
    external_id: `chat_${session.id}`,
    name: contact.name || null,
    email: contact.email,
    company: null,
    need: "Website chat",
    budget: null,
    timeline: null,
    message: leadMessage(session, recap),
    page: session.page || null,
    submitted_at: new Date(now).toISOString(),
  };
}

/** Posts the consented chat lead to HQ once. Returns { posted, reason }. Never throws. */
export async function postLeadToHq(session, env, { now, fetchImpl = fetch, recap = "" } = {}) {
  if (!session?.contact?.email) return { posted: false, reason: "no_contact" };
  if (session.hqLeadSent) return { posted: false, reason: "already_sent" };
  if (!hqConfigured(env)) return { posted: false, reason: "unconfigured" };
  const origin = String(env.HANDOFF_INTAKE_ORIGIN).trim().replace(/\/$/, "");
  const body = JSON.stringify(hqLeadBody(session, now, recap));
  try {
    const response = await fetchImpl(`${origin}${HQ_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intake-signature": await signHex(String(env.PROJECT_INQUIRY_SIGNING_SECRET).trim(), body),
        "x-intake-timestamp": String(now),
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (response.status !== 202) {
      console.error(`chat hq lead: HQ answered ${response.status}`);
      return { posted: false, reason: `status_${response.status}` };
    }
    session.hqLeadSent = true;
    session.hqLeadAt = now;
    return { posted: true, reason: "ok" };
  } catch (error) {
    console.error(`chat hq lead: ${error instanceof Error ? error.name : "failed"}`);
    return { posted: false, reason: "network" };
  }
}
