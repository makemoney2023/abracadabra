import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("social send stays on the existing path", () => {
  it("posts through sendPieces and does not create a library promotion", () => {
    const source = readFileSync(new URL("./social-actions.ts", import.meta.url), "utf8");
    expect(source).toContain("sendPieces(");
    expect(source).not.toContain("createArticlePromotionDraft");
    expect(source).not.toContain("openViewLink");
  });
});
