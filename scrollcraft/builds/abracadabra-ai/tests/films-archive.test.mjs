import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Measured 2026-10-07 with ffprobe. Seconds are rounded. */
const cuts = [
  {
    slug: "superfunnel-getting-started",
    heading: "Getting started",
    duration: "PT1M6S",
    seconds: 66,
  },
  {
    slug: "superfunnel-working-a-lead",
    heading: "Working a lead",
    duration: "PT44S",
    seconds: 44,
  },
  {
    slug: "superfunnel-quiz-lead-samples",
    heading: "Quiz lead, samples",
    duration: "PT1M2S",
    seconds: 62,
  },
  {
    slug: "superfunnel-quiz-lead-no-samples",
    heading: "Quiz lead, no samples",
    duration: "PT56S",
    seconds: 56,
  },
  {
    slug: "superfunnel-follow-ups-activity",
    heading: "Follow-ups and Activity",
    duration: "PT56S",
    seconds: 56,
  },
  {
    slug: "superfunnel-my-page-card-funnels",
    heading: "My Page, card, and funnels",
    duration: "PT1M26S",
    seconds: 86,
  },
  {
    slug: "superfunnel-social",
    heading: "Social",
    duration: "PT1M10S",
    seconds: 70,
  },
  {
    slug: "superfunnel-team-settings",
    heading: "Team and settings",
    duration: "PT1M4S",
    seconds: 64,
  },
];

test("films archive plays the eight Super Funnel walkthroughs", () => {
  const html = readFileSync(join(root, "films.html"), "utf8");
  const description = html.match(
    /<meta name="description" content="([^"]*)">/,
  )?.[1];

  assert.ok(description, "films page has a meta description");
  assert.ok(
    description.length <= 160,
    `description is ${description.length} characters`,
  );
  assert.match(html, /dateModified": "2026-10-07"/);
  assert.equal((html.match(/"@type": "VideoObject"/g) || []).length, 17);

  for (const cut of cuts) {
    const src = `assets/films/${cut.slug}.mp4`;
    const poster = `assets/${cut.slug}.webp`;
    assert.match(html, new RegExp(`src="${src}"`));
    assert.match(html, new RegExp(`poster="${poster}"`));
    assert.match(html, new RegExp(`#${cut.slug}`));
    assert.match(html, new RegExp(`"duration": "${cut.duration}"`));
    assert.match(html, new RegExp(`>${cut.heading}<`));
    assert.equal(existsSync(join(root, src)), true, `${src} is on disk`);
    assert.equal(existsSync(join(root, poster)), true, `${poster} is on disk`);
  }
});

test("the scroll flight stays the four shipped systems", () => {
  const html = readFileSync(join(root, "walkthrough.html"), "utf8");
  assert.equal(html.includes("superfunnel"), false);
});

test("sitemap lists the Super Funnel cuts with measured durations", () => {
  const xml = readFileSync(join(root, "sitemap.xml"), "utf8");
  assert.match(
    xml,
    /<loc>https:\/\/abra-ca-dabra\.app\/films\.html<\/loc>\s*<lastmod>2026-10-07<\/lastmod>/,
  );
  for (const cut of cuts) {
    assert.match(
      xml,
      new RegExp(
        `<video:content_loc>https://abra-ca-dabra\\.app/assets/films/${cut.slug}\\.mp4</video:content_loc>\\s*<video:duration>${cut.seconds}</video:duration>`,
      ),
    );
  }
});
