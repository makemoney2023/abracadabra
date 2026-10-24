// Glossary definitions for one turn. SITE_GLOSSARY (generated from the marketing site's content/glossary.json)
// holds each published term's checked short definition and its exact page. Only the entries the visitor's
// question names (or the glossary page they are reading) go into that turn's prompt, so the standing prompt
// does not grow as the glossary does.
import { SITE_GLOSSARY } from "./site-knowledge.js";

export const MAX_GLOSSARY_ENTRIES = 2;
const ASKS_MEANING = /\b(?:what(?:'s|’s| is| are| does| do)|whats|define|definition|meaning|means?|explain|stand for)\b/i;
// Narrower, for the TERM CHECK note: "what is a vector database", "what does RAG mean", "define CRM".
// Not "what is your price", "what is it", "what do you build" or "what does HQ do".
const ASKS_TERM = /^\s*(?:(?:so|ok|okay|and|hi|hey)[,\s]+)?(?:(?:what(?:'s|’s| is| are)|whats)\s+(?:an?\s+|the\s+)?(?!(?:you|your|yours|it|this|that|there|here|we|our|my|the (?:cost|price|catch|process|difference|best|next)|cost|price|pricing|next|included|involved|possible|available|happening)\b)[\w.-]+|define\s+\S|what does .+ (?:mean|stand for)\b|meaning of\s+\S)/i;
const SITE = "https://abra-ca-dabra.app";

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Visitors type "llm" or "json-ld" in lower case, so names match ignoring case. The exception is an acronym whose
// lower-case form is an everyday word or unit ("geo", "ml"): that one has to be typed in capitals.
const EVERYDAY = new Set(["geo", "ml", "ai", "seo"]);
const caseSensitive = (name) => /^[A-Z]{2,}$/.test(name) && EVERYDAY.has(name.toLowerCase());

function namePattern(name) {
  // "llms.txt" also matches "llms txt" and "llmstxt"; hyphens and spaces are interchangeable.
  const body = escape(name).replace(/\\\./g, "[. ]?").replace(/(?:\\-|\s)+/g, "[-\\s]+");
  return new RegExp(`(?<![\\w/.-])${body}(?![\\w/-]|\\.[a-z])`, caseSensitive(name) ? "g" : "gi");
}

const MATCHERS = SITE_GLOSSARY.map((entry) => ({
  entry,
  patterns: entry.names.map(namePattern),
  blocked: (entry.notMatch || []).map((source) => new RegExp(source, "i")),
}));

/** Glossary entries a piece of text names, earliest mention first, at most `limit`. */
export function glossaryMatches(text, limit = MAX_GLOSSARY_ENTRIES) {
  const value = String(text || "").slice(0, 2000);
  const hits = [];
  for (const { entry, patterns, blocked } of MATCHERS) {
    let best = null;
    for (const pattern of patterns) {
      for (const m of value.matchAll(pattern)) {
        if (blocked.some((re) => re.test(value.slice(m.index, m.index + m[0].length + 40)))) continue;
        if (!best || m.index < best.index || (m.index === best.index && m[0].length > best.length)) best = { index: m.index, length: m[0].length };
      }
    }
    if (best) hits.push({ entry, ...best });
  }
  // A longer name that covers a shorter one wins ("agentic AI" over a stray "AI agent" inside it is not possible,
  // but "large language model" over "LLM" in the same spot is): drop hits nested inside another hit.
  const kept = hits.filter((hit) => !hits.some((other) => other !== hit && other.index <= hit.index && other.index + other.length >= hit.index + hit.length && other.length > hit.length));
  return kept.sort((a, b) => a.index - b.index).slice(0, limit).map((hit) => hit.entry);
}

/** The glossary entry for a page path such as /glossary/llms-txt/, or null. */
export function glossaryForPage(path) {
  const clean = String(path || "").split(/[?#]/)[0].replace(/\/index\.html$/, "/").replace(/([^/])$/, "$1/");
  return SITE_GLOSSARY.find((entry) => entry.path === clean) || null;
}

/** A "what is X" question that names no glossary term: a closing note keeps the model from defining X from memory. */
export function unknownTermNote(question) {
  if (!ASKS_TERM.test(String(question || "")) || glossaryMatches(question).length) return "";
  return "\n\nTERM CHECK: The visitor may be asking what a term means, and it has no GLOSSARY ENTRY. If a SITE FACTS line explains it (for example our products, services or MCP), answer from that line. Otherwise do not define it from memory and give no link: say it is not in our glossary yet, then ask what they want it to do for their business.";
}

/** Prompt block for this turn: the entries the question names, then the glossary page being read. "" when none. */
export function glossaryPrompt(question, pagePath, { voice = false } = {}) {
  const entries = glossaryMatches(question);
  const onPage = glossaryForPage(pagePath);
  if (onPage && !entries.includes(onPage) && entries.length < MAX_GLOSSARY_ENTRIES) entries.push(onPage);
  if (!entries.length) return "";
  const lines = entries.map((entry) => `- ${entry.term} | ${SITE}${entry.path} | ${entry.short}`);
  const how = voice
    ? "answer a question about these terms from them, close to word for word, and say it is on our glossary page"
    : "answer a question about these terms from them, close to word for word, in at most three sentences, and give the page as the full link shown";
  return `\n\nGLOSSARY ENTRY (checked definitions; ${how}):\n${lines.join("\n")}`;
}

/** Short answer used when the model is down: the definition and its page, only for a "what is X" style question. */
export function glossaryReply(question) {
  if (!ASKS_MEANING.test(String(question || ""))) return "";
  const [entry] = glossaryMatches(question, 1);
  if (!entry) return "";
  // Replies are capped at four sentences, so keep at most three of the definition and end with the page.
  const sentences = entry.short.split(/(?<=[.!?])\s+/).slice(0, 3).join(" ");
  return `${sentences} More on our glossary page: ${SITE}${entry.path}`;
}
