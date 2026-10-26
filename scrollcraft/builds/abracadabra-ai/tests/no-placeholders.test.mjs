import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// HQ card e9bca884: no generated page may ship placeholder, TODO, localhost
// or "[to be confirmed]" text, including inside HTML comments.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", "tests", "scripts", "content", "worker", ".wrangler", ".git"]);
const OUTPUT = /\.(html|txt|xml|webmanifest)$/;

// Pages still waiting on their own card. Remove an entry when that card is fixed.
const OPEN_ELSEWHERE = {
  "privacy/index.html": "HQ card 15879980 (effective date not confirmed by the owner)",
};

const BANNED = [
  ["PLACEHOLDER", /PLACEHOLDER/],
  ["placeholder", (text) => /\bplaceholder\b/i.test(text.replace(/\splaceholder="[^"]*"/gi, ""))],
  ["TODO", /\bTODO\b/],
  ["localhost", /localhost|127\.0\.0\.1/i],
  ["[to be confirmed]", /\[to be confirmed\]/i],
];

function outputFiles(dir = root) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...outputFiles(join(dir, entry.name)));
    } else if (OUTPUT.test(entry.name)) {
      files.push(relative(root, join(dir, entry.name)));
    }
  }
  return files;
}

const hits = (text) => BANNED.filter(([, rule]) => (typeof rule === "function" ? rule(text) : rule.test(text))).map(([name]) => name);

test("no generated page carries placeholder, TODO, localhost or [to be confirmed] text", () => {
  const files = outputFiles();
  assert.ok(files.filter((file) => file.endsWith(".html")).length >= 80, `only ${files.length} output files found`);
  const found = files
    .filter((file) => !(file in OPEN_ELSEWHERE))
    .map((file) => [file, hits(readFileSync(join(root, file), "utf8"))])
    .filter(([, names]) => names.length);
  assert.deepEqual(found, [], `banned text in ${found.length} files: ${found.slice(0, 10).map(([f, n]) => `${f} (${n.join(", ")})`).join("; ")}`);
});

test("pages exempted for another card still need that card", () => {
  for (const [file, card] of Object.entries(OPEN_ELSEWHERE)) {
    const names = hits(readFileSync(join(root, file), "utf8"));
    assert.notDeepEqual(names, [], `${file} is clean now; drop its exemption for ${card}`);
  }
});
