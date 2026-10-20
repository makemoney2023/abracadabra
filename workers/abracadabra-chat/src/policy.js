import { SITE_PATHS } from "./site-knowledge.js";

const COMMIT = /\b(we guarantee|guarantee a|signed contract|binding agreement|we'll start|we’ll start|we will start)\b/i;
const JARGON = /\b(leverage|synergy|utilize|paradigm|holistic|robust|seamless|cutting-edge|unlock|empower)\b/i;

// Names on the site that contain a filtered word. They are allowed; the word is not.
const PROPER_NAMES = /\bLLM Leverage\b/gi;
// Things the model has said that are false for this studio.
const FALSE_CLAIM = /\b(?:(?:no|don't have any|do not have any|haven't got any)\s+(?:portfolio|examples?|case stud(?:y|ies)|past work|projects to show)|(?:don't|do not) charge|(?:it's|it is|services are|is) free\b|no cost)/i;
const GROUNDED = "We have real, public work: the StrongFoam CRM and website, pirx.ca, and the Super Funnel sales app. You can see them on the Work page, or book a thirty-minute working session right here in this chat.";
const OFFER = /\b(book|working session|readiness check|in this chat|leave (?:a|your) name)\b/i;
const ABBREV = /\b(e\.g|i\.e|etc|vs|approx)\.(?=\s)/gi;

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

export const MAX_SENTENCES = 4;

// Links on our own domain must be real pages. The booking and Readiness Check hosts pass as they are.
export function sitePageKnown(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.hostname !== "abra-ca-dabra.app" && parsed.hostname !== "www.abra-ca-dabra.app") return true;
  let path = parsed.pathname || "/";
  if (path.endsWith("/index.html")) path = path.slice(0, -10);
  return SITE_PATHS.includes(path) || SITE_PATHS.includes(`${path}/`) || /^\/blog\/[a-z0-9-]+\/?$/.test(path);
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
      const trimmed = url.replace(/[.,;:!?]+$/, "");
      const tail = url.slice(trimmed.length);
      const allowed = /^https:\/\/(?:[a-z0-9-]+\.)*abra-ca-dabra\.app(?:[/?#]|$)|^https:\/\/(?:www\.)?cal\.com(?:[/?#]|$)|^https:\/\/(?:www\.)?cal\.eu(?:[/?#]|$)|^https:\/\/app\.cal\.com(?:[/?#]|$)/i;
      if (allowed.test(trimmed) && sitePageKnown(trimmed)) return trimmed + tail;
      if (allowed.test(trimmed)) {
        flags.push("unknown_page");
        return `https://abra-ca-dabra.app/${tail}`;
      }
      flags.push("url");
      return tail;
    }).replace(/\s+/g, " ").trim();
    // A bare page path the model copied from the facts becomes a full link (typed) and is dropped when spoken.
    clean = clean
      .replace(/\s*\((\/[a-z0-9./-]*)\)/gi, (match, path) => (SITE_PATHS.includes(path) ? ` https://abra-ca-dabra.app${path}` : ""))
      .replace(/(^|\s)(\/[a-z0-9-]+\/(?:[a-z0-9-]+\/)?)(?=[\s.,;:!?]|$)/gi, (match, lead, path) => (SITE_PATHS.includes(path) ? `${lead}https://abra-ca-dabra.app${path}` : match))
      .replace(/\b(SERVICES|WORK|PROCESS|SITE FACTS|WHY CLOUDFLARE|NEXT STEPS)\b/g, (word) => word.toLowerCase());
    if (FALSE_CLAIM.test(clean)) {
      flags.push("false_claim");
      clean = GROUNDED;
    }
    if (JARGON.test(clean.replace(PROPER_NAMES, ""))) {
      flags.push("jargon");
      clean = PLAIN;
    }
  }
  // Keep up to four sentences. If it runs longer, keep the first three and the closing offer,
  // so the booking or Readiness Check sentence is never the one that gets cut.
  const parts = clean
    .replace(ABBREV, (match) => match.replace(/\./g, "\u2024"))
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.replace(/\u2024/g, ".").trim())
    .filter(Boolean);
  if (parts.length > MAX_SENTENCES) {
    flags.push("length");
    const offerAt = parts.findLastIndex((part, index) => index >= MAX_SENTENCES - 1 && OFFER.test(part));
    clean = offerAt >= 0
      ? [...parts.slice(0, MAX_SENTENCES - 1), parts[offerAt]].join(" ")
      : parts.slice(0, MAX_SENTENCES).join(" ");
  } else {
    clean = parts.join(" ");
  }
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
    return "The Readiness Check takes a few minutes. It shows where the work slows down, then you can book a thirty-minute working session.";
  }
  if (action === "request_contact") {
    return "Leave your name and email here. A person reads it before anyone writes back.";
  }
  return "We build custom software and AI tools around the work you already do. You can see real projects on the Work page. What job takes the most time each week?";
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

