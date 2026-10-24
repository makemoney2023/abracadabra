// A short recap of the chat for the HQ lead, so Sales sees what the visitor wants before reading the
// transcript. Facts come from the session (always). One small model call adds a two-sentence summary
// of what the visitor said; if it fails or is slow, the facts are enough. Never shown to the visitor.
import { FALLBACK_MODEL, streamChat } from "./model.js";
import { SITE_SERVICES } from "./site-knowledge.js";
import { demoBusiness } from "./demo.js";

export const RECAP_TIMEOUT_MS = 4000;
const RECAP_MAX = 420;

const RECAP_SYSTEM = [
  "You write a two-sentence internal note for a small studio's sales team about one website chat.",
  "Say only what the visitor said: their business, what they want built or fixed, timing, budget or constraints, and what is still open.",
  "Keep the specifics they gave (team size, town, tools by name, dates). Never assume a role, a budget or anything they did not say; if they only asked about cost, say they asked about cost.",
  "Plain words. No greeting, no advice, no sales talk, no guesses. Do not repeat contact details.",
  "If the visitor said little, say that in one short sentence.",
].join(" ");

export const TOPICS = [
  ["Voice", /\b(voice|phone|call(s|er)?|receptionist|answering)\b/i],
  ["AI assistants", /\b(assistant|agent|chatbot|bot)\b/i],
  ["Answers from your documents", /\b(documents?|files?|pdfs?|knowledge base|manuals?)\b/i],
  ["Web automation", /\b(scrap\w*|browser|automat\w*|reports?)\b/i],
  ["Custom apps", /\b(app|crm|erp|portal|dashboard|software|system)\b/i],
  ["AI visibility", /\b(chatgpt|perplexity|seo|search|visib\w*|found)\b/i],
  ["AI media", /\b(video|images?|photos?|content|social)\b/i],
];

/** What the session already knows, in one line each. */
export function recapFacts(session) {
  const said = visitorSaid(session);
  const topics = TOPICS.filter(([, re]) => re.test(said)).map(([name]) => name)
    .filter((name) => SITE_SERVICES.some((s) => s.name === name)).slice(0, 4);
  const readiness = session.readiness?.done
    ? `Readiness Check in chat: ${session.readiness.bandLabel || session.readiness.band}${session.readiness.pressures?.length ? `; slows down at: ${session.readiness.pressures.slice(0, 3).map((p) => p.replace(/[.\s]+$/, "")).join(" / ")}` : ""}.`
    : session.readiness?.token ? `Started the Readiness Check in chat (${session.readiness.answered || 0} answers).` : "";
  const voiceTurns = (session.messages || []).filter((m) => m.role === "user" && m.voice).length;
  return [
    topics.length ? `Asked about: ${topics.join(", ")}.` : "",
    readiness,
    visitorLine(session.visitor),
    ...(session.audits || []).filter((a) => a.line).slice(-2).map((a) => `Mini-audit in chat: ${a.line}`),
    session.demo?.done ? "Tried the receptionist demo by voice." : "",
    voiceTurns ? `Spoke by voice (${voiceTurns} turn${voiceTurns === 1 ? "" : "s"}).` : "",
    (session.startPage || session.page) ? `Started on ${session.startPage || session.page}.` : "",
    `${session.messageCount || 0} question${session.messageCount === 1 ? "" : "s"} asked.`,
  ].filter(Boolean);
}

/** What the visitor typed or said, outside the receptionist demo (demo turns are role-play). */
function visitorSaid(session) {
  return (session.messages || []).filter((m) => m.role === "user" && !m.demo).map((m) => m.text).join(" \n ");
}

/** The visitor record (conversation.js) in one line: only what they told us, never contact details. */
export function visitorLine(visitor) {
  if (!visitor) return "";
  const parts = [];
  if (visitor.industry) parts.push(`works in ${visitor.industry}${visitor.size ? ` (${visitor.size})` : ""}`);
  else if (visitor.size) parts.push(`team: ${visitor.size}`);
  if (visitor.role) parts.push(`role: ${visitor.role}`);
  if (visitor.tools?.length) parts.push(`uses ${visitor.tools.slice(0, 4).join(", ")}`);
  if (visitor.pain) parts.push(`said: "${visitor.pain}"`);
  return parts.length ? `Visitor: ${parts.join("; ")}.` : "";
}

const RECAP_ASK = /\b(?:recap|summar(?:y|ise|ize)|sum (?:it|this|that) up|what (?:did|have) you (?:heard?|got|learned)|what do you know about (?:me|us)|what have i told you)\b/i;

