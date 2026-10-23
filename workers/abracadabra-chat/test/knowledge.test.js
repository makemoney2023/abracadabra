import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { buildKnowledge, pagePath, sitemapPaths } from "../scripts/build-site-knowledge.mjs";
import { SITE_KNOWLEDGE, SITE_KNOWLEDGE_VERSION, SITE_PATHS, SITE_PRODUCTS, SITE_WORK, SITE_SERVICES } from "../src/site-knowledge.js";
import { systemPrompt, MAX_TOKENS } from "../src/model.js";
import { localReply, namedPage, postCheck, sitePageKnown } from "../src/policy.js";
import { KEYTERMS, speakable, TTS_CHAR_CAP } from "../src/voice.js";

const site = new URL("../../../scrollcraft/builds/abracadabra-ai/", import.meta.url);

test("site knowledge is generated from the current marketing source", async () => {
  const { text, paths, version } = await buildKnowledge();
  assert.equal(SITE_KNOWLEDGE, text, "run npm run knowledge");
  assert.deepEqual(SITE_PATHS, paths);
  assert.equal(SITE_KNOWLEDGE_VERSION, version);
});

test("--check passes on a current file (npm run deploy runs it first)", () => {
  const out = execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/build-site-knowledge.mjs", import.meta.url)), "--check"], { encoding: "utf8" });
  assert.match(out, /is current/);
});

test("every page in the published sitemap is in the chat's knowledge", async () => {
  const sitemap = (await sitemapPaths()).filter((path) => path !== "/start/thanks/");
  assert.ok(sitemap.length >= 50, `${sitemap.length} sitemap pages`);
  for (const path of sitemap) {
    assert.ok(SITE_PATHS.includes(path), `sitemap page ${path} is missing from the chat knowledge (npm run knowledge)`);
    assert.ok(SITE_KNOWLEDGE.includes(`| ${path}`), `no knowledge line for ${path}`);
  }
  assert.equal(pagePath("https://abra-ca-dabra.app/blog/what-is-an-ai-agent"), "/blog/what-is-an-ai-agent/");
});

test("every product, the course and every case study on the site is named, with its own page", async () => {
  const data = await import(new URL("scripts/site-data.mjs", site));
  for (const card of data.productCards) assert.ok(SITE_PRODUCTS.some((item) => item.name === card.name), `product ${card.name}`);
  for (const item of data.cases) assert.ok(SITE_WORK.some((work) => work.name === item.name), `case ${item.name}`);
  for (const [name, path] of [["HQ", "/products/hq/"], ["Schema", "/products/schema/"], ["LLM Leverage", "/course/llm-leverage/"], ["Super Funnel System", "/portfolio/super-funnel/"], ["pirx.ca", "/portfolio/pirx/"]]) {
    assert.ok([...SITE_PRODUCTS, ...SITE_WORK].some((item) => item.name === name && item.path === path), `${name} at ${path}`);
  }
  assert.ok(!SITE_PATHS.includes("/products/super-funnel/"), "Super Funnel is a case study, not a product page");
});

test("knowledge carries what the HQ, Schema, Super Funnel and Readiness Check pages say", () => {
  for (const words of ["HQ DETAIL", "client workspace", "digital workers", "Client Services", "you have approved it", "LinkedIn", "Bluesky", "start with the Readiness Check or a project", "SCHEMA DETAIL", "schema.abra-ca-dabra.app", "answer engines", "Pricing on request", "SUPER FUNNEL DETAIL", "nine-step pipeline", "Eight film tours", "five to seven minutes", "check.abra-ca-dabra.app"]) {
    assert.ok(SITE_KNOWLEDGE.includes(words), words);
  }
  // Never call the Readiness Check (or anything) free, and no prices.
  assert.doesNotMatch(SITE_KNOWLEDGE, /\bfree\b|no cost|\$\s?\d/i);
  // Words the answer filter treats as jargon would get a correct answer replaced.
  assert.doesNotMatch(SITE_KNOWLEDGE.replace(/LLM[\s-]Leverage/gi, ""), /\b(leverage|synergy|utilize|paradigm|holistic|robust|seamless|cutting-edge|unlock|empower)\b/i);
});

test("the reply used when the model is down still knows each product by name", () => {
  assert.equal(namedPage("Tell me about HQ")?.path, "/products/hq/");
  assert.equal(namedPage("what's the super funnel?")?.path, "/portfolio/super-funnel/");
  assert.equal(namedPage("What is Schema")?.path, "/products/schema/");
  assert.equal(namedPage("tell me about headquarters"), null);
  const hq = localReply("Tell me about HQ");
  assert.match(hq, /client workspace/);
  assert.match(hq, /https:\/\/abra-ca-dabra\.app\/products\/hq\//);
  assert.deepEqual(postCheck(hq).flags, []);
});

test("voice hears the product names and answers from the same knowledge", () => {
  for (const term of ["HQ", "Schema", "Super Funnel", "LLM Leverage", "Readiness Check"]) assert.ok(KEYTERMS.includes(term), term);
  assert.match(systemPrompt({ voice: true }), /HQ DETAIL/);
});

test("knowledge fits the small model and every page it names exists on the site", () => {
  assert.ok(SITE_KNOWLEDGE.length < 16000, `${SITE_KNOWLEDGE.length} chars`);
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

test("knowledge carries the PIRX app and MCP facts in the locked words", () => {
  for (const words of ["We designed and built the PIRX app", "Projected Time", "Supported Range", "Structural Drivers", "Aerobic Base", "Threshold Density", "Speed Exposure", "Running Economy", "Load Consistency", "gradient boosting", "not medical advice", "398K search impressions", "Model Context Protocol", "approval before any change"]) {
    assert.ok(SITE_KNOWLEDGE.includes(words), words);
  }
  assert.ok(SITE_PATHS.includes("/services/machine-learning/") && SITE_PATHS.includes("/services/mcp-connectors/"));
  assert.equal(sitePageKnown("https://abra-ca-dabra.app/services/mcp-connectors/"), true);
  assert.doesNotMatch(SITE_KNOWLEDGE, /97\.4|\d+(\.\d+)?\s?% accura|Personal Record|form score/i);
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
  for (const bad of ["We don't have any examples to share yet.", "I have no portfolio to show."]) {
    const out = postCheck(bad);
    assert.ok(out.flags.includes("false_claim"), bad);
    assert.match(out.text, /StrongFoam/);
  }
  for (const bad of ["We don't charge any money for our services.", "Yes, the Readiness Check is free.", "You can take it for free."]) {
    const out = postCheck(bad);
    assert.ok(out.flags.includes("false_claim"), bad);
    assert.doesNotMatch(out.text, /\bfree\b/i);
    assert.match(out.text, /Readiness Check takes five to seven minutes/);
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
