/**
 * Glossary backlinks: link the first plain-prose mention of a glossary term
 * on a page to its glossary entry. Never inside headings, links, buttons,
 * navigation, FAQ disclosures, captions, code, scripts or SVG, and never twice.
 */

/** Elements whose text must never get a glossary link. */
const BLOCKED = new Set([
  "a", "h1", "h2", "h3", "h4", "h5", "h6", "script", "style", "svg", "button", "summary",
  "details", "nav", "figcaption", "figure", "code", "pre", "title", "label", "option", "select",
  "textarea", "aside", "header", "footer", "noscript", "template", "dialog", "form", "kbd", "sup",
  "table", "blockquote", "picture", "video", "audio", "iframe", "object", "time",
]);
/** Text only counts as prose when it sits inside one of these. */
const PROSE = new Set(["p", "li", "dd"]);
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/** Split HTML into tag and text tokens. Comments are kept as tags. */
export function tokenize(html) {
  const tokens = [];
  const pattern = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>/g;
  let last = 0;
  for (const match of html.matchAll(pattern)) {
    if (match.index > last) tokens.push({ type: "text", value: html.slice(last, match.index) });
    tokens.push({ type: "tag", value: match[0] });
    last = match.index + match[0].length;
  }
  if (last < html.length) tokens.push({ type: "text", value: html.slice(last) });
  return tokens;
}

function tagInfo(tag) {
  if (tag.startsWith("<!--")) return null;
  const m = tag.match(/^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/);
  if (!m) return null;
  const name = m[2].toLowerCase();
  return { name, closing: m[1] === "/", selfClosing: VOID.has(name) || /\/>$/.test(tag) };
}

function classOf(tag) {
  const m = tag.match(/\sclass="([^"]*)"/);
  return m ? m[1].split(/\s+/) : [];
}

/**
 * Walk the tokens of a region, calling visit(text, index) for each text token
 * that is prose and outside every blocked element. Elements with a class in
 * skipClasses are treated as blocked too.
 */
/** Text a sighted reader cannot see (screen-reader-only copy, hidden or aria-hidden elements) never gets a link. */
const HIDDEN_CLASS = /(^|[-_])(sr|sr-only|visually-hidden|screen-reader-text)$/;
function isHidden(tag) {
  if (/\shidden(\s|=|>|\/)/.test(tag) || /aria-hidden="true"/.test(tag)) return true;
  return classOf(tag).some((c) => HIDDEN_CLASS.test(c));
}

function walkProse(tokens, visit, skipClasses = []) {
  const stack = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type === "tag") {
      const info = tagInfo(token.value);
      if (!info) continue;
      if (info.closing) {
        const at = stack.map((e) => e.name).lastIndexOf(info.name);
        if (at !== -1) stack.length = at;
        continue;
      }
      if (info.selfClosing) continue;
      const blocked = BLOCKED.has(info.name) || isHidden(token.value) || classOf(token.value).some((c) => skipClasses.includes(c));
      stack.push({ name: info.name, blocked });
      continue;
    }
    if (!token.value.trim()) continue;
    if (stack.some((e) => e.blocked)) continue;
    if (!stack.some((e) => PROSE.has(e.name))) continue;
    if (visit(token.value, i) === false) return;
  }
}

/** Pattern for a term's match phrases, as whole words, case-insensitive unless a phrase is all caps. */
export function termPattern(phrases) {
  const parts = phrases.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?<![\\w./-])(?:${parts.join("|")})(?![\\w/-]|\\.[a-z])`, "i");
}

function phraseMatch(text, term) {
  // Acronym-style phrases (LLM, LLMs, JSON-LD) match case-sensitively; everything else ignores case.
  const isAcronym = (p) => /[A-Z]{2,}/.test(p) && !/[a-z]{2,}/.test(p);
  const caseSensitive = term.match.filter(isAcronym);
  const insensitive = term.match.filter((p) => !isAcronym(p));
  const hits = [];
  if (insensitive.length) hits.push(...text.matchAll(new RegExp(termPattern(insensitive).source, "gi")));
  if (caseSensitive.length) hits.push(...text.matchAll(new RegExp(termPattern(caseSensitive).source, "g")));
  const blockedBy = (term.notMatch ?? []).map((p) => new RegExp(p, "i"));
  const ok = hits.filter((m) => !blockedBy.some((re) => re.test(text.slice(m.index, m.index + m[0].length + 40))));
  ok.sort((a, b) => a.index - b.index);
  return ok[0] ?? null;
}

/** The [start, end) slice of html that holds the page's article prose. */
export function proseRegion(html) {
  const post = html.indexOf('<div class="prose post-prose">');
  if (post !== -1) {
    const end = html.indexOf('<section id="faq">', post);
    return [post, end === -1 ? html.indexOf("</article>", post) : end];
  }
  const start = html.search(/<main[\s>]/);
  const end = html.lastIndexOf("</main>");
  if (start === -1 || end === -1) return null;
  return [start, end];
}

/** Does the page's prose mention the term somewhere a link could go? */
export function findMention(html, term, skipClasses = []) {
  const region = proseRegion(html);
  if (!region) return null;
  const tokens = tokenize(html.slice(region[0], region[1]));
  let found = null;
  walkProse(tokens, (text) => {
    const m = phraseMatch(decodeEntities(text), term);
    if (m) { found = m[0]; return false; }
    return true;
  }, skipClasses);
  return found;
}

function decodeEntities(text) {
  return text.replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;/g, '"');
}

/**
 * Link the first prose mention of term on the page to href. Returns the new
 * HTML, or the same HTML when the page already links to href or has no mention.
 */
export function linkFirstMention(html, term, href, skipClasses = []) {
  if (html.includes(`href="${href}"`)) return html;
  const region = proseRegion(html);
  if (!region) return html;
  const before = html.slice(0, region[0]);
  const after = html.slice(region[1]);
  const tokens = tokenize(html.slice(region[0], region[1]));
  let done = false;
  walkProse(tokens, (text, index) => {
    // Entities stay as written; only match on text with no entity inside the hit.
    const m = phraseMatch(text, term);
    if (!m) return true;
    const hit = m[0];
    tokens[index] = {
      type: "text",
      value: `${text.slice(0, m.index)}<a class="glossary-link" href="${href}">${hit}</a>${text.slice(m.index + hit.length)}`,
    };
    done = true;
    return false;
  }, skipClasses);
  if (!done) return html;
  return before + tokens.map((t) => t.value).join("") + after;
}
