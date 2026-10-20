import { SITE_PATHS } from "./site-knowledge.js";

const COMMIT = /\b(we guarantee|guarantee a|signed contract|binding agreement|we'll start|we’ll start|we will start)\b/i;
const JARGON = /\b(leverage|synergy|utilize|paradigm|holistic|robust|seamless|cutting-edge|unlock|empower)\b/i;

// Names on the site that contain a filtered word. They are allowed; the word is not.
const PROPER_NAMES = /\bLLM[\s-]Leverage\b/gi;
// Our clients by name. A reply may say what we built for them, never that they are like the visitor.
const CLIENTS = /\b(StrongFoam|pirx(?:\.ca)?|Milrcorr|Renew Implants|SuperPatch)\b/i;
const LIKE_YOU = /\b(?:similar|the same|comparable)\s+(?:\w+\s+)?(?:fleet|size|setup|set-up|business|team|company|industry|trade|situation|needs?|problems?|challenges?|workflow|process|vans|vehicles|customers)\b|\b(?:businesses|companies|clients|firms|shops|people) like (?:yours|you|StrongFoam|pirx|Milrcorr|Renew Implants|SuperPatch)\b|\b(?:just )?like (?:yours|you do)\b/i;
// Asking for contact details, which is wrong once the booking calendar is open.
const CONTACT_ASK = /\b(name and (?:e-?mail|email address)|your (?:e-?mail|email address|phone|phone number|contact (?:details|info\w*))|leave (?:a|your) (?:name|e-?mail|details)|contact (?:details|information))\b/i;
export const CALENDAR_OPEN = "The booking calendar is open right here in the chat. Pick a thirty-minute time that works for you.";
// Things the model has said that are false for this studio.
const FALSE_CLAIM = /\b(?:(?:no|don't have any|do not have any|haven't got any)\s+(?:portfolio|examples?|case stud(?:y|ies)|past work|projects to show)|(?:don't|do not) charge|(?:it's|it is|services are|is) free\b|no cost)/i;
const GROUNDED = "We have real, public work: the StrongFoam CRM and website, pirx.ca, and the Super Funnel sales app. You can see them on the Work page.";
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
    // Page links and our own names ("LLM Leverage", /course/llm-leverage/) are not jargon.
    if (JARGON.test(clean.replace(/https?:\/\/\S+/g, "").replace(PROPER_NAMES, ""))) {
      flags.push("jargon");
      clean = PLAIN;
    }
  }
  // Keep the first four sentences. The answer comes first; a closing offer is not protected.
  const parts = clean
    .replace(ABBREV, (match) => match.replace(/\./g, "\u2024"))
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.replace(/\u2024/g, ".").trim())
    .filter(Boolean);
  // A sentence that says a client is like the visitor ("StrongFoam has a similar fleet") is dropped.
  const kept = parts.filter((part) => !(CLIENTS.test(part) && LIKE_YOU.test(part)));
  if (kept.length < parts.length) flags.push("client_claim");
  if (kept.length > MAX_SENTENCES) flags.push("length");
  clean = kept.slice(0, MAX_SENTENCES).join(" ");
  if (!clean && flags.includes("client_claim")) return { text: "", flags };
  if (!clean) clean = EMPTY;
  return { text: clean, flags };
}

/**
 * A clear ask to book (not just a mention of price or a call): the chat opens the calendar itself.
 * "book a call", "can we schedule a meeting", "I want to talk to someone", "open the calendar".
 */
