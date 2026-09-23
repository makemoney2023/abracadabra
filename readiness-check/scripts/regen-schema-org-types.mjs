#!/usr/bin/env node
/**
 * Regenerate src/lib/schema-org/organization-types.json from schema.org JSON-LD.
 * Usage: node scripts/regen-schema-org-types.mjs [path-or-url]
 */
import fs from "fs";
import path from "path";

const DEFAULT_URL = "https://schema.org/version/latest/schemaorg-current-https.jsonld";
const outFile = path.resolve("src/lib/schema-org/organization-types.json");

function short(id) {
  if (!id) return null;
  const s = String(id);
  if (s.startsWith("schema:")) return s.slice(7);
  if (s.includes("schema.org/")) return s.split("/").pop();
  return s.includes(":") ? s.split(":").pop() : s;
}

async function load(src) {
  if (src.startsWith("http")) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`fetch failed ${res.status}`);
    return res.json();
  }
  return JSON.parse(fs.readFileSync(src, "utf8"));
}

const src = process.argv[2] || DEFAULT_URL;
const data = await load(src);
const graph = data["@graph"];
const types = new Map();
for (const node of graph) {
  const name = short(node["@id"]);
  if (!name) continue;
  const t = [].concat(node["@type"] || []);
  if (!t.some((x) => String(x).includes("Class"))) continue;
  const parents = []
    .concat(node["rdfs:subClassOf"] || [])
    .map((s) => short(typeof s === "string" ? s : s["@id"]))
    .filter(Boolean);
  types.set(name, { name, parents });
}
const children = new Map();
for (const [name, info] of types) {
  for (const p of info.parents) {
    if (!children.has(p)) children.set(p, []);
    children.get(p).push(name);
  }
}
function collect(root) {
  const out = new Set([root]);
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    for (const c of children.get(n) || []) {
      if (!out.has(c)) {
        out.add(c);
        stack.push(c);
      }
    }
  }
  return out;
}
const orgTree = collect("Organization");
const catalog = [];
for (const name of [...orgTree].sort()) {
  const parents = types.get(name)?.parents || [];
  const ancestors = [];
  const seen = new Set();
  const q = [...parents];
  while (q.length) {
    const p = q.shift();
    if (!p || seen.has(p)) continue;
    seen.add(p);
    ancestors.push(p);
    for (const pp of types.get(p)?.parents || []) q.push(pp);
  }
  catalog.push({
    name,
    parent:
      parents.find((p) => orgTree.has(p) || p === "Organization" || p === "Place") ||
      parents[0] ||
      null,
    parents,
    ancestors,
  });
}
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(catalog));
console.log(`Wrote ${catalog.length} Organization-tree types to ${outFile}`);
