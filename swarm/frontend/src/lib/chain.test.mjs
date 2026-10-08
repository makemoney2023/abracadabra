import assert from "node:assert/strict";
import test from "node:test";
import { bridgeEdge, chainOffset } from "./chain.mjs";

test("an empty canvas starts at the template's own position", () => {
  assert.equal(chainOffset([]), 0);
  assert.equal(bridgeEdge([], "next"), null);
});

test("a second template starts to the right and links from the rightmost node", () => {
  const existing = [
    { id: "a", position: { x: 50, y: 100 } },
    { id: "b", position: { x: 400, y: 80 } },
  ];
  assert.equal(chainOffset(existing), 720);
  assert.deepEqual(bridgeEdge(existing, "c"), { source: "b", target: "c" });
});
