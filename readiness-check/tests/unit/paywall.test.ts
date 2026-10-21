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

describe("offer: $99.99 with a $10 checkout credit", () => {
  const OFFER = { PRICE_AMOUNT_CENTS: "9999", PRICE_CURRENCY: "usd", CREDIT_AMOUNT_CENTS: "1000" };

  it("formats the price, credit, and what you pay from config", async () => {
    const { offerFrom } = await import("@/lib/paywall/config");
    expect(offerFrom(OFFER)).toEqual({
      priceDisplay: "$99.99",
      creditDisplay: "$10",
      payDisplay: "$89.99",
      currency: "usd",
    });
    expect(offerFrom({ ...OFFER, PRICE_DISPLAY: "$99.99 USD" }).priceDisplay).toBe("$99.99 USD");
  });

  it("shows no credit without a price, without a credit, or when the credit isn't below the price", async () => {
    const { offerFrom } = await import("@/lib/paywall/config");
    expect(offerFrom({}).creditDisplay).toBeNull();
    expect(offerFrom({}).priceDisplay).toBeNull();
    expect(offerFrom({ PRICE_AMOUNT_CENTS: "9999" }).payDisplay).toBeNull();
    expect(offerFrom({ PRICE_AMOUNT_CENTS: "1000", CREDIT_AMOUNT_CENTS: "1000" }).creditDisplay).toBeNull();
    expect(offerFrom({ PRICE_AMOUNT_CENTS: "abc", CREDIT_AMOUNT_CENTS: "1000" }).creditDisplay).toBeNull();
  });

  it("won't switch buying on with a credit on show but no coupon to apply it", () => {
    const off = paywallConfig({ ...FULL_ENV, ...OFFER });
    expect(off.enabled).toBe(false);
    if (off.enabled) throw new Error("expected disabled");
    expect(off.missing).toEqual(["STRIPE_CREDIT_COUPON_ID"]);
    const on = paywallConfig({ ...FULL_ENV, ...OFFER, STRIPE_CREDIT_COUPON_ID: "schema_files_credit_10_usd" });
    expect(on.enabled).toBe(true);
    if (!on.enabled) throw new Error("expected enabled");
    expect(on.couponId).toBe("schema_files_credit_10_usd");
  });

  it("panel copy reads as Christopher set it", async () => {
    const { creditLine } = await import("@/lib/marketing/copy");
    expect(buyLabel("$99.99")).toBe("Buy the files $99.99");
    expect(creditLine("$10", "$89.99")).toBe("$10 credit applied at checkout, you pay $89.99");
    expect(creditLine(null, "$89.99")).toBeNull();
  });
});

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
    expect(buyLabel("CA$X")).toBe("Buy the files CA$X");
    expect(buyLabel("$99.99")).toBe("Buy the files $99.99");
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
    expect(body.get("allow_promotion_codes")).toBe("false");
    expect(body.has("discounts[0][coupon]")).toBe(false);
  });

  it("auto-applies the checkout credit and leaves promotion codes off (Stripe allows only one)", async () => {
    let sent = "";
    await createFilesCheckoutSession(
      {
        secretKey: "sk_test_x",
        priceId: "price_test",
        scanId: "scan1",
        scanToken: "tok1",
        domain: "acme.example",
        successUrl: "https://h/s",
        cancelUrl: "https://h/c",
        couponId: "schema_files_credit_10_usd",
      },
      async (_url, init) => {
        sent = String(init?.body);
        return new Response(JSON.stringify({ id: "cs_test_1", url: "https://checkout.example/x" }));
      },
    );
    const body = new URLSearchParams(sent);
    expect(body.get("discounts[0][coupon]")).toBe("schema_files_credit_10_usd");
    expect(body.has("allow_promotion_codes")).toBe(false);
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

describe("PAYWALL_TEST_BYPASS (preview only)", () => {
  it("only treats preview aliases and local hosts as previews", async () => {
    const { isPreviewHost } = await import("@/lib/paywall/test-bypass");
    expect(isPreviewHost("schema-paywall-readiness-check.abracadabra-ai.workers.dev")).toBe(true);
    expect(isPreviewHost("localhost")).toBe(true);
    expect(isPreviewHost("check.abra-ca-dabra.app")).toBe(false);
    expect(isPreviewHost("readiness-check.abracadabra-ai.workers.dev")).toBe(false);
    expect(isPreviewHost("-readiness-check.abracadabra-ai.workers.dev")).toBe(false);
    expect(isPreviewHost("evil-readiness-check.example.com")).toBe(false);
    expect(isPreviewHost("other-worker.abracadabra-ai.workers.dev")).toBe(false);
  });

  it("needs the exact value 1, a preview host, and a per-request opt-in", async () => {
    const { paywallTestBypass } = await import("@/lib/paywall/test-bypass");
    const opt = { headers: { "x-paywall-test-bypass": "1" } };
    const preview = new Request("https://schema-paywall-readiness-check.abracadabra-ai.workers.dev/x", opt);
    const prod = new Request("https://check.abra-ca-dabra.app/x", opt);
    expect(paywallTestBypass(new Request("https://schema-paywall-readiness-check.abracadabra-ai.workers.dev/x"), { PAYWALL_TEST_BYPASS: "1" })).toBe(false);
    expect(paywallTestBypass(new Request("https://schema-paywall-readiness-check.abracadabra-ai.workers.dev/x?paywall_test=1"), { PAYWALL_TEST_BYPASS: "1" })).toBe(true);
    expect(paywallTestBypass(preview, { PAYWALL_TEST_BYPASS: "1" })).toBe(true);
    expect(paywallTestBypass(preview, { PAYWALL_TEST_BYPASS: "true" })).toBe(false);
    expect(paywallTestBypass(preview, {})).toBe(false);
    expect(paywallTestBypass(prod, { PAYWALL_TEST_BYPASS: "1" })).toBe(false);
  });
});

describe("llms.txt page names", () => {
  it("names pages from their headline or slug, not just their type", async () => {
    const { buildLlmsTxt } = await import("@/lib/fixes/llms-txt-template");
    const out = buildLlmsTxt({
      origin: "https://acme.example",
      domain: "acme.example",
      biz: { name: "Acme" },
      pages: [
        { url: "https://acme.example/", pageType: "home", fetchStatus: "ok" },
        { url: "https://acme.example/services", pageType: "service", fetchStatus: "ok" },
        { url: "https://acme.example/services/ai-audits", pageType: "service", fetchStatus: "ok" },
        { url: "https://acme.example/blog/x", pageType: "blogPost", fetchStatus: "ok", title: "Why [x] matters", description: "A short   read." },
        { url: "https://acme.example/gone", pageType: "about", fetchStatus: "failed" },
      ],
    });
    expect(out).toContain("- [Services](https://acme.example/services)");
    expect(out).toContain("- [AI audits](https://acme.example/services/ai-audits)");
    expect(out).toContain("- [Why x matters](https://acme.example/blog/x): A short read.");
    expect(out).not.toContain("https://acme.example/gone");
  });
});
