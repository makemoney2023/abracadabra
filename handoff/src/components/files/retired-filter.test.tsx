import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => undefined }),
  usePathname: () => "/w/acme",
  useSearchParams: () => new URLSearchParams("folder=brand"),
}));

import { RetiredFilter } from "./retired-filter";
import { retiredLabel, showRetired } from "@/lib/retired-param";

describe("retired filter", () => {
  it("renders a labelled switch that is off by default and counts the hidden files", () => {
    const html = renderToStaticMarkup(<RetiredFilter count={3} checked={false} />);
    expect(html).toContain("Show retired (3)");
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="false"');
  });

  it("shows the switch on when retired files are being shown", () => {
    expect(renderToStaticMarkup(<RetiredFilter count={0} checked />)).toContain('aria-checked="true"');
  });

  it("reads only ?retired=1 as on", () => {
    expect(showRetired("1")).toBe(true);
    expect(showRetired(undefined)).toBe(false);
    expect(showRetired("0")).toBe(false);
    expect(showRetired(["1"])).toBe(false);
    expect(retiredLabel(0)).toBe("Show retired");
  });
});
