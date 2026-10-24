import { SITE_PATHS, SITE_PRODUCTS, SITE_WORK } from "./site-knowledge.js";
import { pickVariant, repeatsRecent } from "./conversation.js";

const COMMIT = /\b(we guarantee|guarantee a|signed contract|binding agreement|we'll start|we’ll start|we will start)\b/i;
const JARGON = /\b(leverage|synergy|utilize|paradigm|holistic|robust|seamless|cutting-edge|unlock|empower)\b/i;

// Names on the site that contain a filtered word. They are allowed; the word is not.
const PROPER_NAMES = /\bLLM[\s-]Leverage\b/gi;
// Our clients by name. A reply may say what we built for them, never that they are like the visitor.
const CLIENTS = /\b(StrongFoam|pirx(?:\.ca)?|Milrcorr|Renew Implants|SuperPatch)\b/i;
const LIKE_YOU = /\b(?:similar|the same|comparable)\s+(?:\w+\s+)?(?:fleet|size|setup|set-up|business|team|company|industry|trade|situation|needs?|problems?|challenges?|workflow|process|vans|vehicles|customers)\b|\b(?:businesses|companies|clients|firms|shops|people) like (?:yours|you|StrongFoam|pirx|Milrcorr|Renew Implants|SuperPatch)\b|\b(?:just )?like (?:yours|you do)\b|\bsimilar (?:custom )?(?:projects?|apps?|work|solutions?|systems?)\b|\b(?:worked with|helped|built for) (?:\w+ ){0,3}(?:companies|businesses|clients|firms|shops)\b[^.!?]{0,20}\blike\b/i;
// Asking for contact details, which is wrong once the booking calendar is open.
const CONTACT_ASK = /\b(name and (?:e-?mail|email address)|your (?:e-?mail|email address|phone|phone number|contact (?:details|info\w*))|leave (?:a|your) (?:name|e-?mail|details)|contact (?:details|information))\b/i;
// Fixed lines come in a few wordings, so the same sentence does not land twice in one chat.
// pickVariant() rotates them by seed and skips one the chat said recently. The first is the default.
export const CALENDAR_OPEN_LINES = [
  "The booking calendar is open right here in the chat. Pick a thirty-minute time that works for you.",
  "The calendar is open just below. Pick any thirty-minute slot that suits you.",
  "I've opened the calendar here in the chat. Choose a thirty-minute time that works for you.",
];
export const CALENDAR_OPEN = CALENDAR_OPEN_LINES[0];
// Used when the visitor asked for a next step but the model's offer copies an earlier one word for word.
export const OFFER_LINES = [
  "You can book a thirty-minute working session right here in this chat.",
  "If it helps, pick a thirty-minute time with our team right here in the chat.",
  "A thirty-minute working session with our team is the quickest next step, and you can book it here.",
];
// Things the model has said that are false for this studio.
const FALSE_CLAIM = /\b(?:(?:no|don't have any|do not have any|haven't got any)\s+(?:portfolio|examples?|case stud(?:y|ies)|past work|projects to show)|(?:don't|do not) charge|(?:it's|it is|services are|is) free\b|no cost)/i;
// The cost half of FALSE_CLAIM. Nothing on the site is called free, the Readiness Check included.
const FREE_CLAIM = /\b(?:(?:don't|do not) charge|(?:it's|it is|services are|is) free\b|no cost|free of charge|for free)\b/i;
export const COST_LINES = [
  "We price each project to the job and quote it after we understand the work. The Readiness Check takes five to seven minutes, and you can take it right here in this chat.",
  "Every project is priced to the job, and the quote comes once we understand the work. If you want a starting point, the Readiness Check takes five to seven minutes right here in this chat.",
  "There is no set price list: we quote each job after we understand the work. An easy first step is the Readiness Check, five to seven minutes right here in this chat.",
];
const GROUNDED = "We have real, public work: the StrongFoam CRM and website, pirx.ca, and the Super Funnel System. You can see them on the Case studies page.";
const ABBREV = /\b(e\.g|i\.e|etc|vs|approx)\.(?=\s)/gi;

export const SAFE_LINES = [
  "I can help you think it through. A person reviews anything we send after this chat.",
  "Happy to help you think it through. Anything we send after this chat is reviewed by a person first.",
];
export const PLAIN_LINES = [
  "We build tools that fit the work you already do. Tell me the job that takes the most time.",
  "We build software around the way you already work. Which job takes the most time each week?",
  "Our work is custom tools that fit your day as it is. What would you take off your plate first?",
];
export const EMPTY_LINES = [
  "Tell me the job that takes the most time. I will keep the answer short.",
  "What is the one job that eats most of your week? I'll keep it short.",
  "Tell me a bit about the work that slows you down, and I'll point you to what fits.",
];
// Filler praise that makes every answer sound the same. Taken off the front of a sentence.
const PRAISE = /^(?:(?:that's|that is|what|such) an? )?(?:(?:really|very) )?(?:good|great|excellent|fantastic|awesome|wonderful|smart|interesting) question\b[,.!:;\s-]*|^(?:i love (?:that|this) question|thanks for (?:asking|the question))\b[,.!:;\s-]*/i;

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
const SUBDOMAINS = new Set(["check.abra-ca-dabra.app", "schema.abra-ca-dabra.app", "learn.abra-ca-dabra.app", "hq.abra-ca-dabra.app"]);

export function sitePageKnown(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.hostname !== "abra-ca-dabra.app" && parsed.hostname !== "www.abra-ca-dabra.app") {
    // Our real subdomains pass; an invented one ("blog.abra-ca-dabra.app") does not.
    return !/(?:^|\.)abra-ca-dabra\.app$/i.test(parsed.hostname) || SUBDOMAINS.has(parsed.hostname.toLowerCase());
  }
  let path = parsed.pathname || "/";
  if (path.endsWith("/index.html")) path = path.slice(0, -10);
  return SITE_PATHS.includes(path) || SITE_PATHS.includes(`${path}/`) || /^\/blog\/[a-z0-9-]+\/?$/.test(path);
}

export function postCheck(text, { seed = 0, recent = [] } = {}) {
  const flags = [];
  let clean = String(text || "").replace(/\s+/g, " ").trim();
  const line = (variants) => pickVariant(variants, { seed, recent });
  if (PRAISE.test(clean)) {
    flags.push("praise");
    clean = clean.replace(PRAISE, "").trim();
    clean = clean.replace(/^[a-z]/, (letter) => letter.toUpperCase());
    if (!clean) return { text: "", flags };
  }
  if (COMMIT.test(clean)) {
    flags.push("commitment");
    clean = line(SAFE_LINES);
  } else {
    if (/\$\s?\d|\bwe charge\b|\bprice is\b|\bpriced at\b/i.test(clean)) {
      flags.push("price");
      clean = line(PLAIN_LINES);
    }
    clean = clean.replace(/https?:\/\/[^\s)]+/gi, (url) => {
      const trimmed = url.replace(/[.,;:!?]+$/, "");
      const tail = url.slice(trimmed.length);
      const allowed = /^https:\/\/(?:[a-z0-9-]+\.)*abra-ca-dabra\.app(?:[/?#]|$)|^https:\/\/(?:www\.)?cal\.com(?:[/?#]|$)|^https:\/\/(?:www\.)?cal\.eu(?:[/?#]|$)|^https:\/\/app\.cal\.com(?:[/?#]|$)/i;
      if (allowed.test(trimmed) && sitePageKnown(trimmed)) return trimmed + tail;
      if (allowed.test(trimmed)) {
        flags.push("unknown_page");
        // A real page on an invented subdomain goes back to the apex.
        let path = "";
        try { path = new URL(trimmed).pathname; } catch { /* not a URL */ }
        if (path && path !== "/" && sitePageKnown(`https://abra-ca-dabra.app${path}`)) return `https://abra-ca-dabra.app${path}${tail}`;
        return `https://abra-ca-dabra.app/${tail}`;
      }
      flags.push("url");
      return tail;
    }).replace(/\s+/g, " ").trim();
    // A bare page path the model copied from the facts becomes a full link (typed) and is dropped when spoken.
    clean = clean
      .replace(/\s*\((\/[a-z0-9./-]*)\)/gi, (match, path) => (SITE_PATHS.includes(path) ? ` https://abra-ca-dabra.app${path}` : ""))
      .replace(/(^|\s)(\/[a-z0-9-]+\/(?:[a-z0-9-]+\/)?)(?=[\s.,;:!?]|$)/gi, (match, lead, path) => (SITE_PATHS.includes(path) ? `${lead}https://abra-ca-dabra.app${path}` : match))
      .replace(/\b(SERVICES|WORK|PRODUCTS|NOTES|OTHER PAGES|PROCESS|SITE FACTS|WHY CLOUDFLARE|NEXT STEPS)\b/g, (word) => word.toLowerCase());
    if (FREE_CLAIM.test(clean)) {
      flags.push("false_claim");
      clean = line(COST_LINES);
    } else if (FALSE_CLAIM.test(clean)) {
      flags.push("false_claim");
      clean = GROUNDED;
    }
    // Page links and our own names ("LLM Leverage", /course/llm-leverage/) are not jargon.
    if (JARGON.test(clean.replace(/https?:\/\/\S+/g, "").replace(PROPER_NAMES, ""))) {
      flags.push("jargon");
      clean = line(PLAIN_LINES);
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
  if (!clean) clean = line(EMPTY_LINES);
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
// Offers phrased around the visitor's problem count too: "walk through it with Christopher for 30 minutes",
// "a thirty-minute call", "pick any thirty-minute slot".
export const OFFER_PITCH = /\b(working session|readiness check|book (?:a |an |the |your |some )?(?:thirty|30|time|call|session|slot|meeting|working)|book (?:it|one)\b|book(?:ed)? right here|booking (?:calendar|form|link)|pick (?:a|any) (?:thirty-minute |30-minute )?(?:time|slot)|schedule a (?:call|session|time|meeting)|(?:thirty|30)[- ]minutes? (?:time|slot|session|call|chat|walk-?through)|with Christopher\b[^.?!]{0,40}\b(?:minutes|call|session)|(?:walk|go) through [^.?!]{0,60}\bwith Christopher)/i;

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

// Products and case studies by name, for the reply used when the model is down. "Super Funnel System" also answers to
// "Super Funnel", and "pirx.ca" to "pirx". Products come first, so "Schema" opens the product page.
const NAMED = [...SITE_PRODUCTS, ...SITE_WORK].map((item) => {
  const names = [item.name, item.name.replace(/\s+System$/i, ""), item.name.replace(/\.ca$/i, "")];
  const words = [...new Set(names)].map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]?"));
  return { ...item, match: new RegExp(`\\b(?:${words.join("|")})\\b`, "i") };
});

/** The product or case study the visitor names, if any. */
export function namedPage(userText) {
  const text = String(userText || "");
  return NAMED.find((item) => item.match.test(text)) || null;
}

export const LOCAL_LINES = {
  booking: [
    "A thirty-minute working session is the fastest way to look at one job. You can pick a time in this chat.",
    "The quickest way forward is a thirty-minute working session on one real job. You can book it right here in the chat.",
    "Let's look at one job together in a thirty-minute working session. The booking is right here in this chat.",
  ],
  readiness: [
    "The Readiness Check takes five to seven minutes, and you can take it right here in this chat. It shows where the work slows down.",
    "A good first step is the Readiness Check. It runs here in the chat for five to seven minutes and points to the spot where your work gets stuck.",
  ],
  contact: [
    "Leave your name and email here. A person reads it before anyone writes back.",
    "Drop your name and email here, and a person will read it before anyone writes back.",
  ],
  general: [
    "We build custom software and AI tools around the work you already do. You can see real projects on the Case studies page. What job takes the most time each week?",
    "Custom software and AI tools that fit how you already work, that is what we build. The Case studies page shows real projects. Which job eats most of your week?",
  ],
};

/** The studio script, used when the model is not reachable. Wording rotates with seed. */
export function localReply(userText, { seed = 0, recent = [] } = {}) {
  const line = (variants) => pickVariant(variants, { seed, recent });
  const action = uiActionFor(userText);
  if (action === "offer_booking" || action === "open_booking") return line(LOCAL_LINES.booking);
  if (action === "offer_readiness_check") return line(LOCAL_LINES.readiness);
  if (action === "request_contact") return line(LOCAL_LINES.contact);
  const named = namedPage(userText);
  if (named) return `${named.name}: ${named.line} You can read more at https://abra-ca-dabra.app${named.path}.`;
  return line(LOCAL_LINES.general);
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
export async function* checkedSentences(deltas, { maxSentences = MAX_SENTENCES, firstClause = false, dropOffers = false, calendarOpen = false, recent = [], seed = 0, askedNext = false, dropAsk = null, emptyLines = null } = {}) {
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
  // recent: the last few assistant replies. A sentence that is a near copy of one of them is held
  // back (repeat guard); one is used only if nothing else is left, so a reply is never emptied.
  let repeat = null;
  const judge = (sentence) => {
    const out = postCheck(sentence, { seed, recent });
    if (!out.text && out.flags.includes("praise")) {
      dropped = true;
      return null;
    }
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
    // dropAsk: a pattern for sentences that must not be said in this mode (the receptionist demo).
    if (dropAsk && out.text && (dropAsk.test(out.text) || CONTACT_ASK.test(out.text))) {
      dropped = true;
      return null;
    }
    // A sentence that is only a link says nothing; skip it.
    if (!out.text.replace(/https?:\/\/\S+/g, "").replace(/[\s.,;:!?]/g, "")) return null;
    if (out.flags.some((flag) => REPLACING.has(flag))) return { replace: out.text, flags: out.flags };
    if (recent.length && repeatsRecent(out.text, recent)) {
      // They asked for a next step: keep the offer, in words the chat has not used yet.
      if (askedNext && hasOffer(out.text)) return { text: pickVariant(OFFER_LINES, { seed, recent }), flags: [...out.flags, "reworded"] };
      repeat ||= { text: out.text, flags: [...out.flags, "repeat"] };
      return null;
    }
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
  else if (!count && repeat) yield repeat;
  else if (!count && dropped) yield { text: pickVariant(emptyLines || (calendarOpen ? CALENDAR_OPEN_LINES : EMPTY_LINES), { seed, recent }), flags: ["dropped"] };
}
