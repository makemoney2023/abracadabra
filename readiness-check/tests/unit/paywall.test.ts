import { describe, expect, it } from "vitest";
import { buildGuidance, describePageNeeds } from "@/lib/fixes/guidance";
import { buyLabel, GUIDANCE_COPY, PAYWALL_COPY } from "@/lib/marketing/copy";
import { FILES_PRODUCT_TAG, paywallConfig } from "@/lib/paywall/config";
import { hmacSha256, toHex } from "@/lib/paywall/crypto";
import { issueDownloadToken, verifyDownloadToken } from "@/lib/paywall/download-token";
import {
  createFilesCheckoutSession,
  retrieveCheckoutSession,
  sessionGrantsFiles,
  verifyStripeSignature,
} from "@/lib/paywall/stripe";

const FULL_ENV = {
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_ID: "price_test",
};

describe("paywallConfig", () => {
  it("is disabled and names what is missing when no provider env is set", () => {
    const c = paywallConfig({});
    expect(c.enabled).toBe(false);
    if (c.enabled) throw new Error("expected disabled");
    expect(c.missing).toEqual(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID"]);
    expect(c.priceDisplay).toBeNull();
  });

  it("stays disabled when any one value is missing or blank", () => {
    expect(paywallConfig({ ...FULL_ENV, STRIPE_PRICE_ID: "  " }).enabled).toBe(false);
    expect(paywallConfig({ ...FULL_ENV, STRIPE_WEBHOOK_SECRET: undefined }).enabled).toBe(false);
  });

  it("is enabled with all three values; price label only from PRICE_DISPLAY", () => {
    const c = paywallConfig({ ...FULL_ENV });
    expect(c.enabled).toBe(true);
    expect(c.priceDisplay).toBeNull();
    expect(paywallConfig({ ...FULL_ENV, PRICE_DISPLAY: " CA$X " }).priceDisplay).toBe("CA$X");
  });
});

describe("buy button label", () => {
  it("never invents a price", () => {
    expect(buyLabel(null)).toBe("Buy the files");
    expect(buyLabel(undefined)).toBe("Buy the files");
    expect(buyLabel("CA$X")).toBe("Buy the files · CA$X");
  });

  it("visible copy avoids the word brief and tech names in labels", () => {
    const all = JSON.stringify({ PAYWALL_COPY, GUIDANCE_COPY }).toLowerCase();
    expect(all).not.toMatch(/\bbrief\b/);
    expect(all).not.toMatch(/stripe|json|llms|sitemap|robots\.txt|schema\.org/);
  });
});

describe("download token", () => {
  const cfg = { webhookSecret: "whsec_test", tokenSecret: null };

  it("verifies for the same scan and rejects other scans, tampering, and expiry", async () => {
    const now = 1_000_000;
    const { token } = await issueDownloadToken(cfg, "tokA", "scanA", now);
    expect(await verifyDownloadToken(cfg, token, "tokA", "scanA", now + 1000)).toBe(true);
    expect(await verifyDownloadToken(cfg, token, "tokB", "scanA", now + 1000)).toBe(false);
    expect(await verifyDownloadToken(cfg, token, "tokA", "scanB", now + 1000)).toBe(false);
    expect(await verifyDownloadToken(cfg, `${token}x`, "tokA", "scanA", now + 1000)).toBe(false);
    expect(await verifyDownloadToken(cfg, token, "tokA", "scanA", now + 16 * 60 * 1000)).toBe(false);
    expect(await verifyDownloadToken(cfg, null, "tokA", "scanA", now)).toBe(false);
  });

  it("a token signed with another secret does not verify", async () => {
    const { token } = await issueDownloadToken({ webhookSecret: "other", tokenSecret: null }, "t", "s");
    expect(await verifyDownloadToken(cfg, token, "t", "s")).toBe(false);
  });
});

describe("Stripe webhook signature", () => {
  it("accepts a correct v1 signature inside the tolerance and rejects the rest", async () => {
    const body = JSON.stringify({ type: "checkout.session.completed" });
    const t = 1_700_000_000;
    const sig = toHex(await hmacSha256("whsec_test", `${t}.${body}`));
    expect(await verifyStripeSignature(body, `t=${t},v1=${sig}`, "whsec_test", t + 10)).toBe(true);
    expect(await verifyStripeSignature(body, `t=${t},v1=deadbeef,v1=${sig}`, "whsec_test", t)).toBe(true);
    expect(await verifyStripeSignature(`${body} `, `t=${t},v1=${sig}`, "whsec_test", t)).toBe(false);
    expect(await verifyStripeSignature(body, `t=${t},v1=${sig}`, "wrong", t)).toBe(false);
    expect(await verifyStripeSignature(body, `t=${t},v1=${sig}`, "whsec_test", t + 301)).toBe(false);
    expect(await verifyStripeSignature(body, null, "whsec_test", t)).toBe(false);
  });
});

describe("sessionGrantsFiles", () => {
  const base = {
    id: "cs_test_1",
    status: "complete",
    payment_status: "paid",
    client_reference_id: "scan1",
    metadata: { product: FILES_PRODUCT_TAG, scan_token: "tok1" },
    line_items: { data: [{ price: { id: "price_test" } }] },
  };
  const expectFor = { scanId: "scan1", scanToken: "tok1", priceId: "price_test" };

  it("grants only a paid, complete session for this scan, product, and price", () => {
    expect(sessionGrantsFiles(base, expectFor)).toBe(true);
    expect(sessionGrantsFiles({ ...base, payment_status: "unpaid" }, expectFor)).toBe(false);
    expect(sessionGrantsFiles({ ...base, status: "open" }, expectFor)).toBe(false);
    expect(sessionGrantsFiles({ ...base, client_reference_id: "scan2" }, expectFor)).toBe(false);
    expect(sessionGrantsFiles({ ...base, metadata: { product: "other", scan_token: "tok1" } }, expectFor)).toBe(false);
    expect(sessionGrantsFiles({ ...base, metadata: { product: FILES_PRODUCT_TAG, scan_token: "x" } }, expectFor)).toBe(false);
    expect(
      sessionGrantsFiles({ ...base, line_items: { data: [{ price: { id: "price_other" } }] } }, expectFor),
    ).toBe(false);
  });
});

describe("Stripe client", () => {
  it("creates a one-time checkout bound to the scan, without leaking the key in the body", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fake = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: "cs_test_1", url: "https://checkout.example/x" }), { status: 200 });
    };
    const s = await createFilesCheckoutSession(
      {
        secretKey: "sk_test_x",
        priceId: "price_test",
        scanId: "scan1",
        scanToken: "tok1",
        domain: "acme.example",
        successUrl: "https://h/scan/tok1?checkout={CHECKOUT_SESSION_ID}",
        cancelUrl: "https://h/scan/tok1?checkout=cancelled",
      },
      fake,
    );
    expect(s.url).toBe("https://checkout.example/x");
    const body = new URLSearchParams(String(calls[0]!.init!.body));
    expect(body.get("mode")).toBe("payment");
    expect(body.get("line_items[0][price]")).toBe("price_test");
    expect(body.get("client_reference_id")).toBe("scan1");
    expect(body.get("metadata[product]")).toBe(FILES_PRODUCT_TAG);
    expect(body.get("metadata[scan_token]")).toBe("tok1");
    expect(String(calls[0]!.init!.body)).not.toContain("sk_test_x");
  });

  it("rejects malformed session ids before calling out", async () => {
    let called = false;
    await expect(
      retrieveCheckoutSession("sk", "../../v1/customers", async () => {
        called = true;
        return new Response("{}");
      }),
    ).rejects.toThrow();
    expect(called).toBe(false);
  });
});

