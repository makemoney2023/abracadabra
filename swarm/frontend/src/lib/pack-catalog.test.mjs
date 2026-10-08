import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const templates = JSON.parse(
  readFileSync(new URL("../../../src/pack-templates.json", import.meta.url), "utf8"),
);

test("pack catalog chains related skills and stays inside the save limit", () => {
  assert.ok(templates.length >= 10);
  const marketing = templates.find((template) => template.id === "pack-community-marketingskills");
  assert.ok(marketing);
  assert.ok(marketing.nodes.length >= 2 && marketing.nodes.length <= 4);
  assert.equal(marketing.edges.length, marketing.nodes.length - 1);
  assert.match(marketing.nodes[0].instructions, /\.cursor\/skills\//);
  for (const template of templates) {
    assert.ok(template.nodes.length >= 2 && template.nodes.length <= 4);
    assert.equal(template.id.startsWith("pack-"), true);
  }
  assert.equal(templates.some((template) => template.id === "pack-community"), false);
});
