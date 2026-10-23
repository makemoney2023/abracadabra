import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { LISTED_CASE_SLUGS } from "../scripts/site-data.mjs";
import { SF_FILMS } from "../scripts/super-funnel-case.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const page = read("portfolio/super-funnel/index.html");

/** Our own copy: the page without video/source attributes (the films carry their own burned-in text). */
function ownCopy(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ");
}

test("the Case studies listing shows pirx.ca and the Super Funnel System", () => {
  assert.deepEqual(LISTED_CASE_SLUGS, ["pirx", "super-funnel"]);
  const hub = read("portfolio/index.html");
  const cards = [...hub.matchAll(/<li><a href="\/portfolio\/([a-z-]+)\/">/g)].map((match) => match[1]);
  assert.deepEqual(cards, ["pirx", "super-funnel"]);
  assert.match(hub, /<strong>Super Funnel System<\/strong>/);
  const list = JSON.parse(hub.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])["@graph"].find((node) => node["@type"] === "ItemList");
  assert.equal(list.numberOfItems, 2);
  assert.deepEqual(list.itemListElement.map((item) => item.url), ["https://abra-ca-dabra.app/portfolio/pirx/", "https://abra-ca-dabra.app/portfolio/super-funnel/"]);
  assert.equal(/Milrcorr|StrongFoam|Renew Implants/.test(ownCopy(hub).replace(/<nav[\s\S]*?<\/nav>/g, "")), false);
});

test("the case study page has breadcrumb, hero, snapshot, flow, films, diagram and a next step", () => {
  assert.match(page, /<title>Super Funnel System \| Abracadabra AI<\/title>/);
  assert.match(page, /<li><a href="\/">Home<\/a><\/li><li><a href="\/portfolio\/">Case studies<\/a><\/li><li aria-current="page">Super Funnel System<\/li>/);
  assert.match(page, /<h1>Every link an associate shares ends in a credited, followed-up lead\.<\/h1>/);
  assert.match(page, /class="sf-case__snapshot"/);
  assert.equal((page.match(/class="metric"/g) || []).length, 3);
  assert.match(page, /One lead, start to finish\./);
  assert.equal((page.match(/<li><span>0\d<\/span><div><h3>/g) || []).length, 7);
  assert.match(page, /\/assets\/super-funnel\/super-funnel-system-architecture\.webp/);
  assert.equal(existsSync(join(root, "assets/super-funnel/super-funnel-system-architecture.webp")), true);
  assert.ok(statSync(join(root, "assets/super-funnel/super-funnel-system-architecture.webp")).size < 150_000);
  assert.match(page, /href="\/start\/">Start a project/);
  assert.equal(page.includes("Diagram: see"), false);
});

test("the eight films are embedded lazily with posters, grouped in chapters, with JSON-LD and sitemap entries", () => {
  assert.equal(SF_FILMS.length, 8);
  const videos = [...page.matchAll(/<video\b[^>]*>/g)].map((match) => match[0]);
  assert.equal(videos.length, 8);
  for (const film of SF_FILMS) {
    const tag = videos.find((video) => video.includes(`src="/assets/films/superfunnel-${film.slug}.mp4"`));
    assert.ok(tag, film.slug);
    assert.match(tag, /controls/);
    assert.match(tag, /playsinline/);
    assert.match(tag, /preload="none"/);
    assert.equal(/autoplay/.test(tag), false);
    assert.match(tag, new RegExp(`poster="/assets/films/thumbs/superfunnel-${film.slug}\\.jpg"`));
    assert.equal(existsSync(join(root, `assets/films/superfunnel-${film.slug}.mp4`)), true);
    assert.equal(existsSync(join(root, `assets/films/thumbs/superfunnel-${film.slug}.jpg`)), true);
  }
  assert.equal((page.match(/<div class="sf-chapter(?: sf-chapter--single)?">/g) || []).length, 4);
  const graph = JSON.parse(page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])["@graph"];
  const nodes = graph.filter((node) => node["@type"] === "VideoObject");
  assert.equal(nodes.length, 8);
  for (const node of nodes) for (const key of ["name", "description", "thumbnailUrl", "contentUrl", "duration", "uploadDate"]) assert.ok(node[key], `${node["@id"]} ${key}`);
  const sitemap = read("sitemap.xml");
  const block = sitemap.match(/<url>\s*<loc>https:\/\/abra-ca-dabra\.app\/portfolio\/super-funnel\/<\/loc>[\s\S]*?<\/url>/)[0];
  assert.equal((block.match(/<video:video>/g) || []).length, 8);
  // The films page keeps its own entries and files.
  assert.ok(sitemap.includes("https://abra-ca-dabra.app/films.html"));
  assert.equal((read("films.html").match(/superfunnel-[a-z-]+\.mp4/g) || []).length >= 8, true);
});

test("the page never says Zernio and its own copy never says free or promises income or scores", () => {
  assert.equal(/zernio/i.test(page), false);
  const copy = ownCopy(page);
  assert.equal(/\bfree\b/i.test(copy), false, "no 'free' in our copy");
  assert.equal(/\b(?:guarantee[ds]?|passive income|earn(?:ings)?|get rich)\b/i.test(copy), false);
  assert.equal(/\b\d+\s*%/.test(copy), false, "no percentages promised");
  for (const file of ["llms.txt", "llms-full.txt", "sitemap.xml", "portfolio/index.html"]) assert.equal(/zernio/i.test(read(file)), false, file);
  assert.match(copy, /social posting service|Social studio/);
});

test("Super Funnel System stays out of /products/ and the nav no longer links Films", () => {
  assert.equal(/super-funnel/i.test(read("products/index.html")), false);
  for (const file of ["index.html", "portfolio/index.html", "portfolio/super-funnel/index.html", "about/index.html", "404.html", "blog/index.html", "services/index.html", "products/index.html"]) {
    const html = read(file);
    assert.equal(/<a href="\/films\.html">Films<\/a>/.test(html), false, `${file} has no Films nav or footer link`);
    assert.match(html, /<a href="\/portfolio\/">Case studies<\/a>/, file);
  }
  assert.equal(existsSync(join(root, "films.html")), true);
  assert.ok(read("llms.txt").includes("https://abra-ca-dabra.app/films.html"));
  assert.ok(read("sitemap.xml").includes("https://abra-ca-dabra.app/films.html"));
});

test("the About page links Super Funnel to its case study, not the films page", () => {
  const about = read("about/index.html");
  assert.match(about, /<li><a href="\/portfolio\/super-funnel\/">Super Funnel<\/a>: a sales app for independent associates, shown in eight short films\.<\/li>/);
  assert.equal(about.includes('href="/films.html"'), false);
});