describe("per-page guidance", () => {
  it("describes what each page needs in plain words", () => {
    expect(describePageNeeds(["Organization", "WebSite"])).toBe(
      "Tell AI assistants who you are and how to reach you and your site’s name.",
    );
    expect(describePageNeeds([])).toMatch(/what this page is about/);
  });

  it("splits site-wide and page items with status", () => {
    const g = buildGuidance([
      { id: "llmsTxt", kind: "siteFile", label: "llms.txt", description: "", defaultSelected: true },
      {
        id: "page:https://a.example/about",
        kind: "pageSchema",
        label: "",
        description: "",
        defaultSelected: true,
        url: "https://a.example/about",
        pageType: "about",
        willAdd: ["AboutPage", "BreadcrumbList"],
        group: "missing",
      },
      {
        id: "page:https://a.example/",
        kind: "pageSchema",
        label: "",
        description: "",
        defaultSelected: true,
        url: "https://a.example/",
        pageType: "home",
        willAdd: ["WebSite"],
        group: "additive",
      },
    ]);
    expect(g.site).toHaveLength(1);
    expect(g.site[0]!.text).not.toMatch(/llms/i);
    expect(g.pages.map((p) => [p.path, p.status])).toEqual([
      ["/about", "missing"],
      ["/", "partial"],
    ]);
  });
});
