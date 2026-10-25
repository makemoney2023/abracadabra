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
  stage: { id: "forming", label: "Forming", sentence: "The pieces are starting to line up." },
  topPressureLabel: null,
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
  visibility: { status: "unavailable" },
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
  it("shows the stage name and next steps, with no score, after the gate submits the lead", async () => {
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
            preview: { stage: "forming", stageLabel: "Forming" },
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
    expect(screen.queryByRole("img", { name: /Readiness/ })).toBeNull();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\bscore/i);
    expect(text).not.toMatch(/\bband\b/i);
    expect(text).not.toMatch(/\d+\s*\/\s*100/);
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
            preview: { stage: "forming", stageLabel: "Forming" },
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
