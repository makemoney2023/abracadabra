import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { STUDIO } from "@/lib/brand/studio";

const repoRoot = path.resolve(__dirname, "../../..");
const marketingCss = readFileSync(
  path.join(repoRoot, "scrollcraft/builds/abracadabra-ai/assets/restored-motion.css"),
  "utf8",
);
const siteCss = readFileSync(
  path.join(repoRoot, "scrollcraft/builds/abracadabra-ai/assets/site.css"),
  "utf8",
);
const checkCss = readFileSync(path.join(__dirname, "../../src/app/globals.css"), "utf8");
const report = readFileSync(path.join(__dirname, "../../src/lib/pdf/assessment-report.tsx"), "utf8");

describe("studio design tokens", () => {
  it("matches the marketing site colour and type roles", () => {
    expect(marketingCss).toContain(`--sc-canvas: ${STUDIO.canvas}`);
    expect(marketingCss).toContain(`--sc-surface: ${STUDIO.surface}`);
    expect(marketingCss).toContain(`--sc-ink: ${STUDIO.ink}`);
    expect(marketingCss).toContain(`--sc-ink-soft: ${STUDIO.inkSoft}`);
    expect(marketingCss).toContain(`--sc-accent: ${STUDIO.accent}`);
    expect(marketingCss).toContain(`--sc-optic: ${STUDIO.optic}`);
    expect(marketingCss).toContain(`--sc-phosphor: ${STUDIO.phosphor}`);
    expect(siteCss).toContain(`"Inter Tight"`);
    expect(siteCss).toContain(`"IBM Plex Sans"`);
    expect(marketingCss).toContain(`"Inter Tight"`);
    expect(STUDIO.display).toContain("Inter Tight");
    expect(STUDIO.body).toContain("IBM Plex Sans");
    expect(STUDIO.label).toContain("Inter Tight");
  });

  it("rejects a token that is not on the marketing site", () => {
    expect(marketingCss).not.toContain("--sc-canvas: #ffffff");
    expect(STUDIO.canvas).not.toBe("#ffffff");
  });

  it("paints the readiness check shell and the results PDF with those tokens", () => {
    const shell = checkCss.slice(checkCss.indexOf(".check-studio"));
    expect(shell.length).toBeGreaterThan(0);
    for (const hex of [STUDIO.canvas, STUDIO.surface, STUDIO.ink, STUDIO.accent, STUDIO.optic]) {
      expect(shell).toContain(hex);
    }
    expect(shell).toContain("Inter Tight");
    expect(shell).not.toContain("Tektur");
    expect(shell).not.toContain("font-plex-mono");
    expect(report).toContain("STUDIO.canvas");
    expect(report).toContain("STUDIO.ink");
    expect(report).toContain("STUDIO.accent");
    expect(report).toContain("Inter Tight");
    expect(report).toContain("IBM Plex Sans");
  });
});
