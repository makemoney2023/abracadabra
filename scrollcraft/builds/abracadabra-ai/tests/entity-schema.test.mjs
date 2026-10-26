// Entity schema for abra-ca-dabra.app (card af12f861): one #org entity on every page,
// verified sameAs only, no invented address or person, and @id references that resolve.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ORG_DISAMBIGUATION, ORG_ID, ORG_SAME_AS, orgNode } from "../scripts/entity.mjs";
import { offerings } from "../scripts/site-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const SKIP = new Set(["node_modules", "content", "scripts", "tests", "worker", "assets"]);

function htmlFiles(dir = root) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...htmlFiles(path));
    else if (name.endsWith(".html")) out.push(relative(root, path));
  }
  return out.sort();
}

function graphs(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}

/** Nodes carry an @id plus data; references are objects with only an @id. */
function collect(value, nodes, refs) {
  if (Array.isArray(value)) value.forEach((item) => collect(item, nodes, refs));
  else if (value && typeof value === "object") {
    if (typeof value["@id"] === "string") {
      if (Object.keys(value).length === 1) refs.push(value["@id"]);
      else nodes.push(value);
    }
    Object.values(value).forEach((item) => collect(item, nodes, refs));
  }
}

function pageGraph(path) {
  const nodes = [];
  const refs = [];
  for (const graph of graphs(read(path))) collect(graph, nodes, refs);
  return { nodes, refs };
}

const pages = htmlFiles();

test("every page's JSON-LD parses, has no duplicate @id and every @id reference resolves on the page", () => {
  assert.ok(pages.length > 40, `expected the built site, found ${pages.length} pages`);
  for (const path of pages) {
    const { nodes, refs } = pageGraph(path);
    const ids = nodes.map((node) => node["@id"]);
    const dupes = ids.filter((id, index) => ids.indexOf(id) !== index);
    assert.deepEqual(dupes, [], `${path} repeats ${dupes.join(", ")}`);
    const missing = [...new Set(refs.filter((ref) => !ids.includes(ref)))];
    assert.deepEqual(missing, [], `${path} points at ${missing.join(", ")} but never defines it`);
  }
});

test("every page carries the same #org entity, and the homepage only adds to it", () => {
  const shared = orgNode();
  let withOrg = 0;
  for (const path of pages) {
    const org = pageGraph(path).nodes.find((node) => node["@id"] === ORG_ID);
    if (!org) continue;
    withOrg += 1;
    for (const [key, value] of Object.entries(shared)) {
      assert.deepEqual(org[key], value, `${path} #org ${key} differs from scripts/entity.mjs`);
    }
    if (path !== "index.html") assert.deepEqual(Object.keys(org).sort(), Object.keys(shared).sort(), `${path} #org has extra keys`);
  }
  assert.ok(withOrg >= pages.length - 2, `only ${withOrg} of ${pages.length} pages carry #org`);
});

test("#org separates this studio from other Abracadabras without inventing anything", () => {
  const org = orgNode();
  assert.equal(org["@type"], "Organization");
  assert.ok(org.alternateName.includes("abra-ca-dabra.app"));
  assert.match(ORG_DISAMBIGUATION, /abra-ca-dabra\.app/);
  assert.match(ORG_DISAMBIGUATION, /Schema/);
  assert.match(ORG_DISAMBIGUATION, /HQ/);
  assert.doesNotMatch(ORG_DISAMBIGUATION, /[\u2014\u2013]/, "no em or en dashes in published copy");
  assert.doesNotMatch(ORG_DISAMBIGUATION, /\bfree\b/i);
  // sameAs only for verified profiles; omitted entirely while there are none.
  if (ORG_SAME_AS.length === 0) assert.equal("sameAs" in org, false);
  else assert.deepEqual(org.sameAs, ORG_SAME_AS);
  for (const url of ORG_SAME_AS) assert.match(url, /^https:\/\//);
});

test("no street address, LocalBusiness or Person is marked up until the owner publishes one", () => {
  const banned = new Set(["PostalAddress", "LocalBusiness", "ProfessionalService", "Person"]);
  for (const path of pages) {
    for (const node of pageGraph(path).nodes) {
      const types = [].concat(node["@type"] ?? []);
      assert.equal(types.some((type) => banned.has(type)), false, `${path} ${node["@id"]} is ${types.join(",")}`);
    }
    const org = pageGraph(path).nodes.find((node) => node["@id"] === ORG_ID);
    if (org) {
      assert.equal("address" in org, false, `${path} #org has an address`);
      assert.equal("founder" in org, false, `${path} #org has a founder`);
    }
  }
});

test("the homepage OfferCatalog lists every live service, each with the same @id as its own page", () => {
  const org = pageGraph("index.html").nodes.find((node) => node["@id"] === ORG_ID);
  const catalog = org.hasOfferCatalog;
  assert.equal(catalog["@type"], "OfferCatalog");
  const offered = catalog.itemListElement.map((offer) => offer.itemOffered);
  assert.deepEqual(offered.map((service) => service.url), offerings.map((item) => `https://abra-ca-dabra.app/services/${item.slug}/`));
  for (const service of offered) {
    assert.equal(service["@type"], "Service");
    assert.deepEqual(service.provider, { "@id": ORG_ID });
    const path = `${service.url.replace("https://abra-ca-dabra.app/", "")}index.html`;
    const own = pageGraph(path).nodes.find((node) => node["@id"] === service["@id"]);
    assert.ok(own, `${path} has no ${service["@id"]}`);
    assert.equal(own["@type"], "Service");
    assert.equal(own.name, service.name);
    assert.equal(own.areaServed, service.areaServed);
  }
});

test("blog posts keep the house byline as author and #org as publisher", () => {
  const post = "blog/what-is-an-ai-agent/index.html";
  const { nodes } = pageGraph(post);
  const article = nodes.find((node) => node["@type"] === "BlogPosting");
  assert.deepEqual(article.publisher, { "@id": ORG_ID });
  const author = nodes.find((node) => node["@id"] === article.author["@id"]);
  assert.equal(author.name, "Abracadabra Studio");
  assert.deepEqual(author.parentOrganization, { "@id": ORG_ID });
  assert.match(read(post), /By <a href="\/about\/">Abracadabra Studio<\/a>/);
});
