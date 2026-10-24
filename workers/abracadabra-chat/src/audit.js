// Live mini-audit: the visitor names a website in the chat (typed or spoken), taps "Run the scan", and
// the chat runs the existing Schema scanner (readiness-check Worker, POST /api/scans, the same public scan
// the schema.abra-ca-dabra.app form starts), then shows the score, two fixes in plain words, the full report
// link and a booking offer. Nothing runs without the tap. The scanner only ever gets a public hostname.
import { checkFetch } from "./readiness.js";

export const AUDITS_PER_SESSION = 2;
export const AUDIT_POLLS_PER_SESSION = 90;
export const AUDIT_TIMEOUT_MS = 8000;
export const SCHEMA_ORIGIN = "https://schema.abra-ca-dabra.app";

// Not public on the internet, or reserved for docs and tests.
const PRIVATE_SUFFIXES = /(?:^|\.)(?:localhost|local|localdomain|internal|intranet|lan|home|corp|private|test|example|invalid|onion|arpa|home\.arpa)$/i;
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/**
 * A public hostname from what the visitor typed or said, or a reason it is refused. Only http(s),
 * no user:pass@, no IP literals (v4 or v6), no localhost or private/reserved names, a real TLD.
 * DNS rebinding to a private address is not a risk here: the scanner fetches from Cloudflare's network,
 * which cannot reach private ranges, and it fetches https://<host> only.
 */
export function checkHost(raw) {
  let text = String(raw || "").trim();
  if (!text || text.length > 300) return { ok: false, reason: "empty" };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) && !/^https?:\/\//i.test(text)) return { ok: false, reason: "scheme" };
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  let url;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (url.username || url.password) return { ok: false, reason: "credentials" };
  let host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") || host.includes(":")) return { ok: false, reason: "ip" };
  if (/^\d+(?:\.\d+){0,3}$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return { ok: false, reason: "ip" };
  if (PRIVATE_SUFFIXES.test(host)) return { ok: false, reason: "private" };
  if (host.length > 253) return { ok: false, reason: "invalid" };
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return { ok: false, reason: "invalid" };
  const tld = labels[labels.length - 1];
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(tld)) return { ok: false, reason: "invalid" };
  host = host.replace(/^www\./, "");
  return { ok: true, host };
}

/** A website named in a typed or spoken message: "https://acme.ca/about", "acme.ca", "acme dot ca". */
export function findSite(text) {
  const spoken = String(text || "").replace(/\s+dot\s+/gi, ".").replace(/\s+slash\s+/gi, "/");
  const match = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,63})(?::\d+)?(?:\/[^\s]*)?/i.exec(spoken);
  if (!match) return null;
  // Our own pages and an email address are not a site to scan.
  const before = spoken.slice(Math.max(0, match.index - 1), match.index);
  if (before === "@") return null;
  return match[0].replace(/[.,;:!?)]+$/, "");
}

const ASKS = /\b(scan|check|audit|look at|review|analy[sz]e|score|test|grade|rate|how (?:visible|findable|easy to find)|show up|findable|visib\w*)\b/i;

