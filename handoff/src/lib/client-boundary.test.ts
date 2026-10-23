import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A "use client" module can only be rendered from a server component. Calling any other export of it on the server
 * (a helper function, a constant read as a function) throws at request time: "Attempted to call showRetired() from the
 * server but showRetired is on the client". Unit tests import the file directly and never see it, so this guard reads
 * the sources instead. PR #206 shipped exactly that bug and every Space page failed.
 */
const SRC = path.resolve(__dirname, "..");
const EXTENSIONS = [".ts", ".tsx"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.some((ext) => name.endsWith(ext)) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function isClient(source: string): boolean {
  return /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*["']use client["']/.test(source);
}

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [base, ...EXTENSIONS.map((ext) => base + ext), ...EXTENSIONS.map((ext) => path.join(base, "index" + ext))]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/** Value (non-type) named imports of one import statement. */
function namedValues(clause: string): string[] {
  const braces = clause.match(/\{([^}]*)\}/);
  if (!braces) return [];
  return braces[1]
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !/^type\s/.test(part))
    .map((part) => part.split(/\s+as\s+/)[0].trim());
}

describe("client component boundary", () => {
  const files = walk(SRC);
  const sources = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));

  it("server modules only import components from a use client file", () => {
    const offenders: string[] = [];
    for (const [file, source] of sources) {
      if (isClient(source)) continue;
      const imports = source.matchAll(/import\s+(?!type\b)([^;]*?)\s+from\s+["']([^"']+)["']/g);
      for (const match of imports) {
        const target = resolveImport(file, match[2]);
        if (!target || !isClient(sources.get(target) ?? "")) continue;
        for (const name of namedValues(match[1])) {
          if (!/^[A-Z]/.test(name)) offenders.push(`${path.relative(SRC, file)} imports ${name} from ${path.relative(SRC, target)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the Space pages read ?retired= through a module that is not a client file", () => {
    const filter = sources.get(path.join(SRC, "components/files/retired-filter.tsx")) ?? "";
    expect(isClient(filter)).toBe(true);
    expect(filter).not.toMatch(/export\s+(?:function|const)\s+(?:showRetired|retiredLabel)\b/);
    const helper = sources.get(path.join(SRC, "lib/retired-param.ts")) ?? "";
    expect(isClient(helper)).toBe(false);
    expect(helper).toMatch(/export function showRetired/);
  });
});
