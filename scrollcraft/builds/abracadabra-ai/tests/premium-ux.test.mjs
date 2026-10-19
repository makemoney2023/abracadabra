import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { clientProofHtml } from "../scripts/site-pages.mjs";
import { cases } from "../scripts/site-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("proof band renders only real entries and the marquee is labelled as tools", () => {
  assert.equal(clientProofHtml([]), "");
  const proof = JSON.parse(read("content/proof.json"));
  const html = clientProofHtml(proof.entries, cases);
  const names = [...html.matchAll(/class="card__title">([^<]+)/g)].map((match) => match[1]);
  assert.deepEqual(names, ["StrongFoam website", "Milrcorr", "SuperPatch products", "pirx.ca"]);
  for (const entry of proof.entries) {
    assert.match(html, new RegExp(`href="/portfolio/${entry.slug}/"`));
  }
  const pirx = cases.find((item) => item.slug === "pirx");
  for (const figure of pirx.proofFigures) {
    assert.match(html, new RegExp(figure.value.replace(".", "\\.")));
    assert.match(pirx.summary, new RegExp(figure.value.replace(".", "\\.")));
  }
  assert.equal(html.includes("<blockquote"), false);
  assert.match(read("index.html"), /Built with/);
});

test("site tokens are declared once", () => {
  const css = `${read("assets/site.css")}\n${read("blog/blog.css")}`;
  assert.equal(css.includes("--ui-border-color"), false);
  assert.equal((read("assets/site.css").match(/font-size: clamp\(2\.4rem, 4\.2vw, 6\.5rem\)/g) || []).length, 1);
});

test("every page links the shared icon set and manifest", () => {
  const pages = ["index.html", "films.html", "404.html", "services/index.html", "blog/index.html"];
  for (const page of pages) {
    const html = read(page);
    for (const href of ["favicon.svg", "favicon-32.png", "apple-touch-icon.png", "manifest.webmanifest"]) {
      assert.match(html, new RegExp(href), page);
    }
    assert.equal(html.includes("data:image/svg+xml"), false, page);
  }
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.theme_color, "#070706");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
});

test("every page has a 1200x630 jpeg social card", async () => {
  const pages = ["index.html", "films.html", "services/index.html", "blog/index.html", "portfolio/pirx/index.html"];
  for (const page of pages) {
    const html = read(page);
    const image = html.match(/property="og:image" content="([^"]+)"/)[1];
    assert.match(image, /\.jpe?g$/, page);
    assert.match(html, /property="og:image:width" content="1200"/, page);
    assert.match(html, /property="og:image:height" content="630"/, page);
    assert.match(html, /property="og:image:alt"/, page);
    const relative = new URL(image).pathname.slice(1);
    const meta = await sharp(join(root, relative)).metadata();
    assert.equal(meta.width, 1200, relative);
    assert.equal(meta.height, 630, relative);
  }
});