/** The visitor wants their site looked at: a site plus an ask, or a message that is only a site. */
export function auditIntent(text) {
  const site = findSite(text);
  if (!site) return null;
  if (/\babra-ca-dabra\.app\b/i.test(site)) return null;
  const rest = String(text).replace(site, "").replace(/\s+dot\s+\w+/gi, "").trim();
  if (ASKS.test(text) || !rest || /^(?:it'?s|our site is|my site is|site:|website:|here)[\s:]*$/i.test(rest) || /\b(?:my|our) (?:site|website)\b/i.test(text)) return site;
  return null;
}

// The scanner's finding codes (readiness-check/src/lib/scoring/score.ts) in the order of how many points
// they cost (FINDING_IMPACT), each as one plain-words fix. Unknown codes fall back to the scanner's own message.
const FIXES = [
  ["ROBOTS_BLOCKS_GPTBOT", "Let ChatGPT's crawler in: your robots.txt blocks GPTBot, so ChatGPT cannot read your pages."],
  ["NO_JSON_LD_HOME", "Add structured data (JSON-LD) to your home page, so AI search can read who you are and what you do."],
  ["MISSING_LLMS_TXT", "Add an llms.txt file: a short plain-text guide to your site for AI assistants."],
  ["EMPTY_LLMS_TXT", "Your llms.txt is there but says too little. List your main pages and what each one covers."],
  ["ROBOTS_BLOCKS_AI_BOTS", "Your robots.txt blocks one or more AI crawlers. Decide which ones may read your pages and let those in."],
  ["NO_ORG_SCHEMA", "Add an Organization or LocalBusiness block to your home page: your name, address and contact details in a form machines read."],
  ["LOW_JSON_LD_COVERAGE", "Most of your pages have no structured data. Add it to your main service and contact pages first."],
  ["PAGES_FETCH_FAILED", "Some pages did not load for the scanner. Check that they open without errors."],
  ["SITEMAP_MISSING", "Add a sitemap.xml, so crawlers can find every page."],
  ["SITEMAP_UNPARSEABLE", "Fix your sitemap.xml: crawlers cannot read it right now."],
  ["MISSING_LLMS_FULL", "Add llms-full.txt, the longer version of llms.txt with the text of your key pages."],
  ["MISSING_FAQ_SCHEMA", "Mark up your common questions with FAQ structured data."],
];
const FIX_RANK = new Map(FIXES.map(([code], index) => [code, index]));
const FIX_TEXT = new Map(FIXES);
const SEVERITY = { critical: 0, warn: 1, info: 2 };

/** Two fixes, biggest first, from a scan payload's findings (unresolved only). */
export function topFixes(findings, count = 2) {
  const open = (Array.isArray(findings) ? findings : []).filter((f) => f && f.passed === false && typeof f.code === "string");
  const seen = new Set();
  return open
    .sort((a, b) => (SEVERITY[a.severity] ?? 3) - (SEVERITY[b.severity] ?? 3) || (FIX_RANK.get(a.code) ?? 99) - (FIX_RANK.get(b.code) ?? 99))
    .filter((f) => (seen.has(f.code) ? false : seen.add(f.code)))
    .slice(0, count)
    .map((f) => ({ code: f.code, text: FIX_TEXT.get(f.code) || String(f.message || "").replace(/\s+/g, " ").trim().slice(0, 200) }))
    .filter((f) => f.text);
}

export function reportUrl(env, token) {
  return `${String(env?.SCHEMA_ORIGIN || SCHEMA_ORIGIN).replace(/\/+$/, "")}/scan/${encodeURIComponent(token)}`;
}

/** The finished scan as a card: domain, score out of 100, two fixes, the report link. */
export function auditResult(env, token, payload) {
  const score = Number.isFinite(Number(payload?.scoreTotal)) ? Math.round(Number(payload.scoreTotal)) : null;
  return {
    domain: String(payload?.domain || ""),
    score,
    fixes: topFixes(payload?.findings),
    reportUrl: reportUrl(env, token),
  };
}

/** One line for the chat history and the HQ recap, from the scanner's own numbers. */
export function auditLine(result) {
  const fixes = result.fixes.map((f) => f.text).join(" ");
  const score = result.score === null ? "" : ` scored ${result.score} out of 100 for AI search visibility.`;
  return `${result.domain}${score || " was scanned."}${fixes ? ` The two biggest fixes: ${fixes}` : " The scan found nothing big to fix."}`;
}

async function withTimeout(promise, ms) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), ms); })]);
  } finally {
    clearTimeout(timer);
  }
}

/** Starts a public scan. { ok, token } or { ok: false, status, error } in plain words. Never throws. */
export async function startScan(env, deps, host) {
  try {
    const response = await withTimeout(checkFetch(env, "/api/scans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: host, source: "public" }),
    }, deps), deps.auditTimeoutMs ?? AUDIT_TIMEOUT_MS);
    const data = await response.json().catch(() => ({}));
    if (response.status === 429) return { ok: false, status: 429, error: "That site has had its three scans for today. Try again tomorrow, or open the scanner's page." };
    if (!response.ok || !data.token) return { ok: false, status: 502, error: "The scanner is not answering right now. You can run it on its own page." };
    return { ok: true, token: String(data.token) };
  } catch {
    return { ok: false, status: 502, error: "The scanner is not answering right now. You can run it on its own page." };
  }
}

/** Reads a scan: { status: "queued"|"running"|"complete"|"failed", payload } or { status: "error" }. */
export async function readScan(env, deps, token) {
  try {
    const response = await withTimeout(checkFetch(env, `/api/scans/${encodeURIComponent(token)}`, { method: "GET" }, deps), deps.auditTimeoutMs ?? AUDIT_TIMEOUT_MS);
    if (!response.ok) return { status: "error" };
    const payload = await response.json();
    const status = ["queued", "running", "complete", "failed"].includes(payload?.status) ? payload.status : "error";
    return { status, payload, progress: payload?.progress || null };
  } catch {
    return { status: "error" };
  }
}
