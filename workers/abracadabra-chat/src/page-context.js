import { SITE_KNOWLEDGE } from "./site-knowledge.js";

/** Every "- name | /path | line" entry in the site facts, keyed by path. */
const PAGES = new Map();
for (const row of SITE_KNOWLEDGE.split("\n")) {
  const match = row.match(/^- (.+?) \| (\/[^ |]*) \| (.+)$/);
  if (match && !PAGES.has(match[2])) PAGES.set(match[2], { name: match[1], path: match[2], line: match[3] });
}

/** "/services/custom-apps" and "/services/custom-apps/index.html?x=1" both become "/services/custom-apps/". */
export function normalizePath(raw) {
  let path = String(raw || "").split(/[?#]/)[0].trim();
  if (!path.startsWith("/")) return "";
  path = path.replace(/\/index\.html$/, "/").replace(/\/{2,}/g, "/");
  if (!path.endsWith("/") && !/\.[a-z0-9]+$/i.test(path)) path = `${path}/`;
  return path.slice(0, 200);
}

/** A page title is visitor-supplied: keep plain words only, short, and never instructions-shaped. */
function cleanTitle(raw) {
  return String(raw || "")
    .replace(/\s*[|·–—-]\s*(Abracadabra|abra-ca-dabra)[^|]*$/i, "")
    .replace(/[^\p{L}\p{N} ,.'’:&?!()/-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

/** Which page the visitor is reading, as one line for the system prompt, or "" when unknown. */
export function pageFact(rawPath, rawTitle) {
  const path = normalizePath(rawPath);
  if (!path) return "";
  const known = PAGES.get(path);
  if (known) return `${known.name} | ${known.path} | ${known.line}`;
  const blog = path.match(/^\/blog\/[a-z0-9-]+\/$/);
  const title = cleanTitle(rawTitle);
  if (blog && title) return `A Notes article | ${path} | titled "${title}"`;
  return "";
}

export function pagePrompt(rawPath, rawTitle) {
  const fact = pageFact(rawPath, rawTitle);
  if (!fact) return "";
  return `\n\nTHE VISITOR IS READING THIS PAGE NOW: ${fact}\nIf the question is vague ("this", "how does it work", "how much is it", "can you do this for me"), they mean what this page covers: answer about that service, project or article first, by name. Talk about the thing, not "this page". Do not repeat its link unless they ask. Still suggest a better fit when one clearly fits.`;
}
