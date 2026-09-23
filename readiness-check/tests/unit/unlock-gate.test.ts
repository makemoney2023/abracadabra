import { describe, expect, it } from "vitest";
import { selectScanPayload, type FullScanView } from "@/lib/scan/present";
import { unlockCookieName } from "@/lib/scan/unlock";

describe("selectScanPayload", () => {
  it("hides pages until unlocked", () => {
    const full: FullScanView = {
      domain: "x.com",
      status: "complete",
      scoreTotal: 55,
      scoreBreakdown: { structuredData: 10 },
      pages: [
        {
          url: "https://x.com",
          pageType: "home",
          fetchStatus: "ok",
          hasJsonLd: false,
          schemaTypes: [],
        },
      ],
      findings: [
        {
          code: "MISSING_LLMS_TXT",
          severity: "critical",
          passed: false,
          message: "Missing llms.txt",
        },
      ],
    };

    const locked = selectScanPayload(full, false);
    expect(locked.unlocked).toBe(false);
    expect("pages" in locked ? locked.pages : undefined).toBeUndefined();

    const unlocked = selectScanPayload(full, true);
    expect(unlocked.unlocked).toBe(true);
    if (unlocked.unlocked) {
      expect(unlocked.pages).toHaveLength(1);
    }
  });
});

describe("unlockCookieName", () => {
  it("namespaces cookie by public token", () => {
    expect(unlockCookieName("abc123")).toBe("scan_unlock_abc123");
  });
});
