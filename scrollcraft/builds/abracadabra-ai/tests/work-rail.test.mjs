import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const index = readFileSync(join(root, "index.html"), "utf8");

test("the work rail plays Getting started and no other Super Funnel cut", () => {
  const rail = index.match(
    /<div id="panel-sell"[\s\S]*?<\/div>/,
  );
  assert.ok(rail, "Sell panel is present");
  const videos = [...rail[0].matchAll(/<video\b[^>]*>/g)].map((match) => match[0]);
  assert.equal(videos.length, 1);
  assert.match(videos[0], /controls/);
  assert.match(videos[0], /playsinline/);
  assert.match(videos[0], /preload="none"/);
  assert.match(
    videos[0],
    /poster="assets\/films\/thumbs\/superfunnel-getting-started\.jpg"/,
  );
  assert.match(
    videos[0],
    /src="assets\/films\/superfunnel-getting-started\.mp4"/,
  );
  assert.match(rail[0], />Super Funnel</);
  assert.match(rail[0], /href="films\.html"/);

  for (const slug of [
    "working-a-lead",
    "quiz-lead-samples",
    "quiz-lead-no-samples",
    "follow-ups-activity",
    "my-page-card-funnels",
    "social",
    "team-settings",
  ]) {
    assert.equal(
      index.includes(`superfunnel-${slug}`),
      false,
      `${slug} stays off the homepage`,
    );
  }
});

test("the work list counts Super Funnel as the film on file", () => {
  assert.match(index, /"numberOfItems": 5/);
  assert.match(index, /"name": "Super Funnel"/);
  assert.match(index, /"url": "https:\/\/abra-ca-dabra\.app\/products\/super-funnel\/"/);
  assert.match(index, /"sameAs": "https:\/\/abra-ca-dabra\.app\/films\.html"/);
  assert.match(index, /"dateModified": "2026-10-15"/);
});
