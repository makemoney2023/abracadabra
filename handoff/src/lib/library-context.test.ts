import { describe, expect, it } from "vitest";
import { isBuildContext } from "./library-context";

describe("library build context", () => {
  it("treats markdown notes and GitHub source links as context", () => {
    expect(isBuildContext({ title: "how-client-work.md" })).toBe(true);
    expect(isBuildContext({ title: "Notes.MD" })).toBe(true);
    expect(isBuildContext({ title: "Pull request #173", linkUrl: "https://github.com/makemoney2023/abracadabra/pull/173" })).toBe(true);
    expect(isBuildContext({ title: "Repository", linkUrl: "https://www.github.com/makemoney2023/squareassembly" })).toBe(true);
  });

  it("keeps the finished piece", () => {
    expect(isBuildContext({ title: "homepage.png" })).toBe(false);
    expect(isBuildContext({ title: "Live article", linkUrl: "https://abra-ca-dabra.app/blog/how-client-work-flows-through-hq" })).toBe(false);
    expect(isBuildContext({ title: "Live site", linkUrl: "https://squareassembly.com" })).toBe(false);
    expect(isBuildContext({ title: "Preview", linkUrl: "https://squareassembly.abracadabra-ai.workers.dev" })).toBe(false);
    expect(isBuildContext({ title: "Blog: How Client Work Moves Through HQ and Our AI Agents" })).toBe(false);
  });
});
