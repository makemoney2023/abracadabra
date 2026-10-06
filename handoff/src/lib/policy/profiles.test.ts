import { describe, expect, it } from "vitest";
import { inspectFileName } from "./profiles";

describe("inspectFileName", () => {
  it("allows an svg under both profiles", () => {
    expect(inspectFileName("Brand/logos/primary.svg", "standard")).toEqual({
      ok: true,
      extension: "svg",
    });
    expect(inspectFileName("Brand/logos/primary.svg", "software").ok).toBe(true);
  });

  it("refuses source under standard and allows it under software", () => {
    expect(inspectFileName("src/app.ts", "standard").ok).toBe(false);
    expect(inspectFileName("src/app.ts", "software")).toEqual({
      ok: true,
      extension: "ts",
    });
  });

  it.each([".env", ".env.production", "id_ed25519", "server.pem", "report.pdf.exe", "setup.exe.pdf"])(
    "refuses %s under both profiles",
    (name) => {
      expect(inspectFileName(name, "standard").ok).toBe(false);
      expect(inspectFileName(name, "software").ok).toBe(false);
    },
  );

  it("reports a lowercase extension", () => {
    expect(inspectFileName("photo.JPG", "standard")).toEqual({
      ok: true,
      extension: "jpg",
    });
  });
});
