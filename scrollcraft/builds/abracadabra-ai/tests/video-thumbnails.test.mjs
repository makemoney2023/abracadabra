import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://abra-ca-dabra.app/";

function videoObjects(file) {
  const html = readFileSync(join(root, file), "utf8");
  const out = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const data = JSON.parse(m[1]);
    for (const node of data["@graph"] || [data]) if (node["@type"] === "VideoObject") out.push(node);
  }
  return out;
}

for (const [file, count] of [["index.html", 2], ["films.html", 12]]) {
  test(`${file} VideoObjects carry a crawlable 1280x720 JPG thumbnail`, async () => {
    const videos = videoObjects(file);
    assert.equal(videos.length, count);
    for (const v of videos) {
      for (const key of ["name", "description", "thumbnailUrl", "uploadDate", "contentUrl", "duration"]) {
        assert.ok(v[key], `${v["@id"]} has ${key}`);
      }
      assert.ok(v.thumbnailUrl.startsWith(`${SITE}assets/films/thumbs/`), v.thumbnailUrl);
      const meta = await sharp(join(root, v.thumbnailUrl.slice(SITE.length))).metadata();
      assert.equal(meta.format, "jpeg");
      assert.ok(meta.width >= 1280 && meta.height >= 720, v.thumbnailUrl);
    }
  });
}

test("every sitemap video thumbnail is a JPG under assets/films/thumbs", () => {
  const xml = readFileSync(join(root, "sitemap.xml"), "utf8");
  const locs = [...xml.matchAll(/<video:thumbnail_loc>([^<]+)</g)].map((m) => m[1]);
  assert.equal(locs.length, 14);
  for (const loc of locs) assert.match(loc, /^https:\/\/abra-ca-dabra\.app\/assets\/films\/thumbs\/[a-z-]+\.jpg$/);
});
