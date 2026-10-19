import assert from "node:assert/strict";
import test from "node:test";
import { serveVideo } from "../worker/intake.js";

const bytes = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));
const assets = {
  async fetch() {
    return new Response(bytes, { status: 200, headers: { "Content-Type": "video/mp4", "Content-Length": "100" } });
  },
};
const get = (range) => new Request("https://abra-ca-dabra.app/assets/films/x.mp4", { headers: range ? { Range: range } : {} });

test("films answer a byte range with 206 and the right slice", async () => {
  const res = await serveVideo(get("bytes=10-19"), assets);
  assert.equal(res.status, 206);
  assert.equal(res.headers.get("Content-Range"), "bytes 10-19/100");
  assert.equal(res.headers.get("Content-Type"), "video/mp4");
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
});

test("open-ended, suffix, and full requests", async () => {
  assert.equal((await serveVideo(get("bytes=90-"), assets)).headers.get("Content-Range"), "bytes 90-99/100");
  assert.equal((await serveVideo(get("bytes=-5"), assets)).headers.get("Content-Range"), "bytes 95-99/100");
  const full = await serveVideo(get(), assets);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("Accept-Ranges"), "bytes");
  assert.equal((await serveVideo(get("bytes=200-"), assets)).status, 416);
});
