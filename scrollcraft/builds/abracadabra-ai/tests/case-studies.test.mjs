import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const pages = ["index.html", "portfolio/index.html", "products/index.html", "services/index.html", "about/index.html", "films.html", "404.html"];

test("the top nav and footer say Case studies, never Work, on every page", () => {
  for (const page of pages) {
    const html = read(page);
    const links = html.match(/<a href="\/portfolio\/">[^<]*<\/a>/g) ?? [];
    assert.ok(links.some((l) => l.includes(">Case studies<")), `${page} nav`);
    assert.equal(links.some((l) => l.includes(">Work<")), false, `${page} still says Work`);
  }
});

test("the case studies page lists only PiRX and keeps its URL, title and H1", () => {
  const html = read("portfolio/index.html");
  assert.match(html, /<title>Case studies \| Abracadabra AI<\/title>/);
  assert.match(html, /<h1>Case studies\.<\/h1>/);
  const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
  const cards = main.match(/<ul class="cards">[\s\S]*?<\/ul>/)[0];
  assert.deepEqual([...cards.matchAll(/href="([^"]+)"/g)].map((m) => m[1]), ["/portfolio/pirx/"]);
  assert.equal(/super funnel|milrcorr|strongfoam|renew|superpatch/i.test(main), false);
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/)[1])["@graph"];
  const list = graph.find((n) => n["@type"] === "ItemList");
  assert.equal(list.numberOfItems, 1);
  assert.deepEqual(list.itemListElement.map((i) => i.url), ["https://abra-ca-dabra.app/portfolio/pirx/"]);
});

test("other case pages stay reachable by direct URL and are not noindexed", () => {
  for (const slug of ["milrcorr", "strongfoam-website", "super-funnel", "renew-implants", "pirx"]) {
    const path = `portfolio/${slug}/index.html`;
    assert.ok(existsSync(join(root, path)), path);
    assert.equal(/noindex/i.test(read(path)), false, `${slug} noindex`);
  }
  assert.ok(read("sitemap.xml").includes("/portfolio/super-funnel/"));
});