// Flags that mean the reply as a whole must be replaced, not just trimmed.
const REPLACING = new Set(["commitment", "price", "jargon", "false_claim"]);
const BOUNDARY = /[.!?](?=\s)/g;

const CLAUSE = /[,;:](?=\s)|\s[-–—](?=\s)/g;

function nextSentence(buffer, clause = false) {
  const guarded = buffer.replace(ABBREV, (match) => match.replace(/\./g, "\u2024"));
  BOUNDARY.lastIndex = 0;
  const hit = BOUNDARY.exec(guarded);
  // A link the model did not close with a period still ends the sentence when a new one starts.
  const link = /https?:\/\/[^\s]+(?=\s+[A-Z])/.exec(guarded);
  const end = [hit ? hit.index + 1 : -1, link ? link.index + link[0].length : -1].filter((at) => at > 0);
  if (clause) {
    // Voice: the first piece may end at a comma once it is long enough to say on its own,
    // so Aura can start sooner. Each piece is still checked before it is spoken.
    CLAUSE.lastIndex = 0;
    let comma;
    while ((comma = CLAUSE.exec(guarded))) {
      if (comma.index >= 30) {
        end.push(comma.index + 1);
        break;
      }
    }
  }
  if (!end.length) return null;
  const at = Math.min(...end);
  let sentence = buffer.slice(0, at).trim();
  if (!/[.!?,;:]$/.test(sentence)) sentence += ".";
  return { sentence, rest: buffer.slice(at) };
}

/**
 * Checks a streamed reply one sentence at a time, so the first sentence can be shown or spoken
 * while the model is still writing. Yields { text } for each sentence that passes, or one
 * { replace } when a sentence trips a rule that replaces the whole answer (then stops).
 * Stops after maxSentences.
 */
export async function* checkedSentences(deltas, { maxSentences = MAX_SENTENCES, firstClause = false } = {}) {
  let buffer = "";
  let count = 0;
  const judge = (sentence) => {
    const out = postCheck(sentence);
    // A sentence that is only a link says nothing; skip it.
    if (!out.text.replace(/https?:\/\/\S+/g, "").replace(/[\s.,;:!?]/g, "")) return null;
    if (out.flags.some((flag) => REPLACING.has(flag))) return { replace: out.text, flags: out.flags };
    return { text: out.text, flags: out.flags };
  };
  for await (const delta of deltas) {
    buffer += delta;
    let next;
    while ((next = nextSentence(buffer, firstClause && count === 0))) {
      buffer = next.rest;
      if (!next.sentence) continue;
      const part = judge(next.sentence);
      if (!part) continue;
      yield part;
      count += 1;
      if (part.replace || count >= maxSentences) return;
    }
  }
  const tail = buffer.replace(/\s+/g, " ").trim();
  const last = tail ? judge(tail) : null;
  if (last) yield last;
}