export function recapIntent(text) {
  return RECAP_ASK.test(String(text || ""));
}

/** The first service that fits: what their problem names first, then anything they asked about. */
export function firstBuild(session) {
  const pain = String(session.visitor?.pain || "");
  const said = visitorSaid(session);
  for (const source of [pain, said]) {
    if (!source) continue;
    const hit = TOPICS.find(([name, re]) => re.test(source) && SITE_SERVICES.some((s) => s.name === name));
    if (hit) {
      const service = SITE_SERVICES.find((s) => s.name === hit[0]);
      return { name: service.name, line: service.line, path: service.path };
    }
  }
  return null;
}

/**
 * The card the visitor sees at goodbye or when they ask for a recap: "Here's what I heard" from the
 * visitor record (and a mini-audit, if one ran), "Suggested first build" from the site's own service
 * lines. Null when the chat knows too little to say anything useful. Only facts the visitor gave.
 */
export function recapCard(session) {
  const v = session.visitor || {};
  const heard = [];
  if (v.industry) heard.push(`You work at ${demoBusiness(v)}${v.size ? ` (${v.size})` : ""}${v.role ? `, as ${/^[aeiou]/i.test(v.role) ? "an" : "a"} ${v.role}` : ""}.`);
  else if (v.role) heard.push(`You're ${/^[aeiou]/i.test(v.role) ? "an" : "a"} ${v.role}.`);
  if (v.tools?.length) heard.push(`You use ${v.tools.slice(0, 4).join(", ")}.`);
  if (v.pain) heard.push(`The problem: "${v.pain}"`);
  const audit = (session.audits || []).filter((a) => a.line).at(-1);
  if (audit) heard.push(`Mini-audit: ${audit.line}`);
  const build = firstBuild(session);
  if (!heard.length && !build) return null;
  const buildText = build ? `${build.name}. ${build.line}` : "We'd pick the first job together in a 30-minute working session.";
  const notes = [
    "Recap from the website chat.",
    heard.length ? `Heard: ${heard.join(" ")}` : "",
    `Suggested first build: ${build ? build.name : "to decide together"}.`,
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 500);
  return { kind: "recap", heard: heard.length ? heard : ["Not much yet: tell me about the job that eats your week."], build: buildText, buildPath: build?.path || "", notes };
}

function transcriptFor(session, budget = 3000) {
  const lines = [];
  let used = 0;
  for (const m of [...(session.messages || [])].reverse()) {
    const line = `${m.role === "user" ? "Visitor" : "Chat"}: ${String(m.text || "").replace(/\s+/g, " ").trim()}`;
    if (used + line.length > budget) break;
    lines.unshift(line);
    used += line.length + 1;
  }
  return lines.join("\n");
}

/** The model's two sentences, or "" when there is nothing to say, no gateway, or it is slow. */
export async function recapSummary(session, env, { fetchImpl = fetch, timeoutMs = RECAP_TIMEOUT_MS } = {}) {
  const visitorLines = (session.messages || []).filter((m) => m.role === "user");
  if (!visitorLines.length || String(env?.AI_RECAP_MODEL || "").trim() === "none") return "";
  const transcript = transcriptFor(session);
  let text = "";
  const controller = new AbortController();
  let timer;
  const late = new Promise((resolve) => { timer = setTimeout(() => { controller.abort(); resolve("late"); }, timeoutMs); });
  const read = (async () => {
    for await (const delta of streamChat({
      env,
      messages: [{ role: "user", text: `Chat transcript:\n${transcript}\n\nWrite the note.` }],
      fetchImpl,
      timeoutMs,
      model: String(env?.AI_RECAP_MODEL || FALLBACK_MODEL).trim(),
      system: RECAP_SYSTEM,
      maxTokens: 120,
      signal: controller.signal,
    })) {
      text += delta;
      if (text.length > RECAP_MAX * 2) break;
    }
    return "done";
  })();
  try {
    // Bounded even if the transport ignores the abort: the lead never waits on the recap.
    if ((await Promise.race([read, late])) !== "done") return "";
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
  read.catch(() => {});
  // Contact details stay in their own fields.
  return text.replace(/\S+@\S+\.\S+/g, "[email]").replace(/\s+/g, " ").trim().slice(0, RECAP_MAX);
}

/** Summary first, then the facts. */
export async function buildRecap(session, env, options) {
  const summary = await recapSummary(session, env, options);
  return [summary, ...recapFacts(session)].filter(Boolean).join(" ");
}
