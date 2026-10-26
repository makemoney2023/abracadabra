/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckSession } from "@/components/check/CheckSession";
import type { ResultsPayload } from "@/lib/assessment/present";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const results: ResultsPayload = {
  domain: "acme.example",
  scores: {
    configVersion: "v1",
    readiness: { total: 64, data: 60, process: 70, people: 50, decision: 76, incomplete: {} },
    growth: { total: 40 },
    visibility: {
      total: 73,
      breakdown: { structuredData: 21, aiDiscoveryFiles: 11, aiCrawlability: 17, pageCoverage: 13, answerReadiness: 9 },
      status: "complete",
    },
    overall: {
      total: 55,
      band: "forming",
      weights: { readiness: 0.5, visibility: 0.25, growth: 0.25 },
    },
    pressures: [{ code: "experts_queue", severity: 2, offerRow: "row-1" }],
    topPressure: "experts_queue",
  },
  bandLabel: "Forming",
  bandSentence: "The pieces are starting to line up.",
  stage: { id: "forming", label: "Forming", sentence: "The pieces are starting to line up." },
  topPressureLabel: "Only one person knows how an important job gets done.",
  pressures: [{ code: "experts_queue", label: "Our experts are the queue", severityLabel: "It costs us time or money every week" }],
  suggestions: {
    readiness: [
      {
        code: "ready-data-low",
        section: "readiness",
        severity: "warn",
        title: "Start with where the knowledge lives",
        body: "Write down one real example this week.",
        guideSlug: "fix/ready-data-low",
      },
    ],
    growth: [],
    visibility: [],
  },
  offers: [],
  visibility: { status: "complete" },
  scan: null,
  booking: {
    calLink: null,
    prefill: {
      name: "Ada",
      email: "ada@acme.example",
      assessment: "tok",
      domain: "acme.example",
      band: "forming",
      pressure: "",
    },
    mailto: "mailto:houdini@abra-ca-dabra.app",
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("check results after the lead gate", () => {
  it("shows the scores together with the stage name and next steps after the gate submits the lead", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/opt-in") && init?.method === "POST") {
          return new Response(JSON.stringify({ ok: true, leadId: "lead-1", results }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("/events")) {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            status: "completed",
            currentStep: "gate",
            answers: {},
            qualifiers: {},
            gated: true,
            preview: { stage: "forming", stageLabel: "Forming", band: "forming", bandLabel: "Forming" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    render(<CheckSession token="tok" />);
    expect(await screen.findByRole("heading", { name: "Your check is done." })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@acme.example" } });
    fireEvent.click(screen.getByRole("button", { name: "Show my results" }));

    expect(await screen.findByRole("heading", { name: "Forming" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Next steps for how the work runs" })).toBeTruthy();
    expect(screen.getByText("Start with where the knowledge lives")).toBeTruthy();
    expect(screen.getByText("Our experts are the queue")).toBeTruthy();
    expect(screen.getByRole("link", { name: "What this stage means" })).toHaveAttribute("href", "/check/guide/stage/forming");
    // The scores are back next to the stage: three rings and the pillar meters.
    expect(screen.getByRole("img", { name: /^Readiness: 64 of 100/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /^AI visibility: 73 of 100/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /^Growth: 40 of 100/ })).toBeTruthy();
    for (const name of [/^Data: 60 of 100/, /^Process: 70 of 100/, /^People: 50 of 100/, /^Decision: 76 of 100/, /^Structured data: 21 of 35/]) {
      expect(screen.getByRole("group", { name })).toBeTruthy();
    }
    expect(screen.getByRole("heading", { name: "Readiness" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Website visibility" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Growth" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Next steps for your website" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Next steps for new customers" })).toBeTruthy();
    // The stage line ends with one period even though the pressure label already has one.
    const lead = screen.getByText(/The job that costs the most right now/);
    expect(lead.textContent).toContain("gets done.");
    expect(lead.textContent).not.toContain("..");
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\bband\b/i);
  });

  it("keeps the gate and explains when the opt-in response has no results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/opt-in") && init?.method === "POST") {
          return new Response(JSON.stringify({ ok: true, leadId: "lead-1" }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            status: "completed",
            currentStep: "gate",
            answers: {},
            qualifiers: {},
            gated: true,
            preview: { stage: "forming", stageLabel: "Forming", band: "forming", bandLabel: "Forming" },
          }),
          { status: 200 },
        );
      }),
    );

    render(<CheckSession token="tok" />);
    expect(await screen.findByRole("heading", { name: "Your check is done." })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@acme.example" } });
    fireEvent.click(screen.getByRole("button", { name: "Show my results" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Your results did not come back. Try again.");
    expect(screen.getByRole("heading", { name: "Your check is done." })).toBeTruthy();
  });
});
