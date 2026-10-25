import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest } from "../src/http.js";
import { SITE_GLOSSARY } from "../src/site-knowledge.js";
import { glossaryLinkFor, glossaryMatches, glossaryPrompt, glossaryReply } from "../src/glossary.js";
import { checkedSentences, closestPost, isLinkOnly, postCheck, sitePageKnown } from "../src/policy.js";

const NOW = 1_700_000_000_000;
const ENV = { AI_GATEWAY_TOKEN: "t", CF_ACCOUNT_ID: "acct" };
const GB = SITE_GLOSSARY.find((entry) => entry.path === "/glossary/gradient-boosting/");
const GB_URL = "https://abra-ca-dabra.app/glossary/gradient-boosting/";
const names = (q) => glossaryMatches(q).map((entry) => entry.term);

function sse(parts) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ response: part })}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  }), { headers: { "content-type": "text/event-stream" } });
}

async function ask(parts, text) {
  const deps = { now: () => NOW, limits: { messages: new Map(), sessions: new Map() }, rooms: new Map(), sendHandoff: async () => {}, fetchImpl: async () => sse(parts) };
  const opened = await handleRequest(new Request("https://abra-ca-dabra.app/api/chat/session", {
    method: "POST", headers: { origin: "http://127.0.0.1:4500", "content-type": "application/json", "cf-connecting-ip": "203.0.113.91" }, body: "{}",
  }), ENV, deps);
  const cookie = `abra_chat=${opened.headers.get("set-cookie").match(/abra_chat=([^;]+)/)[1]}`;
  const response = await handleRequest(new Request("https://abra-ca-dabra.app/api/chat/message", {
    method: "POST", headers: { origin: "https://abra-ca-dabra.app", "content-type": "application/json", "cf-connecting-ip": "203.0.113.91", cookie }, body: JSON.stringify({ text }),
  }), ENV, deps);
  const raw = await response.text();
  const events = [...raw.matchAll(/event: (\w+)\ndata: (.*)\n\n/g)].map(([, event, data]) => ({ event, data: JSON.parse(data) }));
  return events.find((e) => e.event === "final").data.text;
}

async function collect(parts, options) {
  async function* deltas() { for (const part of parts) yield part; }
  const out = [];
  for await (const part of checkedSentences(deltas(), options)) out.push(part.text ?? part.replace);
  return out.join(" ");
}

