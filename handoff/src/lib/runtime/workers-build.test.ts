import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(
  readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
) as { scripts: Record<string, string> };

describe("Workers Builds scripts", () => {
  it("builds OpenNext before a deploy can find the compiled config", () => {
    expect(pkg.scripts.build).toBe("opennextjs-cloudflare build");
    expect(pkg.scripts.deploy).toBe(
      "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
    );
  });

  it("deploys the staff worker with its own Wrangler config", () => {
    expect(pkg.scripts["deploy:hq"]).toBe(
      "opennextjs-cloudflare build && opennextjs-cloudflare deploy --config wrangler.hq.jsonc",
    );
  });
});
