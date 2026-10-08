import { describe, expect, it } from "vitest";
import { chatContextLine } from "./hq-chat-context";

describe("chat page context", () => {
  it("names the page and stays empty when the page has no record", () => {
    expect(chatContextLine({})).toBe("");
    expect(chatContextLine({ organizationId: "org-1", taskId: "task-1" })).toBe(
      'The staff member is looking at organization org-1, task task-1. Use these ids when they say "here".',
    );
  });
});