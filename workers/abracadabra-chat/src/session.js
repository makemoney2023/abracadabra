export const TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const IDLE_MS = 15 * 60 * 1000;
export const MESSAGE_CAP = 40;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function blankSession({ id, now, ip, page }) {
  return {
    id,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + TTL_MS,
    alarmAt: now + IDLE_MS,
    ip,
    page: String(page || "").slice(0, 300),
    messages: [],
    contact: null,
    bookingOffered: false,
    bookingOpened: false,
    bookingCompleted: null,
    readinessClicked: false,
    handoffSent: false,
    handoff: null,
    messageCount: 0,
  };
}

export function isExpired(session, now) {
  return !session || typeof session.expiresAt !== "number" || now > session.expiresAt;
}

export function parseContact(body) {
  if (!body || typeof body !== "object") return { ok: false, field: "form", message: "We could not read that." };
  if (body.consent !== true) return { ok: false, field: "consent", message: "Tick the box so a person can write back." };
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const goal = String(body.goal || "").trim();
  const windows = String(body.windows || "").trim();
  if (!name || name.length > 120) return { ok: false, field: "name", message: "Add your name." };
  if (!EMAIL.test(email) || email.length > 200) return { ok: false, field: "email", message: "Add a real email address." };
  if (goal.length > 1000) return { ok: false, field: "goal", message: "Keep the note shorter." };
  if (windows.length > 300) return { ok: false, field: "windows", message: "Keep the times shorter." };
  return { ok: true, value: { name, email, goal, windows } };
}

function cleanEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return EMAIL.test(email) ? email : null;
}

function cleanName(value) {
  const name = String(value || "").trim();
  return name ? name.slice(0, 120) : null;
}

export function applyChatEvent(session, body, now) {
  const kind = body?.kind;
  if (kind === "booking_offered") {
    session.bookingOffered = true;
  } else if (kind === "booking_opened") {
    session.bookingOffered = true;
    session.bookingOpened = true;
  } else if (kind === "readiness_check_clicked") {
    session.readinessClicked = true;
  } else if (kind === "booking_completed") {
    const externalId = String(body.externalId || "").trim().slice(0, 120);
    const starts = Date.parse(String(body.startsAt || ""));
    if (!externalId || !Number.isFinite(starts)) return { ok: false, message: "Check the booking." };
    const ends = body.endsAt ? Date.parse(String(body.endsAt)) : NaN;
    session.bookingOffered = true;
    session.bookingOpened = true;
    session.bookingCompleted = {
      externalId,
      startsAt: new Date(starts).toISOString(),
      endsAt: Number.isFinite(ends) ? new Date(ends).toISOString() : null,
      email: cleanEmail(body.email),
      name: cleanName(body.name),
    };
  } else {
    return { ok: false, message: "Unknown event." };
  }
  session.updatedAt = now;
  session.alarmAt = now + IDLE_MS;
  return { ok: true };
}

export function rememberExchange(session, userText, assistantText, now) {
  session.messages.push({ role: "user", text: userText, at: now });
  session.messages.push({ role: "assistant", text: assistantText, at: now });
  if (session.messages.length > MESSAGE_CAP) {
    session.messages.splice(0, session.messages.length - MESSAGE_CAP);
  }
  session.messageCount += 1;
  session.updatedAt = now;
  session.alarmAt = now + IDLE_MS;
}
