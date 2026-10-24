// Search Console indexing guards: one URL per page, a clean sitemap, and no thin or orphaned pages.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const SITE = "https://abra-ca-dabra.app";

function rules() {
  const map = new Map();
  for (const raw of read("_redirects").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    assert.ok(parts.length === 2 || parts.length === 3, `rule has source, destination and code: ${line}`);
    const [from, to, code = "302"] = parts;
    assert.ok(!from.includes("*") && !/:[A-Za-z]/.test(from), `static rules only, no splats: ${line}`);
    if (!map.has(from)) map.set(from, { to, code: Number(code) });
  }
  return map;
}

const RULES = rules();
const isFile = (path) => !path.endsWith("/") && existsSync(join(root, path)) && statSync(join(root, path)).isFile();

/** What a request for this path gets: Cloudflare applies only the first matching rule. */
function resolve(path) {
  const rule = RULES.get(path);
  if (rule) {
    if (rule.code === 200) return { status: isFile(rule.to) ? 200 : 404, to: rule.to };
    return { status: rule.code, to: rule.to };
  }
  return { status: isFile(path) ? 200 : 404, to: path };
}

function htmlFiles(dir = root, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) htmlFiles(path, out);
    else if (name.endsWith(".html")) out.push(path.slice(root.length + 1));
  }
  return out;
}

const canonicalOf = (html) => html.match(/<link rel="canonical" href="https:\/\/abra-ca-dabra\.app([^"]*)"/)?.[1];

test("_redirects stays inside the Cloudflare limits", () => {
  assert.ok(RULES.size <= 2000, `${RULES.size} static rules`);
});

test("every 301 lands on a page that answers 200, never on another redirect", () => {
  for (const [from, { to, code }] of RULES) {
    if (code === 200) continue;
    const target = to.split("#")[0] || "/";
    assert.notEqual(target, from, `${from} redirects to itself`);
    assert.equal(resolve(target).status, 200, `${from} -> ${to}`);
  }
});

test("every page answers on its canonical URL only; the other variants 301 to it", () => {
  for (const file of htmlFiles().filter((path) => path.endsWith("index.html"))) {
    const canonical = canonicalOf(read(file));
    if (!canonical) continue;
    const dir = `/${file.slice(0, -"index.html".length)}`;
    assert.equal(resolve(canonical).status, 200, `${canonical} answers 200`);
    for (const variant of new Set([dir, dir.replace(/\/$/, "") || "/", `/${file}`])) {
      if (variant === canonical) continue;
      const result = resolve(variant);
      assert.ok([301, 308].includes(result.status), `${variant} should 301 to ${canonical}, got ${result.status}`);
      assert.equal(result.to, canonical, `${variant} redirects to the canonical`);
    }
  }
});

test("the sitemap lists only indexable URLs that answer 200 on their canonical", () => {
  const xml = read("sitemap.xml");
  const locs = [...xml.matchAll(/<loc>https:\/\/abra-ca-dabra\.app([^<]*)<\/loc>/g)].map((match) => match[1] || "/");
  assert.ok(locs.length > 50);
  assert.equal(locs.includes("/start/thanks/"), false, "noindex confirmation page stays out of the sitemap");
  for (const loc of locs) {
    const result = resolve(loc);
    assert.equal(result.status, 200, `${loc} answers 200`);
    const html = read(result.to.replace(/^\//, ""));
    assert.equal(canonicalOf(html), loc, `${loc} is its own canonical`);
    assert.doesNotMatch(html.match(/<meta name="robots" content="([^"]*)"/)?.[1] || "", /noindex/, `${loc} is indexable`);
  }
  assert.match(read("start/thanks/index.html"), /<meta name="robots" content="noindex">/);
});

test("internal links point at canonical URLs, not at redirects", () => {
  for (const file of htmlFiles()) {
    for (const [, raw] of read(file).matchAll(/href="([^"]+)"/g)) {
      let href = raw.startsWith(SITE) ? raw.slice(SITE.length) || "/" : raw;
      if (!href.startsWith("/") || href.startsWith("//")) continue;
      href = href.split("#")[0].split("?")[0];
      if (!href || href.startsWith("/assets/") || href.startsWith("/api/")) continue;
      if (href === "/faq" || href === "/faq/") continue;
      assert.equal(resolve(href).status, 200, `${file} links to ${raw}`);
    }
  }
});

test("every case study links to the others (pirx.ca aside), and the films page has internal links", () => {
  const slugs = readdirSync(join(root, "portfolio")).filter((name) => existsSync(join(root, "portfolio", name, "index.html")));
  assert.ok(slugs.length >= 5);
  // pirx.ca is listed on /portfolio/ and linked site-wide; it keeps its phone-height budget.
  for (const slug of slugs.filter((name) => name !== "pirx")) {
    const html = read(`portfolio/${slug}/index.html`);
    assert.match(html, /<p class="fine case-more"><strong>More case studies:<\/strong>/, `${slug} has More case studies`);
    for (const other of slugs.filter((name) => name !== slug)) {
      assert.ok(html.includes(`href="/portfolio/${other}/"`), `${slug} links to ${other}`);
    }
  }
  const linkingToFilms = htmlFiles().filter((file) => file !== "films.html" && read(file).includes('href="/films.html"'));
  assert.ok(linkingToFilms.length >= 3, `films.html is linked from ${linkingToFilms.join(", ")}`);
});

test("the walkthrough carries real text in the HTML, not only after scripts run", () => {
  const html = read("walkthrough.html");
  assert.equal(html.includes("<noscript>"), false, "the page text is not hidden in noscript");
  const main = html.match(/<main class="sw-about"[\s\S]*?<\/main>/)?.[0];
  assert.ok(main, "walkthrough has a server-rendered text section");
  const text = main.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  assert.ok(text.split(" ").length >= 200, `${text.split(" ").length} words`);
  assert.ok((main.match(/<h2>/g) || []).length >= 2);
  assert.ok((main.match(/<h3>/g) || []).length >= 3);
  for (const href of ["/products/schema/", "/course/llm-leverage/", "/portfolio/schema/", "/portfolio/llm-leverage/", "/films.html", "/start/"]) {
    assert.ok(main.includes(`href="${href}"`), `walkthrough links to ${href}`);
  }
  assert.equal(/\u2014/.test(main), false, "no em dashes");
  assert.equal(/\bfree\b/i.test(main), false, "never free");
});
