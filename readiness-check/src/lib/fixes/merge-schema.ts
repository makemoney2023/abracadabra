/**
 * Additive schema merge: keep only nodes whose primary @type is missing on the page.
 */

function typeNames(node: Record<string, unknown>): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

function asRecord(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;
  return node as Record<string, unknown>;
}

/** Collect top-level types from existing blocks (@graph children or root). */
export function collectExistingTypes(
  existingTypes: string[],
  existingBlocks: unknown[] = [],
): Set<string> {
  const types = new Set(existingTypes);
  for (const block of existingBlocks) {
    const root = asRecord(block);
    if (!root) continue;
    for (const t of typeNames(root)) types.add(t);
    const graph = root["@graph"];
    if (Array.isArray(graph)) {
      for (const node of graph) {
        const rec = asRecord(node);
        if (rec) for (const t of typeNames(rec)) types.add(t);
      }
    }
  }
  return types;
}

export type MergeDesiredInput = {
  desired: Record<string, unknown>;
  existingTypes: string[];
  existingBlocks?: unknown[];
};

export type MergeDesiredResult = {
  document: Record<string, unknown> | null;
  skippedTypes: string[];
  emittedTypes: string[];
  allPresent: boolean;
};

/**
 * Filter desired @graph (or single node) to types not already on the page.
 * BreadcrumbList is included whenever any other missing type is emitted.
 */
export function mergeDesiredSchema(input: MergeDesiredInput): MergeDesiredResult {
  const existing = collectExistingTypes(input.existingTypes, input.existingBlocks);
  const desired = input.desired;
  const context = desired["@context"] ?? "https://schema.org";

  const graph = Array.isArray(desired["@graph"])
    ? (desired["@graph"] as unknown[])
    : null;

  if (graph) {
    const core: Record<string, unknown>[] = [];
    let breadcrumb: Record<string, unknown> | null = null;
    const skipped: string[] = [];
    const emittedTypes: string[] = [];

    for (const node of graph) {
      const rec = asRecord(node);
      if (!rec) continue;
      const primary = typeNames(rec)[0];
      if (!primary) continue;

      if (primary === "BreadcrumbList") {
        breadcrumb = rec;
        continue;
      }

      if (existing.has(primary)) {
        skipped.push(primary);
        continue;
      }
      core.push(rec);
      emittedTypes.push(primary);
    }

    if (core.length === 0) {
      return { document: null, skippedTypes: skipped, emittedTypes: [], allPresent: true };
    }

    const emitted = breadcrumb ? [...core, breadcrumb] : core;
    if (breadcrumb) emittedTypes.push("BreadcrumbList");

    return {
      document: { "@context": context, "@graph": emitted },
      skippedTypes: skipped,
      emittedTypes,
      allPresent: false,
    };
  }

  const primary = typeNames(desired)[0];
  if (primary && existing.has(primary)) {
    return {
      document: null,
      skippedTypes: [primary],
      emittedTypes: [],
      allPresent: true,
    };
  }

  return {
    document: desired,
    skippedTypes: [],
    emittedTypes: primary ? [primary] : [],
    allPresent: false,
  };
}
