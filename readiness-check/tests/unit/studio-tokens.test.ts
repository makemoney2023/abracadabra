import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { STUDIO } from "@/lib/brand/studio";

const repoRoot = path.resolve(__dirname, "../../..");
const marketing = readFileSync(
  path.join(repoRoot, "scrollcraft/builds/abracadabra-ai/index.html"),
  "utf8",
);
const checkCss = readFileSync(path.join(__dirname, "../../src/app/globals.css"), "utf8");
const report = readFileSync(path.join(__dirname, "../../src/lib/pdf/assessment-report.tsx"), "utf8");

describe("studio design tokens", () => {
  it("matches the marketing site colour and type roles", () => {
    expect(marketing).toContain(`--sc-canvas: ${STUDIO.canvas}`);
    expect(marketing).toContain(`--sc-surface: ${STUDIO.surface}`);
    expect(marketing).toContain(`--sc-ink: ${STUDIO.ink}`);
    expect(marketing).toContain(`--sc-ink-soft: ${STUDIO.inkSoft}`);
    expect(marketing).toContain(`--sc-accent: ${STUDIO.accent}`);
    expect(marketing).toContain(`--sc-signal: ${STUDIO.signal}`);
    expect(marketing).toContain(`--sc-optic: ${STUDIO.optic}`);
    expect(marketing).toContain(`--sc-phosphor: ${STUDIO.phosphor}`);
    expect(marketing).toContain(`--sc-accent-ink: ${STUDIO.accentInk}`);
    expect(marketing).toContain(`"Tektur"`);
    expect(marketing).toContain(`"IBM Plex Sans"`);
    expect(STUDIO.display).toContain("Tektur");
    expect(STUDIO.body).toContain("IBM Plex Sans");
  });

  it("rejects a token that is not on the marketing site", () => {
    expect(marketing).not.toContain("--sc-canvas: #ffffff");
    expect(STUDIO.canvas).not.toBe("#ffffff");
  });

  it("paints the readiness check shell and the results PDF with those tokens", () => {
    const shell = checkCss.slice(checkCss.indexOf(".check-studio"));
    expect(shell.length).toBeGreaterThan(0);
    for (const hex of [STUDIO.canvas, STUDIO.surface, STUDIO.ink, STUDIO.accent, STUDIO.optic]) {
      expect(shell).toContain(hex);
    }
    expect(report).toContain("STUDIO.canvas");
    expect(report).toContain("STUDIO.ink");
    expect(report).toContain("STUDIO.accent");
  });
});
