export type JsonLdDetection = {
  hasJsonLd: boolean;
  schemaTypes: string[];
  blocks: unknown[];
};

function collectTypes(node: unknown, out: Set<string>) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  if (typeof t === "string") out.add(t);
  if (Array.isArray(t)) for (const x of t) if (typeof x === "string") out.add(x);
  if (Array.isArray(obj["@graph"])) collectTypes(obj["@graph"], out);
}

export function detectJsonLd(content: string): JsonLdDetection {
  const blocks: unknown[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    try {
      blocks.push(JSON.parse(match[1].trim()));
    } catch {
      // skip invalid JSON-LD blocks
    }
  }
  const types = new Set<string>();
  for (const b of blocks) collectTypes(b, types);
  return {
    hasJsonLd: blocks.length > 0,
    schemaTypes: [...types].sort(),
    blocks,
  };
}
