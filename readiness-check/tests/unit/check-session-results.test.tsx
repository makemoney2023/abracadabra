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
    visibility: { total: null, breakdown: null, status: "unavailable" },
    overall: {
      total: 55,
      band: "forming",
      weights: { readiness: 0.5, visibility: 0, growth: 0.5 },
    },
    pressures: [],
    topPressure: null,
  },
  bandLabel: "Forming",
  bandSentence: "The pieces are starting to line up.",
  topPressureLabel: null,
  suggestions: { readiness: [], growth: [], visibility: [] },
  offers: [],
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
    mailto: "mailto:dev@pirx.ca",
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("check results after the lead gate", () => {
  it("shows the scored results after the gate submits the lead", async () => {
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
            preview: { band: "forming", bandLabel: "Forming" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    render(<CheckSession token="tok" />);
    expect(await screen.findByRole("heading", { name: "Your check is scored." })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@acme.example" } });
    fireEvent.click(screen.getByRole("button", { name: "Show my results" }));

    expect(await screen.findByRole("heading", { name: "Forming" })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Readiness: 64/ })).toBeTruthy();
  });

  it("keeps the gate and explains when the opt-in response has no score", async () => {
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
            preview: { band: "forming", bandLabel: "Forming" },
          }),
          { status: 200 },
        );
      }),
    );

    render(<CheckSession token="tok" />);
    expect(await screen.findByRole("heading", { name: "Your check is scored." })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@acme.example" } });
    fireEvent.click(screen.getByRole("button", { name: "Show my results" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The score did not come back. Try again.");
    expect(screen.getByRole("heading", { name: "Your check is scored." })).toBeTruthy();
  });
});
