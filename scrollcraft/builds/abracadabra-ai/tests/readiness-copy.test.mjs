import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadGlossary, publishedTerms } from "../scripts/glossary-data.mjs";
import { READINESS_NEXT_STEPS, builtCopy, findReadinessCountClaims, findReadinessScoreClaims, pageCopy, widgetCopy } from "../scripts/readiness-copy.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("the readiness copy rule catches score promises and passes the approved line", () => {
  for (const bad of [
    "The Readiness Check takes five to seven minutes and scores four things.",
    "Take the Readiness Check. You get a band, four scores and three suggestions in each section.",
    "The Readiness Check scores 0 to 39 as Early.",
    "Themes are not a score. The Readiness Check returns the band.",
    "Our Readiness Check is great. It scores pressure and growth.",
    "The Readiness Check names the business. The check scores from 0 to 100.",
  ]) assert.notDeepEqual(findReadinessScoreClaims(bad), [], bad);
  for (const good of [
    `The Readiness Check takes five to seven minutes. ${READINESS_NEXT_STEPS}`,
    "We score data, process, people and the decision in words.",
    "Schema scores how visible a site is to answer engines.",
    "Take the Readiness Check. Is the Cisco index a small-business score?",
  ]) assert.deepEqual(findReadinessScoreClaims(good), [], good);
});

test("no built page, meta description, JSON-LD block or llms file promises a Readiness Check score", () => {
  const found = builtCopy(root).flatMap(([path, copy]) => findReadinessScoreClaims(copy).map((claim) => `${path}: ${claim}`));
  assert.deepEqual(found, []);
});

test("published glossary copy and blog sources never promise a Readiness Check score", () => {
  for (const term of publishedTerms(loadGlossary())) {
    const { draft, changes, ...shown } = term;
    assert.deepEqual(findReadinessScoreClaims(JSON.stringify(shown).replace(/\\n/g, "\n").replace(/","/g, '".\n"')), [], term.slug);
  }
  for (const slug of ["ai-readiness-assessment", "why-we-build-on-cloudflare", "answer-engine-optimization", "how-can-ai-help-small-businesses", "how-client-work-flows-through-hq", "what-is-an-ai-agent", "ai-readiness-framework", "is-my-business-ready-for-ai", "ai-readiness-checklist", "ai-readiness-assessment-questionnaire"]) {
    const source = read(`content/blog/${slug}.md`).replace(/^(\s*-?\s*\w+:\s*)/gm, "\n");
    assert.deepEqual(findReadinessScoreClaims(source), [], slug);
  }
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

test("the chat widget card and the chat's site knowledge promise next steps, not a score", () => {
  const widget = read("assets/chat-widget.js");
  const intro = widget.match(/"Take the AI Readiness Check\."\),\s*el\("p", null, "([^"]+)"/)[1];
  assert.ok(intro.includes(READINESS_NEXT_STEPS), intro);
  assert.doesNotMatch(intro, /score|band/i);
  assert.doesNotMatch(widget, /See your score|shows each score/);
  const knowledge = readFileSync(join(root, "../../../workers/abracadabra-chat/src/site-knowledge.js"), "utf8").replace(/\\n/g, "\n");
  assert.deepEqual(findReadinessScoreClaims(knowledge), []);
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
