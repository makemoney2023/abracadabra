import JSZip from "jszip";
import schemaOrg from "../fixtures/schema-org-types.json";

const SCHEMA_TYPES = new Set<string>(schemaOrg.types);

export type GeneratedFile = { path: string; content: string };

/** Every @type in a JSON-LD document (walks @graph and nested nodes). */
export function jsonLdTypes(node: unknown, out: string[] = []): string[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) jsonLdTypes(item, out);
    return out;
  }
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  if (typeof t === "string") out.push(t);
  if (Array.isArray(t)) for (const x of t) if (typeof x === "string") out.push(x);
  for (const value of Object.values(obj)) if (value && typeof value === "object") jsonLdTypes(value, out);
  return out;
}

/** Problems found in a generated fix package. Empty array = valid. */
export function checkFixFiles(files: GeneratedFile[], domain: string): string[] {
  const problems: string[] = [];
  const byName = (re: RegExp) => files.filter((f) => re.test(f.path));

  for (const f of files) {
    if (/TODO_/.test(f.content)) problems.push(`${f.path}: contains a TODO placeholder`);
  }

  for (const f of byName(/(^|\/)llms\.txt$/)) {
    const lines = f.content.split("\n");
    if (!/^# \S/.test(lines[0] ?? "")) problems.push(`${f.path}: first line must be an H1 title`);
    if (!lines.some((l) => /^> \S/.test(l))) problems.push(`${f.path}: missing "> " summary blockquote`);
    if (!lines.some((l) => /^## \S/.test(l))) problems.push(`${f.path}: missing "## " sections`);
    const links = [...f.content.matchAll(/^- \[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gm)];
    if (links.length === 0) problems.push(`${f.path}: no "- [name](url)" links`);
    for (const [, , url] of links) {
      if (!new URL(url!).hostname.endsWith(domain)) problems.push(`${f.path}: off-site link ${url}`);
    }
  }

  for (const f of byName(/(^|\/)llms-full\.txt$/)) {
    if (!/^# \S/.test(f.content)) problems.push(`${f.path}: must start with an H1 title`);
    if (f.content.trim().length < 50) problems.push(`${f.path}: too short`);
  }

  for (const f of byName(/(^|\/)sitemap\.xml$/)) {
    if (!f.content.startsWith("<?xml")) problems.push(`${f.path}: missing XML declaration`);
    if (!f.content.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'))
      problems.push(`${f.path}: missing sitemap namespace`);
    const locs = [...f.content.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    if (locs.length === 0) problems.push(`${f.path}: no <loc> entries`);
    for (const loc of locs) if (!/^https?:\/\//.test(loc)) problems.push(`${f.path}: bad loc ${loc}`);
    if (/<url>/.test(f.content) && (f.content.match(/<url>/g)!.length !== locs.length))
      problems.push(`${f.path}: <url> without <loc>`);
  }

  for (const f of byName(/(^|\/)robots\.txt$/)) {
    if (!/^Sitemap:\s*https?:\/\//m.test(f.content)) problems.push(`${f.path}: no Sitemap: line`);
    if (!/^User-agent:/im.test(f.content)) problems.push(`${f.path}: no User-agent group`);
  }

  for (const f of byName(/\.(json|jsonld)$/)) {
    if (/manifest|validation/i.test(f.path)) continue;
    let doc: unknown;
    try {
      doc = JSON.parse(f.content);
    } catch {
      problems.push(`${f.path}: JSON.parse failed`);
      continue;
    }
    const ctx = (doc as Record<string, unknown>)["@context"];
    if (ctx !== "https://schema.org" && ctx !== "https://schema.org/")
      problems.push(`${f.path}: @context must be https://schema.org`);
    const types = jsonLdTypes(doc);
    if (types.length === 0) problems.push(`${f.path}: no @type`);
    for (const t of types) if (!SCHEMA_TYPES.has(t)) problems.push(`${f.path}: unknown schema.org type ${t}`);
  }

  for (const f of byName(/\.html$/)) {
    for (const m of f.content.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try {
        JSON.parse(m[1]!);
      } catch {
        problems.push(`${f.path}: embedded JSON-LD does not parse`);
      }
    }
  }

  return problems;
}

/** Open a zip and return its files (folder prefix stripped). */
export async function unzipFiles(bytes: Uint8Array): Promise<{ folder: string; files: GeneratedFile[] }> {
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files).filter((e) => !e.dir);
  const folder = entries[0]?.name.split("/")[0] ?? "";
  const files: GeneratedFile[] = [];
  for (const e of entries) {
    files.push({ path: e.name.slice(folder.length + 1), content: await e.async("string") });
  }
  return { folder, files };
}