export function wantsBooking(userText) {
  const text = String(userText || "").toLowerCase();
  if (/\b(don'?t|do not|not ready|no need|later)\b/.test(text)) return false;
  return (
    /\b(book|booking|schedule|set up|arrange|grab|reserve)\b[^.?!]{0,30}\b(call|meeting|session|time|slot|chat|appointment|consult\w*)\b/.test(text) ||
    /\b(open|show)\b[^.?!]{0,20}\b(calendar|booking)\b/.test(text) ||
    /\b(talk|speak) (to|with) (a person|someone|somebody|a human|chris\w*|the team|you guys)\b/.test(text) ||
    /\b(can|could) we (meet|hop on a call|get on a call)\b/.test(text) ||
    /^\s*(book( it| one)?|yes,? book( it)?|let'?s book( it)?)[.!]?\s*$/.test(text)
  );
}

// A sentence that pitches the working session or the Readiness Check. Plain uses of "book"
// ("a visitor can start an estimate and book") are not offers.
export const OFFER_PITCH = /\b(working session|readiness check|book (?:a |an |the |your |some )?(?:thirty|30|time|call|session|slot|meeting|working)|book (?:it|one)\b|book(?:ed)? right here|booking (?:calendar|form|link)|pick a (?:thirty-minute |30-minute )?time|schedule a (?:call|session|time|meeting))/i;

export function hasOffer(text) {
  return OFFER_PITCH.test(String(text || ""));
}

/**
 * The visitor is asking for a next step: to book, about cost or timing, how to get started,
 * where to start, or to talk to a person. Then an offer is welcome.
 */
export function asksNextStep(userText) {
  const text = String(userText || "").toLowerCase();
  if (wantsBooking(text)) return true;
  const action = uiActionFor(text);
  if (action === "open_booking" || action === "offer_booking" || action === "offer_readiness_check") return true;
  return /\b(cost|costs|price|prices|pricing|how much|budget|quote|afford|rates?|timeline|how long|how soon|when can|get started|getting started|start|begin|next steps?|sign up|hire you|work with you|working session|person|human|someone)\b/.test(text);
}

/**
 * What the chat has offered so far, from the saved replies (typed and voice alike).
 * repliesSince: 1 means the last reply had an offer. recent: one of the last two replies did.
 */
export function offerState(session, userText) {
  const replies = (session?.messages || []).filter((message) => message.role === "assistant");
  let repliesSince = null;
  for (let i = replies.length - 1; i >= 0; i -= 1) {
    if (hasOffer(replies[i].text)) {
      repliesSince = replies.length - i;
      break;
    }
  }
  const asked = asksNextStep(userText);
  // Unsure where to begin: the Readiness Check comes first, then the working session.
  const start = asked && (uiActionFor(userText) === "offer_readiness_check" || /\b(where (?:should|do|can|would) (?:we|i) (?:start|begin)|where to (?:start|begin)|not sure|unsure|don'?t know where)\b/i.test(String(userText || "")));
  const recent = repliesSince !== null && repliesSince <= 2;
  return {
    offered: repliesSince !== null || Boolean(session?.bookingOffered),
    repliesSince,
    recent,
    asked,
    start,
    // The server drops an offer sentence when one went out in the last two replies and nobody asked.
    dropOffers: recent && !asked,
  };
}

export function uiActionFor(userText) {
  if (wantsBooking(userText)) return "open_booking";
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
  if (action === "offer_booking" || action === "open_booking") {
    return "A thirty-minute working session is the fastest way to look at one job. You can pick a time in this chat.";
  }
  if (action === "offer_readiness_check") {
    return "The Readiness Check takes five to seven minutes, and you can take it right here in this chat. It shows where the work slows down.";
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
export async function* checkedSentences(deltas, { maxSentences = MAX_SENTENCES, firstClause = false, dropOffers = false, calendarOpen = false } = {}) {
  let buffer = "";
  let count = 0;
  // dropOffers: hold back booking or Readiness Check sentences. One is used only if the
  // reply would otherwise be empty.
  let held = null;
  // calendarOpen: the booking calendar just opened, so a sentence asking for a name, email or
  // phone is dropped. dropped: something was taken out, so the reply must not end up empty.
  let dropped = false;
  // After a dropped client claim, a sentence that leans on it ("We also built…", "Their…") goes too.
  let orphan = false;
  const judge = (sentence) => {
    const out = postCheck(sentence);
    if (out.flags.includes("client_claim") && !out.text) {
      dropped = true;
      orphan = true;
      return null;
    }
    const leans = orphan && /^(?:we also|also|they|their|them|it also|this also)\b|\b(?:their|its) sister\b/i.test(out.text || "");
    const after = orphan;
    orphan = false;
    if (leans) return null;
    // "Our service can also help" reads wrong once the sentence before it is gone.
    if (after && out.text) out.text = out.text.replace(/\b(can|could|will|would|may)\s+also\b/i, "$1");
    if (calendarOpen && out.text && CONTACT_ASK.test(out.text) && !out.flags.some((flag) => REPLACING.has(flag))) {
      dropped = true;
      return null;
    }
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
      if (dropOffers && part.text && hasOffer(part.text)) {
        held ||= { ...part, flags: [...part.flags, "repeat_offer"] };
        continue;
      }
      yield part;
      count += 1;
      if (part.replace || count >= maxSentences) return;
    }
  }
  const tail = buffer.replace(/\s+/g, " ").trim();
  const last = tail ? judge(tail) : null;
  if (last && dropOffers && last.text && hasOffer(last.text)) {
    held ||= { ...last, flags: [...last.flags, "repeat_offer"] };
  } else if (last) {
    yield last;
    count += 1;
  }
  if (!count && held) yield held;
  else if (!count && dropped) yield { text: calendarOpen ? CALENDAR_OPEN : EMPTY, flags: ["dropped"] };
}
