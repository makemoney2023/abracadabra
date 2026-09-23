import { describe, expect, it } from "vitest";
import { fixPackageFolderName, zipFixFiles } from "@/lib/fixes/zip";

describe("zipFixFiles", () => {
  it("builds a zip containing the package folder and files", async () => {
    const folder = fixPackageFolderName("example.com", new Date("2026-08-11T12:00:00Z"));
    expect(folder).toBe("aeo-fixes-example.com-2026-08-11");

    const bytes = await zipFixFiles(
      [
        { path: "llms.txt", contentType: "text/plain", content: "# Example\n" },
        { path: "INSTALL.md", contentType: "text/markdown", content: "# Install\n" },
      ],
      folder,
    );

    expect(bytes.byteLength).toBeGreaterThan(40);
    // ZIP local file header magic
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });
});
