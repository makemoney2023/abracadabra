import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadGlossary, publishedTerms } from "../scripts/glossary-data.mjs";
import { READINESS_NEXT_STEPS, assertReadinessCopy, builtCopy, findReadinessCountClaims, findReadinessFreeClaims, pageCopy, widgetCopy } from "../scripts/readiness-copy.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("the free rule catches the Readiness Check called free and passes other uses of the word", () => {
  for (const bad of [
    "Take the free Readiness Check.",
    "The Readiness Check is free and takes five to seven minutes.",
    "Take the Readiness Check. It is free.",
    "Our Readiness Check costs nothing: it is free of charge.",
  ]) assert.notDeepEqual(findReadinessFreeClaims(bad), [], bad);
  for (const good of [
    `The Readiness Check takes five to seven minutes. ${READINESS_NEXT_STEPS}`,
    "The Schema scan is free.",
    "The Readiness Check has a free-text box for the last question.",
    "Take the Readiness Check, and feel free to stop and come back.",
  ]) assert.deepEqual(findReadinessFreeClaims(good), [], good);
});

test("score wording about the Readiness Check is allowed again (public scores since #227)", () => {
  for (const ok of [
    "The Readiness Check gives a score for readiness, growth, and website visibility.",
    "Take the Readiness Check. You get your scores, your stage, and next steps for your business.",
  ]) {
    assert.deepEqual(findReadinessFreeClaims(ok), [], ok);
    assert.deepEqual(findReadinessCountClaims(ok), [], ok);
  }
});

test("no built page, meta description, JSON-LD block, llms file or chat widget string calls the Readiness Check free", () => {
  const found = [...builtCopy(root), ...widgetCopy(root)].flatMap(([path, copy]) => findReadinessFreeClaims(copy).map((claim) => `${path}: ${claim}`));
  assert.deepEqual(found, []);
  assert.doesNotThrow(() => assertReadinessCopy(root));
});

test("published glossary copy and blog sources never call the Readiness Check free", () => {
  for (const term of publishedTerms(loadGlossary())) {
    const { draft, changes, ...shown } = term;
    assert.deepEqual(findReadinessFreeClaims(JSON.stringify(shown).replace(/\\n/g, "\n").replace(/","/g, '".\n"')), [], term.slug);
  }
  for (const slug of ["ai-readiness-assessment", "why-we-build-on-cloudflare", "answer-engine-optimization", "how-can-ai-help-small-businesses", "how-client-work-flows-through-hq", "what-is-an-ai-agent", "ai-readiness-framework", "is-my-business-ready-for-ai", "ai-readiness-checklist", "ai-readiness-assessment-questionnaire"]) {
    const source = read(`content/blog/${slug}.md`).replace(/^(\s*-?\s*\w+:\s*)/gm, "\n");
    assert.deepEqual(findReadinessFreeClaims(source), [], slug);
    assert.deepEqual(findReadinessCountClaims(source), [], slug);
  }
});

test("the homepage FAQ answer about the Readiness Check uses Client Services' line, in the page and its FAQ JSON-LD", () => {
  const home = read("index.html");
  const visible = home.slice(home.indexOf('<section id="faq"'), home.indexOf('<section id="start"'));
  assert.ok(pageCopy(visible).includes(READINESS_NEXT_STEPS));
  const faq = JSON.parse([...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((j) => j.includes('"FAQPage"')));
  const nodes = faq["@graph"] ?? [faq];
  const answer = nodes.find((n) => n["@type"] === "FAQPage").mainEntity.find((q) => /ready to put AI to work/.test(q.name)).acceptedAnswer.text;
  assert.ok(answer.includes(READINESS_NEXT_STEPS), answer);
  assert.deepEqual(findReadinessFreeClaims(answer), []);
  assert.deepEqual(findReadinessCountClaims(answer), []);
});

test("the Readiness Check pages use Client Services' line", () => {
  const page = read("glossary/readiness-check/index.html");
  assert.ok(pageCopy(page).includes(READINESS_NEXT_STEPS));
  assert.match(page, new RegExp(`<meta name="description" content="[^"]*${READINESS_NEXT_STEPS}`));
  const ld = JSON.parse(page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])["@graph"];
  assert.ok(ld.find((n) => n["@type"] === "DefinedTerm").description.includes(READINESS_NEXT_STEPS));
  assert.ok(read("llms.txt").includes(READINESS_NEXT_STEPS));
  assert.ok(read("glossary/index.html").includes(READINESS_NEXT_STEPS));
});

test("the chat widget card and the chat's site knowledge promise next steps and never call the check free", () => {
  const widget = read("assets/chat-widget.js");
  const intro = widget.match(/"Take the AI Readiness Check\."\),\s*el\("p", null, "([^"]+)"/)[1];
  assert.ok(intro.includes(READINESS_NEXT_STEPS), intro);
  assert.deepEqual(findReadinessFreeClaims(intro), []);
  const knowledge = readFileSync(join(root, "../../../workers/abracadabra-chat/src/site-knowledge.js"), "utf8").replace(/\\n/g, "\n");
  assert.deepEqual(findReadinessFreeClaims(knowledge), []);
});

test("the count rule catches fixed tip counts and passes the approved line", () => {
  for (const bad of [
    "You see three suggestions in each section.",
    "It gives three tips for each section.",
    "Then you see the stage, up to three next steps in each section, and a way to book.",
    "It takes five to seven minutes, with one question on each screen and three tips for each section.",
    "Each section gets three ideas.",
    "It gives you next steps for your business, with tips for each section.",
  ]) assert.notDeepEqual(findReadinessCountClaims(bad), [], bad);
  for (const good of [
    `The Readiness Check takes five to seven minutes. ${READINESS_NEXT_STEPS}`,
    "There is one question per screen.",
    "Four things: pressure, readiness, growth, and website visibility. The other three come from your answers.",
    "List the three pages a buyer hits first.",
  ]) assert.deepEqual(findReadinessCountClaims(good), [], good);
});

test("no built page, llms file, glossary or blog source, chat widget string or chat knowledge gives a fixed tip count", () => {
  const found = [...builtCopy(root), ...widgetCopy(root)].flatMap(([path, copy]) => findReadinessCountClaims(copy).map((claim) => `${path}: ${claim}`));
  assert.deepEqual(found, []);
  for (const term of publishedTerms(loadGlossary())) {
    const { draft, changes, ...shown } = term;
    assert.deepEqual(findReadinessCountClaims(JSON.stringify(shown).replace(/\\n/g, "\n").replace(/","/g, '".\n"')), [], term.slug);
  }
  for (const slug of ["ai-readiness-assessment", "why-we-build-on-cloudflare", "how-client-work-flows-through-hq"]) {
    assert.deepEqual(findReadinessCountClaims(read(`content/blog/${slug}.md`)), [], slug);
  }
  const knowledge = readFileSync(join(root, "../../../workers/abracadabra-chat/src/site-knowledge.js"), "utf8").replace(/\\n/g, "\n");
  assert.deepEqual(findReadinessCountClaims(knowledge), []);
  const card = read("assets/chat-widget.js").match(/The full report opens on the check site\.[^"]*/)[0];
  assert.ok(card.includes(READINESS_NEXT_STEPS), card);
});
