import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GATED_HQ_TOOLS, HQ_TOOL_HELP, READ_HQ_TOOLS } from "@/lib/hq-tool-names";
import { approvalCard } from "./approval-card";

describe("approval card", () => {
  it("shows the action and every field while a tool is waiting", () => {
    const waiting = approvalCard(
      {
        type: "tool-add_work",
        state: "approval-requested",
        approval: { id: "call-1" },
        input: { organizationId: "org-1", kind: "page", outcome: "A pricing page" },
      },
      () => undefined,
    );
    const html = renderToStaticMarkup(createElement("div", null, waiting));
    expect(html).toContain("Add work to the brief");
    expect(html).toContain("outcome");
    expect(html).toContain("A pricing page");
    expect(html).toContain("Approve");
    expect(html).toContain("Reject");
    const done = approvalCard({ type: "tool-add_work", state: "output-available", approval: { id: "call-1" } }, () => undefined);
    expect(done).toBeNull();
  });

  it("has help text for every chat tool", () => {
    for (const name of [...READ_HQ_TOOLS, ...GATED_HQ_TOOLS]) expect(HQ_TOOL_HELP[name]?.description).toBeTruthy();
  });
});
