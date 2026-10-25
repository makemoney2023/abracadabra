// Client Services' rule for the Readiness Check: the site never promises a score.
// The approved line is READINESS_NEXT_STEPS. findReadinessScoreClaims() flags a sentence that
// names the Readiness Check (or "the check" on a page that names it) when it talks about scores,
// bands or the band names, and also the next sentence when it carries on about the check
// ("It scores...", "You get a band...").
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const READINESS_NEXT_STEPS = "It gives you next steps for your business.";

const NAMES_CHECK = /\breadiness check\b|check\.abra-ca-dabra\.app/i;
const THE_CHECK = /\b(?:the|our) check(?:'s)?\b/i;
const CARRIES_ON = /^(?:It|Its|You|They|This|That|Then|The (?:check|band|bands|score|scores|report|results?))\b/;
const SCORE_WORDS = /\b(?:scor(?:e|es|ed|ing)|scorecards?|bands?|four scores|out of 100|0 to 100|0–100)\b|\b(?:Early|Forming|Running)\b/;

// Christopher, Oct 25: no fixed tip count either. The check gives each section as many next steps as fit the answers,
// so "three suggestions in each section", "three tips for each section" or "up to three next steps" is never said.
export const COUNT_WORDS = /\b(?:one|two|three|four|five|[1-5]|a few|several|up to (?:one|two|three|four|five|[1-5]))\s+(?:suggestions?|tips?|next steps?|steps|fixes|things(?: to do)?|ideas|actions|recommendations)\b(?=[^.]{0,60}\b(?:in|for|per)\s+(?:each|every)\s+(?:section|area|part)\b)|\b(?:three|up to three|up to 3)\s+(?:suggestions|tips|next steps|recommendations)\b|\b(?:suggestions|tips|next steps|recommendations)\s+(?:in|for)\s+(?:each|every)\s+section\b|\b(?:each|every|per)\s+(?:section|area)\s+(?:gets|has|shows|with)\s+(?:one|two|three|four|five|[1-5]|up to)\b/i;

// Left on purpose. The privacy notice has to say what the check does with your answers.
export const READINESS_ALLOWED = [/stores the answers you give so it can score them and show your results/];

const decode = (s) => s
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");

/** Visible text of a page plus the copy machines read: meta and OG content, and JSON-LD. */
export function pageCopy(html) {
  const jsonld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => {
    const strings = [];
    const walk = (v) => (typeof v === "string" ? strings.push(v) : v && typeof v === "object" && Object.values(v).forEach(walk));
    try { walk(JSON.parse(m[1])); } catch { strings.push(m[1]); }
    return strings.join("\n");
  });
  const metas = [...html.matchAll(/<meta [^>]*content="([^"]*)"/g)].map((m) => m[1]);
  const body = html
    .replace(/<script[\s\S]*?<\/script>/g, "\n")
    .replace(/<style[\s\S]*?<\/style>/g, "\n")
    .replace(/<\/(?:p|li|h[1-6]|dd|dt|div|section|aside|figcaption|td|th|title)>/g, ".\n")
    .replace(/<[^>]+>/g, " ");
  return decode([body, ...metas, ...jsonld].join("\n"));
}

function sentences(text) {
  return text.split(/\n+/).flatMap((line) => line.split(/(?<=[.!?])\s+/)).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/** Returns the sentences that promise a Readiness Check score, band or band name. */
export function findReadinessScoreClaims(text) {
  const all = sentences(text);
  const pageNamesCheck = NAMES_CHECK.test(text);
  const claims = [];
  all.forEach((sentence, i) => {
    if (!NAMES_CHECK.test(sentence) && !(pageNamesCheck && THE_CHECK.test(sentence))) return;
    const next = all[i + 1] ?? "";
    const window = CARRIES_ON.test(next) ? `${sentence} ${next}` : sentence;
    if (!SCORE_WORDS.test(window)) return;
    if (READINESS_ALLOWED.some((re) => re.test(window))) return;
    claims.push(window);
  });
  return claims;
}

/** Returns the sentences that give the Readiness Check a fixed tip count. */
export function findReadinessCountClaims(text) {
  return sentences(text).filter((sentence) => COUNT_WORDS.test(sentence));
}

const SKIP_DIRS = new Set(["node_modules", "content", "scripts", "tests", "worker", ".git"]);

/** Every built page and discovery file, as [path, copy]. */
export function builtCopy(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.html$/.test(name)) out.push([relative(root, path), pageCopy(readFileSync(path, "utf8"))]);
      else if (/^(?:llms(?:-full)?\.txt|rss\.xml)$/.test(name)) out.push([relative(root, path), decode(readFileSync(path, "utf8").replace(/<[^>]+>/g, " "))]);
    }
  };
  walk(root);
  return out;
}

/** The chat widget's own strings (its result card is copy a visitor reads), as [path, copy]. */
export function widgetCopy(root) {
  const path = join(root, "assets", "chat-widget.js");
  const strings = [...readFileSync(path, "utf8").matchAll(/"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2]);
  return [[relative(root, path), strings.join("\n")]];
}

/** Build step: fail when any built page promises a Readiness Check score or a fixed tip count. */
export function assertNoReadinessScores(root) {
  const found = builtCopy(root).flatMap(([path, copy]) => findReadinessScoreClaims(copy).map((claim) => `${path}: ${claim}`));
  if (found.length) throw new Error(`Readiness Check score wording (use "${READINESS_NEXT_STEPS}"):\n${found.slice(0, 20).join("\n")}`);
  const counts = [...builtCopy(root), ...widgetCopy(root)].flatMap(([path, copy]) => findReadinessCountClaims(copy).map((claim) => `${path}: ${claim}`));
  if (counts.length) throw new Error(`Readiness Check tip count (drop the count; use "${READINESS_NEXT_STEPS}"):\n${counts.slice(0, 20).join("\n")}`);
}
