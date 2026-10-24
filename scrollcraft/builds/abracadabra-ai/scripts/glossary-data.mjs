/**
 * Glossary data: content/glossary.json is the one source for every term.
 * Published terms render at /glossary/<slug>/. Backlog and client-held terms stay in the file, unpublished.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const GLOSSARY_FILE = fileURLToPath(new URL("../content/glossary.json", import.meta.url));
export const GLOSSARY_PATH = "/glossary/";
export const STATUSES = ["published", "backlog", "needs-client-approval"];
export const PRIORITIES = ["High", "Med", "Low"];

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const sitePath = z.string().regex(/^\/(?:[a-z0-9-]+\/?)*(?:[a-z0-9-]+(?:\.html)?)?$/);
const ref = z.object({
  title: z.string().min(1),
  publisher: z.string().min(1),
  url: z.string().url().startsWith("https://"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const qa = z.object({ question: z.string().min(8).endsWith("?"), answer: z.string().min(20) });

const base = {
  term: z.string().min(1),
  slug,
  category: z.string().min(1),
  priority: z.enum(PRIORITIES),
  sources: z.array(sitePath),
  draft: z.string().min(1),
};

const published = z.object({
  ...base,
  status: z.literal("published"),
  name: z.string().min(1),
  question: z.string().endsWith("?"),
  description: z.string().min(110).max(160),
  batch: z.number().int().positive(),
  order: z.number().int().positive(),
  alternateName: z.array(z.string()).default([]),
  short: z.string().min(40).max(320),
  explainer: z.array(z.string().min(40)).min(1),
  sections: z.array(z.object({ q: z.string().endsWith("?"), a: z.array(z.string().min(20)).min(1) })).min(2),
  faqs: z.array(qa).min(2),
  related: z.array(slug).default([]),
  refs: z.array(ref).min(1),
  figures: z.array(z.string()).default([]),
  match: z.array(z.string().min(2)).min(1),
  notMatch: z.array(z.string()).default([]),
  verified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  changes: z.string().min(1),
  merges: z.array(z.string()).optional(),
}).strict();

const unpublished = z.object({
  ...base,
  status: z.enum(["backlog", "needs-client-approval"]),
  clientFlag: z.string().nullable(),
  mentions: z.number().int().nonnegative(),
  note: z.string(),
}).strict();

const fileSchema = z.object({
  $comment: z.string().optional(),
  set: z.object({ name: z.string(), description: z.string() }),
  terms: z.array(z.discriminatedUnion("status", [published, unpublished])),
});

export function parseGlossary(raw) {
  const data = fileSchema.parse(raw);
  const slugs = new Set();
  for (const term of data.terms) {
    if (slugs.has(term.slug)) throw new Error(`Duplicate glossary slug ${term.slug}`);
    slugs.add(term.slug);
    if (term.status !== "needs-client-approval" && term.clientFlag) {
      throw new Error(`${term.term} is client-flagged (${term.clientFlag}) and must stay needs-client-approval`);
    }
  }
  // Backlog stays ordered High, then Med, then Low.
  const rank = (t) => PRIORITIES.indexOf(t.priority);
  const waiting = data.terms.filter((t) => t.status !== "published");
  for (let i = 1; i < waiting.length; i += 1) {
    if (rank(waiting[i]) < rank(waiting[i - 1])) throw new Error(`Glossary backlog out of order at ${waiting[i].term}`);
  }
  return data;
}

export function loadGlossary(file = GLOSSARY_FILE) {
  return parseGlossary(JSON.parse(readFileSync(file, "utf8")));
}

export function publishedTerms(data = loadGlossary()) {
  return data.terms.filter((t) => t.status === "published").sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));
}

export function termPath(term) {
  return `${GLOSSARY_PATH}${term.slug}/`;
}
