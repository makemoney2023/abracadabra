import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildKnowledge } from "../scripts/build-site-knowledge.mjs";
import { SITE_GLOSSARY, SITE_KNOWLEDGE, SITE_PATHS } from "../src/site-knowledge.js";
import { MAX_GLOSSARY_ENTRIES, glossaryForPage, glossaryMatches, glossaryPrompt, glossaryReply, unknownTermNote } from "../src/glossary.js";
import { systemPrompt } from "../src/model.js";
import { localReply, postCheck, repairPath } from "../src/policy.js";

const glossaryJson = JSON.parse(readFileSync(new URL("../../../scrollcraft/builds/abracadabra-ai/content/glossary.json", import.meta.url), "utf8"));
const published = glossaryJson.terms.filter((term) => term.status === "published");
const names = (q) => glossaryMatches(q).map((entry) => entry.term);

test("every published glossary term is a SITE_GLOSSARY entry with its exact page and checked definition", async () => {
  assert.equal(SITE_GLOSSARY.length, published.length);
  for (const term of published) {
    const entry = SITE_GLOSSARY.find((item) => item.path === `/glossary/${term.slug}/`);
    assert.ok(entry, term.term);
    assert.equal(entry.short, term.short.replace(/\s+/g, " ").trim());
    assert.ok(SITE_PATHS.includes(entry.path), `${entry.path} is a known page`);
  }
  const { glossary } = await buildKnowledge();
  assert.deepEqual(SITE_GLOSSARY, glossary, "run npm run knowledge");
});

test("the standing prompt carries no glossary definitions, so it does not grow with the glossary", () => {
  assert.ok(SITE_KNOWLEDGE.length < 16000, `${SITE_KNOWLEDGE.length} chars`);
  for (const entry of SITE_GLOSSARY) assert.ok(!SITE_KNOWLEDGE.includes(entry.short), `${entry.term} definition is in SITE_KNOWLEDGE`);
  assert.match(SITE_KNOWLEDGE, /GLOSSARY: .*\/glossary\//);
  assert.doesNotMatch(systemPrompt({}), /GLOSSARY ENTRY \(/);
});

test("a question that names a term gets that term's definition and full page link in the prompt", () => {
  const prompt = systemPrompt({ question: "what is llms.txt?" });
  assert.match(prompt, /GLOSSARY ENTRY \(/);
  assert.match(prompt, /- llms\.txt \| https:\/\/abra-ca-dabra\.app\/glossary\/llms-txt\/ \| llms\.txt is a proposed file, written in Markdown/);
  assert.match(systemPrompt({ question: "what is gradient boosting?" }), /https:\/\/abra-ca-dabra\.app\/glossary\/gradient-boosting\/ \| Gradient boosting is a machine learning method/);
  assert.match(systemPrompt({}), /Never guess or make up what a term means/);
  assert.match(systemPrompt({}), /do not define it from memory/);
  const voice = systemPrompt({ voice: true, question: "what is llms.txt?" });
  assert.match(voice, /say it is on our glossary page/);
});

test("matching: plain, lower-case and spaced forms match; product names and everyday words do not", () => {
  assert.deepEqual(names("what is llms.txt?"), ["llms.txt"]);
  assert.deepEqual(names("whats an llms txt file"), ["llms.txt"]);
  assert.deepEqual(names("what is an llm"), ["Large language model (LLM)"]);
  assert.deepEqual(names("how does json-ld work"), ["Schema markup and JSON-LD"]);
  assert.deepEqual(names("AI agents vs agentic AI?"), ["AI agent", "Agentic AI"]);
  assert.deepEqual(names("what is GEO"), ["Generative engine optimization (GEO)"]);
  assert.deepEqual(names("Tell me about LLM Leverage"), []);
  assert.deepEqual(names("geo targeting and 5 ml"), []);
  assert.deepEqual(names("what does llms-full.txt do"), []);
  assert.ok(glossaryMatches("ai agent, agentic ai, llm, gradient boosting, machine learning").length <= MAX_GLOSSARY_ENTRIES);
});

test("the glossary page being read adds its own entry", () => {
  assert.equal(glossaryForPage("/glossary/llms-txt")?.term, "llms.txt");
  assert.match(glossaryPrompt("what does this mean?", "/glossary/llms-txt/"), /glossary\/llms-txt\//);
  assert.equal(glossaryPrompt("hello", "/services/"), "");
});

test("per-turn glossary block stays small: at most two entries", () => {
  const longest = [...SITE_GLOSSARY].sort((a, b) => b.short.length - a.short.length);
  const block = glossaryPrompt(`${longest[0].names[0]} and ${longest[1].names[0]}`, "/");
  assert.ok(block.length <= 1200, `${block.length} chars`);
});

test("a slightly wrong page path is repaired instead of falling back to the homepage", () => {
  assert.equal(repairPath("/blog/what-is-llms.txt"), "/blog/what-is-llms-txt/");
  assert.equal(repairPath("/glossary/llms.txt"), "/glossary/llms-txt/");
  assert.equal(repairPath("/glossary/gradient-boosting"), "/glossary/gradient-boosting/");
  assert.equal(repairPath("/schema"), null, "two pages end in schema, so no guess");
  assert.equal(repairPath("/llms.txt-guide"), null);
  assert.equal(repairPath("/process"), null);
  const fixed = postCheck("Our note explains it: https://abra-ca-dabra.app/blog/what-is-llms.txt.");
  assert.match(fixed.text, /https:\/\/abra-ca-dabra\.app\/blog\/what-is-llms-txt\/\./);
  const glossary = postCheck("See https://abra-ca-dabra.app/glossary/llms.txt for more.");
  assert.match(glossary.text, /https:\/\/abra-ca-dabra\.app\/glossary\/llms-txt\/ for more/);
  assert.match(postCheck("See https://abra-ca-dabra.app/process for it.").text, /https:\/\/abra-ca-dabra\.app\/ for it/);
});

test("when the model is down, a glossary question still gets the checked definition and page", () => {
  const reply = localReply("what is llms.txt?");
  assert.match(reply, /written in Markdown/);
  assert.match(reply, /https:\/\/abra-ca-dabra\.app\/glossary\/llms-txt\//);
  assert.equal(glossaryReply("tell me about HQ"), "");
  assert.equal(glossaryReply("I want the llms.txt set up"), "", "only a what-is question gets a definition");
  for (const entry of SITE_GLOSSARY) {
    const checked = postCheck(localReply(`what is ${entry.names[0]}?`));
    assert.deepEqual(checked.flags, [], `${entry.term}: ${checked.flags}`);
    assert.ok(checked.text.includes(`https://abra-ca-dabra.app${entry.path}`), `${entry.term} keeps its link`);
  }
  assert.match(localReply("Tell me about HQ"), /products\/hq/);
});

test("a what-is question about a term with no glossary entry gets a TERM CHECK note; ordinary questions do not", () => {
  for (const q of ["what is a vector database?", "What's RAG?", "define CRM", "what does RAG stand for", "so what is fine-tuning"]) {
    assert.match(unknownTermNote(q), /TERM CHECK/, q);
    assert.match(systemPrompt({ question: q }), /TERM CHECK: .*not in our glossary yet/, q);
  }
  for (const q of ["what is llms.txt?", "what do you build?", "what does HQ do?", "what is your price?", "what is it?", "what's the cost?", "what work have you done?", "what is the difference between AI agents and agentic AI?", "book a call", "what's next?"]) {
    assert.equal(unknownTermNote(q), "", q);
  }
});
