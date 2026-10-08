import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(
  readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
) as { scripts: Record<string, string> };

describe("Workers Builds scripts", () => {
  it("keeps npm run build as next build so OpenNext does not call itself", () => {
    expect(pkg.scripts.build).toBe("next build");
  });

  it("builds OpenNext before a deploy can find the compiled config", () => {
    expect(pkg.scripts.deploy).toBe(
      "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
    );
  });

  it("deploys the staff worker with its own Wrangler config", () => {
    expect(pkg.scripts["deploy:hq"]).toBe(
      "opennextjs-cloudflare build && opennextjs-cloudflare deploy --config wrangler.hq.jsonc",
    );
  });

  it("gives staff chat the agent host, and that host is the agent worker", () => {
    const hq = JSON.parse(readFileSync(path.join(process.cwd(), "wrangler.hq.jsonc"), "utf8")) as {
      vars: { AGENT_URL?: string };
    };
    const agent = JSON.parse(readFileSync(path.join(process.cwd(), "wrangler.agent.jsonc"), "utf8")) as {
      routes?: { pattern: string; custom_domain?: boolean }[];
    };
    expect(hq.vars.AGENT_URL).toBe("https://agent.abra-ca-dabra.app");
    expect(agent.routes).toContainEqual({ pattern: "agent.abra-ca-dabra.app", custom_domain: true });
  });

  it("typechecks the agent worker and fails a type error", () => {
    const ok = spawnSync("npx", ["tsc", "--noEmit", "-p", "tsconfig.agent.json", "--pretty", "false"], {
      encoding: "utf8",
    });
    expect(ok.status, `${ok.stdout}\n${ok.stderr}`).toBe(0);
    const dir = mkdtempSync(path.join(tmpdir(), "agent-type-"));
    try {
      writeFileSync(path.join(dir, "bad.ts"), 'export const amount: number = "no";\n');
      writeFileSync(
        path.join(dir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { strict: true, noEmit: true, types: ["node"] },
          files: ["bad.ts"],
        }),
      );
      const bad = spawnSync("npx", ["tsc", "--noEmit", "-p", dir, "--pretty", "false"], { encoding: "utf8" });
      expect(bad.status).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
