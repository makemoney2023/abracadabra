import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { buildKnowledge } from "../scripts/build-site-knowledge.mjs";
import { SITE_KNOWLEDGE, SITE_PATHS, SITE_WORK, SITE_SERVICES } from "../src/site-knowledge.js";
import { systemPrompt, MAX_TOKENS } from "../src/model.js";
import { postCheck, sitePageKnown } from "../src/policy.js";
import { speakable, TTS_CHAR_CAP } from "../src/voice.js";

const site = new URL("../../../scrollcraft/builds/abracadabra-ai/", import.meta.url);

test("site knowledge is generated from the current marketing source", async () => {
  const { text, paths } = await buildKnowledge();
  assert.equal(SITE_KNOWLEDGE, text, "run npm run knowledge");
  assert.deepEqual(SITE_PATHS, paths);
});

test("knowledge fits the small model and every page it names exists on the site", () => {
  assert.ok(SITE_KNOWLEDGE.length < 12000, `${SITE_KNOWLEDGE.length} chars`);
  assert.ok(SITE_WORK.length >= 6 && SITE_SERVICES.length >= 10);
  for (const path of SITE_PATHS) {
    const file = path.endsWith("/") ? `${path.slice(1)}index.html` : path.slice(1);
    assert.ok(existsSync(new URL(file || "index.html", site)), `missing page ${path}`);
  }
  for (const words of ["StrongFoam", "pirx.ca", "Super Funnel", "WHY CLOUDFLARE", "Priced to the project", "thirty-minute working session", "Readiness Check"]) {
    assert.ok(SITE_KNOWLEDGE.includes(words), words);
  }
  assert.doesNotMatch(SITE_KNOWLEDGE, /\$\s?\d/);
});

test("every case study name in the knowledge appears in the site source", async () => {
  const source = await readFile(new URL("scripts/site-data.mjs", site), "utf8");
  for (const item of SITE_WORK) assert.ok(source.includes(item.name), item.name);
});

test("system prompt carries the facts and the right mode rules", () => {
  const text = systemPrompt({ voice: false });
  const voice = systemPrompt({ voice: true });
  assert.ok(text.includes(SITE_KNOWLEDGE) && voice.includes(SITE_KNOWLEDGE));
  assert.match(text, /Never say we have no portfolio/);
  assert.match(text, /full link/);
  assert.match(voice, /Never say a link/);
  assert.ok(MAX_TOKENS >= 200 && MAX_TOKENS <= 300);
});

test("answer filter keeps the first four sentences, not the closing offer, and real names", () => {
  const long = postCheck("We built the StrongFoam CRM. We built pirx.ca. We did Milrcorr. We did Renew Implants. We made the Super Funnel app. You can book a thirty-minute working session right here in this chat.");
  assert.equal(long.text, "We built the StrongFoam CRM. We built pirx.ca. We did Milrcorr. We did Renew Implants.");
  assert.ok(long.flags.includes("length"));
  assert.deepEqual(postCheck("Our LLM Leverage course helps.").flags, []);
  assert.match(postCheck("We leverage synergy.").text, /job that takes the most time/);
  assert.equal(postCheck("Tools, e.g. a CRM. It helps. It runs. It is yours.").text, "Tools, e.g. a CRM. It helps. It runs. It is yours.");
});

test("answer filter never lets the bot deny its portfolio or call the work free", () => {
  for (const bad of ["We don't have any examples to share yet.", "I have no portfolio to show.", "We don't charge any money for our services."]) {
    const out = postCheck(bad);
    assert.ok(out.flags.includes("false_claim"), bad);
    assert.match(out.text, /StrongFoam/);
  }
});

test("links to our own site must be real pages", () => {
  assert.equal(sitePageKnown("https://abra-ca-dabra.app/portfolio/pirx/"), true);
  assert.equal(sitePageKnown("https://abra-ca-dabra.app/blog/some-post/"), true);
  assert.equal(sitePageKnown("https://check.abra-ca-dabra.app/"), true);
  assert.equal(sitePageKnown("https://abra-ca-dabra.app/process"), false);
  const out = postCheck("See https://abra-ca-dabra.app/why-cloudflare for more.");
  assert.ok(out.flags.includes("unknown_page"));
  assert.match(out.text, /https:\/\/abra-ca-dabra\.app\/ /);
});

test("voice text never reads a link, path or bullet aloud", () => {
  const said = speakable("We built: - StrongFoam CRM/ERP (https://abra-ca-dabra.app/portfolio/strongfoam-crm/). * pirx.ca (/portfolio/pirx/). See check.abra-ca-dabra.app.");
  assert.doesNotMatch(said, /https?:|\/portfolio|(^|\s)[-*]\s/);
  assert.match(said, /CRM and ERP/);
  assert.match(said, /check dot abra-ca-dabra dot app/);
  assert.ok(speakable("word ".repeat(200)).length <= TTS_CHAR_CAP);
});

test("page paths copied from the facts become real links", () => {
  const out = postCheck("Try custom apps (/services/custom-apps/). Or see /portfolio/pirx/ and (/made-up/).");
  assert.equal(out.text, "Try custom apps https://abra-ca-dabra.app/services/custom-apps/. Or see https://abra-ca-dabra.app/portfolio/pirx/ and.");
  assert.equal(speakable(out.text), "Try custom apps. Or see and.");
});
