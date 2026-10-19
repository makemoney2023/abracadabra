const COMMIT = /\b(we guarantee|guarantee a|signed contract|binding agreement|we'll start|we’ll start|we will start)\b/i;
const JARGON = /\b(leverage|synergy|utilize|paradigm|holistic|robust|seamless|cutting-edge|unlock|empower)\b/i;

const SAFE = "I can help you think it through. A person reviews anything we send after this chat.";
const PLAIN = "We build tools that fit the work you already do. Tell me the job that takes the most time.";
const EMPTY = "Tell me the job that takes the most time. I will keep the answer short.";

export function originAllowed(origin, extra = []) {
  if (!origin || typeof origin !== "string") return false;
  if (extra.includes(origin)) return true;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const host = url.hostname;
  if (host === "abra-ca-dabra.app" || host === "www.abra-ca-dabra.app") return url.protocol === "https:";
  if (host === "localhost" || host === "127.0.0.1") return url.protocol === "http:" || url.protocol === "https:";
  return false;
}

export function localOrigin(origin) {
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

export function extraOrigins(env) {
  return String(env?.CHAT_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function postCheck(text) {
  const flags = [];
  let clean = String(text || "").replace(/\s+/g, " ").trim();
  if (COMMIT.test(clean)) {
    flags.push("commitment");
    clean = SAFE;
  } else {
    if (/\$\s?\d|\bwe charge\b|\bprice is\b|\bpriced at\b/i.test(clean)) {
      flags.push("price");
      clean = PLAIN;
    }
    clean = clean.replace(/https?:\/\/[^\s)]+/gi, (url) => {
      const trimmed = url.replace(/[.,;:]+$/, "");
      const allowed = /^https:\/\/(?:[a-z0-9-]+\.)*abra-ca-dabra\.app(?:[/?#]|$)|^https:\/\/(?:www\.)?cal\.com(?:[/?#]|$)|^https:\/\/(?:www\.)?cal\.eu(?:[/?#]|$)|^https:\/\/app\.cal\.com(?:[/?#]|$)/i;
      if (allowed.test(trimmed)) return trimmed;
      flags.push("url");
      return "";
    }).replace(/\s+/g, " ").trim();
    if (JARGON.test(clean)) {
      flags.push("jargon");
      clean = PLAIN;
    }
  }
  const parts = clean.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 3) flags.push("length");
  clean = parts.slice(0, 3).join(" ");
  if (!clean) clean = EMPTY;
  return { text: clean, flags };
}

export function uiActionFor(userText) {
  const text = String(userText || "").toLowerCase();
  if (/\b(book|booking|calendar|call|meet|meeting|schedule|pricing|price|engagement|talk)\b/.test(text)) {
    return "offer_booking";
  }
  if (/\b(ready|readiness|audit|checklist|assessment)\b/.test(text) || text.includes("where to start") || text.includes("not sure")) {
    return "offer_readiness_check";
  }
  if (/\b(e-?mail|follow-up|follow up|write me|contact)\b/.test(text)) return "request_contact";
  return null;
}

export function localReply(userText) {
  const action = uiActionFor(userText);
  if (action === "offer_booking") {
    return "A thirty-minute working session is the fastest way to look at one job. You can pick a time in this chat.";
  }
  if (action === "offer_readiness_check") {
    return "The AI Readiness Check takes about three minutes. It scores the work, then you leave with a plan.";
  }
  if (action === "request_contact") {
    return "Leave your name and email here. A person reads it before anyone writes back.";
  }
  return "We build software around the work you already do. What job takes the most time each week?";
}

export function rateGate(hits, now, limit, windowMs) {
  const recent = (hits || []).filter((at) => now - at < windowMs);
  if (recent.length >= limit) return { ok: false, hits: recent };
  recent.push(now);
  return { ok: true, hits: recent };
}

export function clientIp(request) {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "local";
}

export async function verifyTurnstile({ secret, token, ip, fetchImpl, allowMissingSecret }) {
  if (!secret) return allowMissingSecret ? { ok: true, skipped: true } : { ok: false, reason: "unconfigured" };
  if (!token) return { ok: false, reason: "missing" };
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  const response = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });
  if (!response.ok) return { ok: false, reason: "upstream" };
  const json = await response.json();
  return json?.success === true ? { ok: true } : { ok: false, reason: "rejected" };
}
