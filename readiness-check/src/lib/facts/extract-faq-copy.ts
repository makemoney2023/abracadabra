import type { FaqPair } from "./types";

const MAX_PAIRS = 10;
const MIN_Q = 8;
const MIN_A = 12;

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isQuestion(text: string): boolean {
  const t = clean(text);
  if (t.length < MIN_Q) return false;
  return t.endsWith("?") || /^(what|how|why|when|where|who|do|does|can|is|are)\b/i.test(t);
}

function pushPair(out: FaqPair[], question: string, answer: string) {
  const q = clean(question);
  const a = clean(answer);
  if (!isQuestion(q) && !q.endsWith("?")) return;
  if (a.length < MIN_A) return;
  if (out.some((p) => p.question.toLowerCase() === q.toLowerCase())) return;
  out.push({ question: q, answer: a });
}

function fromMarkdown(markdown: string, out: FaqPair[]) {
  const lines = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length && out.length < MAX_PAIRS; i++) {
    const heading = /^#{2,3}\s+(.+)$/.exec(lines[i] ?? "");
    if (!heading) continue;
    const question = heading[1] ?? "";
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j] ?? "";
      if (/^#{1,3}\s+/.test(line)) break;
      if (line.trim()) body.push(line.trim());
      if (body.join(" ").length > 280) break;
    }
    pushPair(out, question, body.join(" "));
  }
}

function fromHtml(html: string, out: FaqPair[]) {
  for (const match of html.matchAll(
    /<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi,
  )) {
    if (out.length >= MAX_PAIRS) break;
    const question = clean((match[1] ?? "").replace(/<[^>]+>/g, " "));
    const answer = clean((match[2] ?? "").replace(/<[^>]+>/g, " "));
    pushPair(out, question, answer);
  }

  for (const match of html.matchAll(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    if (out.length >= MAX_PAIRS) break;
    const question = clean((match[2] ?? "").replace(/<[^>]+>/g, " "));
    if (!isQuestion(question)) continue;
    const after = html.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 600);
    const p = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(after);
    const answer = clean((p?.[1] ?? "").replace(/<[^>]+>/g, " "));
    pushPair(out, question, answer);
  }
}

/** Extract FAQ pairs from visible copy (markdown and/or HTML). Cap 10. */
export function extractFaqPairsFromCopy(input: {
  markdown?: string;
  html?: string;
}): FaqPair[] {
  const out: FaqPair[] = [];
  if (input.markdown) fromMarkdown(input.markdown, out);
  if (input.html) fromHtml(input.html, out);
  return out.slice(0, MAX_PAIRS);
}
