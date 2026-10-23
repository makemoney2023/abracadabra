import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const strip = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ");
const home = read("index.html");
const section = home.match(/<section id="hq-video"[\s\S]*?<\/section>/)[0];

test("#hq-video is a new section right after #name and before #compiler", () => {
  const name = home.indexOf('<section id="name"');
  const script = home.indexOf('<script src="/assets/name-reveal.js');
  const video = home.indexOf('<section id="hq-video"');
  const compiler = home.indexOf('<section id="compiler"');
  const time = home.indexOf('<section id="time"');
  assert.ok(name > -1 && script > name && video > script && compiler > video && time > compiler);
  // Nothing but whitespace, markers and the video script sits between the #name script and #hq-video.
  const between = home.slice(script, video).replace(/<script src="\/assets\/name-reveal\.js[^>]*><\/script>|<!--[\s\S]*?-->|\s+/g, "");
  assert.equal(between, "");
  assert.equal(home.split('id="hq-video"').length - 1, 1);
});

test("#hq-video is exactly one small viewport tall and full bleed", () => {
  const css = read("assets/hq.css");
  const rule = css.match(/\.hq-video \{[^}]*\}/)[0];
  assert.match(rule, /height: 100vh;\s*height: 100svh;/);
  assert.match(rule, /width: 100%/);
  assert.match(rule, /margin: 0/);
  assert.match(rule, /padding: 0/);
  assert.equal(/max-width|margin-inline/.test(rule), false, "no gutters");
  assert.match(css, /@media \(min-aspect-ratio: 17\/10\) and \(max-aspect-ratio: 37\/20\)/);
  assert.match(css, /object-fit: contain/);
  assert.match(css, /object-fit: cover/);
  assert.match(read("assets/restored-motion.css"), /html\.name-live #name\.name-pin \{ height: 140vh;/);
});

test("#hq-video markup: lazy muted video, controls, links, accessible name and summary", () => {
  assert.match(section, /aria-labelledby="hq-video-title"/);
  assert.match(section, /<video [^>]*\bmuted\b[^>]*\bloop\b[^>]*\bplaysinline\b[^>]*preload="metadata"/);
  assert.equal(/<video [^>]*\ssrc=/.test(section), false, "no src until the script loads it in view");
  assert.equal(/\bautoplay\b/.test(section), false);
  assert.match(section, /data-src-landscape="\/assets\/video\/[^"]+\.mp4"/);
  assert.match(section, /data-src-portrait="\/assets\/video\/[^"]+\.mp4"/);
  assert.match(section, /<button type="button" class="hq-video__toggle"[^>]*aria-label="Play the HQ product video"/);
  assert.match(section, /<a href="\/products\/hq\/">Meet HQ<\/a>/);
  assert.match(section, /<a href="\/blog\/how-client-work-flows-through-hq">How client work moves through HQ<\/a>/);
  const text = strip(section);
  assert.match(text, /digital workers/);
  for (const bad of [/\bfree\b/i, /\bbrief\b/i, /\bscores?\b/i, /zernio|grok|openai|anthropic|gemini|claude|gpt|veo|seedance/i, /commercial/i, /\$\d|\d+%/]) {
    assert.equal(bad.test(text), false, `${bad} must not appear`);
  }
  assert.match(home, /<script src="\/assets\/hq-video\.js\?v=\w+" defer><\/script>/);
});

test("the video script honors reduced motion, Save-Data and the half-in-view rule", () => {
  const js = read("assets/hq-video.js");
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(js, /saveData/);
  assert.match(js, /intersectionRatio >= 0\.5/);
  assert.match(js, /max-aspect-ratio: 1\/1/);
});

test("video files exist, stay under 6 MB, and the graph and sitemap read the same paths", () => {
  const nodes = JSON.parse(home.match(/<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/)[1])["@graph"];
  const video = nodes.find((n) => n["@id"] === "https://abra-ca-dabra.app/#video-hq-product");
  assert.equal(video["@type"], "VideoObject");
  assert.equal(video.duration, "PT56S");
  assert.equal(video.uploadDate, "2026-10-23");
  for (const key of ["name", "description", "thumbnailUrl", "contentUrl"]) assert.ok(video[key], key);
  assert.equal(/aggregateRating|"offers"|"review"/.test(JSON.stringify(video)), false);
  for (const url of [video.thumbnailUrl, video.contentUrl]) {
    const path = url.replace("https://abra-ca-dabra.app/", "");
    assert.ok(statSync(join(root, path)).size < 6 * 1024 * 1024, path);
  }
  const attr = (n) => section.match(new RegExp(`data-src-${n}="([^"]+)"`))[1];
  assert.equal(`https://abra-ca-dabra.app${attr("landscape")}`, video.contentUrl);
  assert.ok(statSync(join(root, attr("portrait").slice(1))).size < 6 * 1024 * 1024);
  // With no approved vertical cut, portrait screens use the landscape file and cover is not applied to them.
  if (attr("portrait") === attr("landscape")) assert.equal(section.includes("hq-video--has-portrait"), false);
  const xml = read("sitemap.xml");
  assert.ok(xml.includes(`<video:content_loc>${video.contentUrl}</video:content_loc>`));
  assert.ok(xml.includes("<video:duration>56</video:duration>"));
  const page = nodes.find((n) => n["@id"] === "https://abra-ca-dabra.app/#webpage");
  assert.equal(page.video["@id"], video["@id"]);
});