// Live bug (chat after PR #218): the model wrote the definition, then the page link as its own piece. The sentence
// checker dropped a piece that was only a link, so the visitor never saw the page.
test("live fix: a glossary link the model writes after the definition reaches the visitor (typed)", async () => {
  const final = await ask([`${GB.short} `, `${GB_URL}`], "what is gradient boosting?");
  assert.ok(final.includes(GB_URL), final);
  assert.equal((final.match(/glossary\/gradient-boosting\//g) ?? []).length, 1, "the link appears once");
});

test("live fix: when the model leaves the link off, the server adds the glossary page", async () => {
  const final = await ask([GB.short], "What is gradient boosting?");
  assert.ok(final.startsWith(GB.short), final);
  assert.ok(final.endsWith(GB_URL), final);
  const other = await ask(["We build custom software. What job eats your week?"], "what do you build?");
  assert.doesNotMatch(other, /\/glossary\//, "only a what-is question about a glossary term gets the link");
});

test("gradient boosting keeps its last sentence: four-sentence definitions are not cut", async () => {
  const sentences = GB.short.split(/(?<=[.!?])\s+/);
  assert.equal(sentences.length, 4, "the entry this guards has four sentences");
  const final = await ask([`Good question. ${GB.short} ${GB_URL}`], "what is gradient boosting");
  assert.ok(final.includes(sentences.at(-1)), `last sentence kept: ${final}`);
  assert.ok(final.includes(GB_URL));
  const prompt = glossaryPrompt("what is gradient boosting?", "/");
  assert.match(prompt, /keep every sentence of the definition/);
  assert.doesNotMatch(prompt, /at most three sentences/);
  const local = glossaryReply("what is gradient boosting?");
  assert.ok(local.includes(sentences.at(-1)) && local.endsWith(GB_URL), local);
  const checked = postCheck(local);
  assert.equal(checked.text, local, "postCheck does not count the bare link as a fifth sentence");
});

test("every published definition fits the reply limits with its link", () => {
  for (const entry of SITE_GLOSSARY) {
    const sentences = entry.short.split(/(?<=[.!?])\s+/).length;
    assert.ok(sentences <= 4, `${entry.term} has ${sentences} sentences`);
    const checked = postCheck(glossaryReply(`what is ${entry.names[0]}?`));
    assert.ok(checked.text.startsWith(entry.short) && checked.text.endsWith(`https://abra-ca-dabra.app${entry.path}`), entry.term);
  }
});

test("voice still leaves a bare link out; typed keeps it after a sentence and not on its own", async () => {
  const parts = ["llms.txt is a file. ", "https://abra-ca-dabra.app/glossary/llms-txt/"];
  assert.equal(await collect(parts, { firstClause: true }), "llms.txt is a file.");
  assert.equal(await collect(parts, { keepLinks: true }), "llms.txt is a file. https://abra-ca-dabra.app/glossary/llms-txt/");
  assert.equal(await collect(["https://abra-ca-dabra.app/glossary/llms-txt/ "], { keepLinks: true }), "", "a link alone is not an answer");
  const long = ["One. ", "Two. ", "Three. ", "Four. ", "https://abra-ca-dabra.app/glossary/llms-txt/ ", "Five."];
  assert.equal(await collect(long, { keepLinks: true, maxSentences: 4 }), "One. Two. Three. Four. https://abra-ca-dabra.app/glossary/llms-txt/");
  assert.ok(isLinkOnly("https://abra-ca-dabra.app/x/.") && !isLinkOnly("See https://abra-ca-dabra.app/x/"));
  assert.equal(glossaryLinkFor("what is llms.txt", "It is a file. https://abra-ca-dabra.app/glossary/llms-txt/"), "");
  assert.equal(glossaryLinkFor("what is llms.txt", "It is a file."), "https://abra-ca-dabra.app/glossary/llms-txt/");
  assert.equal(glossaryLinkFor("set up llms.txt for me", "Sure."), "");
});

test("invented blog posts are repaired to the real post or sent to the Notes index, never passed through", () => {
  assert.equal(sitePageKnown("https://abra-ca-dabra.app/blog/what-is-llms-txt/"), true);
  assert.equal(sitePageKnown("https://abra-ca-dabra.app/blog/what-is-an-llms-txt-file/"), false);
  assert.equal(closestPost("/blog/what-is-an-llms-txt-file"), "/blog/what-is-llms-txt/");
  assert.equal(closestPost("/blog/ai-readiness-checklist-guide"), "/blog/ai-readiness-checklist/");
  assert.equal(closestPost("/blog/best-pizza-in-toronto"), null);
  assert.equal(closestPost("/blog/ai"), null, "one word is not enough to guess");
  const repaired = postCheck("Our note covers it: https://abra-ca-dabra.app/blog/what-is-an-llms-txt-file/.");
  assert.match(repaired.text, /https:\/\/abra-ca-dabra\.app\/blog\/what-is-llms-txt\/\./);
  assert.ok(repaired.flags.includes("unknown_page"));
  const unknown = postCheck("Read https://abra-ca-dabra.app/blog/best-pizza-in-toronto/ for that.");
  assert.match(unknown.text, /https:\/\/abra-ca-dabra\.app\/blog\/ for that\./);
  assert.match(postCheck("See https://abra-ca-dabra.app/blog/why-we-build-on-cloudflare/ now.").text, /blog\/why-we-build-on-cloudflare\/ now/);
});

test("batch 2 terms match by name, and everyday words do not pull them in", () => {
  assert.deepEqual(names("what is a crawler?"), ["Crawler (bot)"]);
  assert.deepEqual(names("are you a bot?"), [], "'bot' alone is not the crawler entry");
  assert.deepEqual(names("what is HQ"), ["HQ"]);
  assert.deepEqual(names("what's an answer engine"), ["Answer engine"]);
  assert.deepEqual(names("what is answer engine optimization"), ["Answer engine optimization (AEO)"]);
  assert.deepEqual(names("what is BPA?"), ["Business process automation (BPA)"]);
  assert.deepEqual(names("what is the Readiness Check?"), ["Readiness Check"]);
  assert.deepEqual(names("what is AI readiness?"), ["AI readiness"]);
  assert.deepEqual(names("workflow vs AI agent"), ["Workflow", "AI agent"]);
  assert.deepEqual(names("what is gen AI"), ["Generative AI"]);
  assert.deepEqual(names("what is AI search visibility"), ["AI visibility (AI search visibility)"]);
  assert.match(glossaryReply("what is an AI citation?"), /glossary\/ai-citation\/$/);
  assert.doesNotMatch(glossaryReply("what is the Readiness Check?"), /\bfree\b/i);
});
