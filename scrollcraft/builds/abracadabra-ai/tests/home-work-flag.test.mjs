import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SHOW_HOME_WORK } from "../scripts/site-data.mjs";
import { HOME_WORK_HTML, HOME_WORK_LD_IDS, HOME_WORK_LD_TEXT, HOME_WORK_SITEMAP_XML } from "../scripts/home-work.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

function graph() {
  const html = read("index.html");
  const out = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) out.push(...(JSON.parse(m[1])["@graph"] || []));
  return out;
}

test("the section, its JSON-LD and its sitemap entries are kept in code and follow one flag", () => {
  assert.equal(typeof SHOW_HOME_WORK, "boolean");
  assert.match(HOME_WORK_HTML, /^<section id="showcase"/);
  assert.match(HOME_WORK_HTML, /Work that’s already running\./);
  assert.equal((HOME_WORK_HTML.match(/role="tab"/g) || []).length, 5);
  assert.equal(HOME_WORK_LD_TEXT.length, HOME_WORK_LD_IDS.length);
  for (const [i, text] of HOME_WORK_LD_TEXT.entries()) assert.equal(JSON.parse(text)["@id"], HOME_WORK_LD_IDS[i]);
  assert.equal((HOME_WORK_SITEMAP_XML.match(/<video:video>/g) || []).length, 2);

  const index = read("index.html");
  const ids = graph().map((node) => node["@id"]);
  const webpage = graph().find((node) => node["@type"] === "WebPage");
  const sitemap = read("sitemap.xml");
  if (SHOW_HOME_WORK) {
    assert.ok(index.includes(HOME_WORK_HTML));
    for (const id of HOME_WORK_LD_IDS) assert.ok(ids.includes(id), id);
    assert.deepEqual(webpage.hasPart, { "@id": "https://abra-ca-dabra.app/#work" });
    assert.ok(sitemap.includes(HOME_WORK_SITEMAP_XML));
  } else {
    assert.equal(index.includes('id="showcase"'), false);
    assert.equal(index.includes("Work that’s already running"), false);
    assert.equal(index.includes("Work that's already running"), false);
    assert.equal(/<button[^>]*role="tab"/.test(index), false);
    assert.equal(index.includes("panel-sell"), false);
    assert.equal(index.includes("superfunnel-getting-started"), false);
    assert.equal(index.includes("strongfoam-loop"), false);
    assert.equal(index.includes("milrcorr-loop"), false);
    for (const id of HOME_WORK_LD_IDS) assert.equal(ids.includes(id), false, id);
    assert.equal("hasPart" in webpage, false);
    const homeEntry = sitemap.match(/<url>\s*<loc>https:\/\/abra-ca-dabra\.app\/<\/loc>[\s\S]*?<\/url>/)[0];
    assert.equal(homeEntry.includes("superfunnel-getting-started"), false);
    assert.equal(homeEntry.includes("llmcourse-home-lesson"), false);
    assert.equal((homeEntry.match(/<video:video>/g) || []).length, 1, "only the HQ video stays on the homepage entry");
    assert.equal(sitemap.includes("superfunnel-getting-started"), true, "the films page entries keep their films");
  }
});

test("nothing on the homepage links to the hidden section, and every in-page anchor has a target", () => {
  const index = read("index.html");
  assert.equal(/href="#(?:showcase|work)"/.test(index), false);
  assert.equal(/aria-controls="panel-/.test(index) && !SHOW_HOME_WORK, false);
  const anchors = [...index.matchAll(/href="#([a-z][a-z0-9-]*)"/g)].map((m) => m[1]);
  for (const anchor of new Set(anchors)) assert.ok(index.includes(`id="${anchor}"`), `#${anchor} has no target`);
  // Every JSON-LD reference to an @id resolves inside the graph.
  const ids = new Set(graph().map((node) => node["@id"]));
  for (const node of graph()) for (const key of ["hasPart", "video", "mainEntity", "isPartOf", "publisher"]) {
    const ref = node[key];
    if (ref && ref["@id"] && ref["@id"].startsWith("https://abra-ca-dabra.app/#")) assert.ok(ids.has(ref["@id"]), `${key} -> ${ref["@id"]}`);
  }
});

test("the client proof strip is its own section and stays", () => {
  const index = read("index.html");
  assert.match(index, /<section id="clients" class="section proof-band"/);
  assert.equal(HOME_WORK_HTML.includes('id="clients"'), false);
});
