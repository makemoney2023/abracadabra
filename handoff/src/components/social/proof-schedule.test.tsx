import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app/w/[slug]/work/schedule-action", () => ({
  preparePieceScheduleAction: async () => ({ message: "" }),
}));

import { ProofSchedule } from "./proof-schedule";

const props = {
  approved: true,
  deliverableId: "d-1",
  itemId: "open",
  version: 1,
  organizationId: "org-1",
  accounts: [{ id: "ig", label: "Instagram · Acme" }],
};

describe("proof schedule", () => {
  it("shows the plan form to staff and a sentence to the client", () => {
    const client = renderToStaticMarkup(createElement(ProofSchedule, { ...props, staff: false }));
    expect(client).toContain("Approved. It will go on the calendar.");
    expect(client).not.toContain("Schedule this piece");
    const staff = renderToStaticMarkup(createElement(ProofSchedule, { ...props, staff: true }));
    expect(staff).toContain("Schedule this piece");
    expect(staff).toContain("Instagram · Acme");
    expect(staff).toContain("Nothing is sent until that plan is executed.");
    expect(staff).not.toContain("Zernio");
  });
});
