import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckBindings } from "@/lib/cloudflare/sql";
import { hmacSha256, toHex } from "@/lib/paywall/crypto";
import { FILES_PRODUCT_TAG } from "@/lib/paywall/config";
import { memoryCheckDb } from "../helpers/memory-sql";

const holder: { env: CheckBindings } = { env: {} };

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: holder.env }),
}));

const TOKEN = "tokPaid1";
const SCAN_ID = "scan-paid-1";
const OTHER_TOKEN = "tokOther1";
const OTHER_SCAN_ID = "scan-other-1";
const ctx = (token = TOKEN) => ({ params: Promise.resolve({ token }) });
const ENABLED = {
  STRIPE_SECRET_KEY: "sk_test_paywall",
  STRIPE_WEBHOOK_SECRET: "whsec_paywall",
  STRIPE_PRICE_ID: "price_paywall",
};

async function seed(db: NonNullable<CheckBindings["DB"]>, id: string, token: string) {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO readiness_scans (id, public_token, domain, origin, source, status, score_total, score_breakdown_json, created_at, completed_at)
       VALUES (?, ?, 'acme.example', 'https://acme.example', 'public', 'complete', 40, '{}', ?, ?)`,
    )
    .bind(id, token, now, now)
    .run();
  for (const [url, type] of [
    ["https://acme.example/", "home"],
    ["https://acme.example/about", "about"],
  ]) {
    await db
      .prepare(
        `INSERT INTO readiness_scan_pages (id, scan_id, url, page_type, fetch_status, has_json_ld, schema_types_json, evidence_json)
         VALUES (?, ?, ?, ?, 'ok', 0, '[]', '{}')`,
      )
      .bind(crypto.randomUUID(), id, url, type)
      .run();
  }
  for (const [code, sev, msg] of [
    ["NO_JSON_LD_HOME", "critical", "Home page is missing structured data."],
    ["SITEMAP_MISSING", "warn", "sitemap.xml is missing."],
  ]) {
    await db
      .prepare(
        `INSERT INTO readiness_scan_findings (id, scan_id, page_url, code, severity, passed, message, evidence_json)
         VALUES (?, ?, NULL, ?, ?, 0, ?, '{}')`,
      )
      .bind(crypto.randomUUID(), id, code, sev, msg)
      .run();
  }
}

function postFixes(headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/scans/${TOKEN}/fixes`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ sitemapXml: true, pageUrls: ["https://acme.example/about"], format: "zip" }),
  });
}

async function signedWebhook(body: unknown, secret = ENABLED.STRIPE_WEBHOOK_SECRET) {
  const raw = JSON.stringify(body);
  const t = Math.floor(Date.now() / 1000);
  const sig = toHex(await hmacSha256(secret, `${t}.${raw}`));
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": `t=${t},v1=${sig}`, "content-type": "application/json" },
    body: raw,
  });
}

function paidEvent(scanId = SCAN_ID, scanToken = TOKEN) {
  return {
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_test_${scanId}`,
        status: "complete",
        payment_status: "paid",
        client_reference_id: scanId,
        metadata: { product: FILES_PRODUCT_TAG, scan_token: scanToken },
        amount_total: 100,
        currency: "cad",
      },
    },
  };
}

async function grantViaWebhook(scanId = SCAN_ID, scanToken = TOKEN) {
  const { POST } = await import("@/app/api/webhooks/stripe/route");
  const res = await POST(await signedWebhook(paidEvent(scanId, scanToken)));
  expect(res.status).toBe(200);
  return (await res.json()) as { granted?: boolean };
}

async function downloadTokenFor(token = TOKEN) {
  const { GET } = await import("@/app/api/scans/[token]/entitlement/route");
  const res = await GET(new Request(`http://localhost/api/scans/${token}/entitlement`), ctx(token));
  return (await res.json()) as { entitled: boolean; downloadToken?: string; purchase: string };
}

describe("fix files paywall (server-side)", () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    for (const k of [...Object.keys(ENABLED), "PRICE_DISPLAY", "DOWNLOAD_TOKEN_SECRET"]) vi.stubEnv(k, "");
    holder.env = { DB: memoryCheckDb() };
    await seed(holder.env.DB!, SCAN_ID, TOKEN);
    await seed(holder.env.DB!, OTHER_SCAN_ID, OTHER_TOKEN);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function enable() {
    for (const [k, v] of Object.entries(ENABLED)) vi.stubEnv(k, v);
  }

  it("per-page guidance (GET) stays free with no email and no payment", async () => {
    const { GET } = await import("@/app/api/scans/[token]/fixes/route");
    const res = await GET(new Request(`http://localhost/api/scans/${TOKEN}/fixes`), ctx());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { options: Array<{ kind: string; url?: string }>; files?: unknown };
    expect(json.options.some((o) => o.kind === "pageSchema" && o.url === "https://acme.example/about")).toBe(true);
    expect(json).not.toHaveProperty("files");
  });

  it("402 when payments are not configured (disabled state), and nothing is generated", async () => {
    const gen = await import("@/lib/fixes/generate-package");
    const spy = vi.spyOn(gen, "generateFixPackage");
    const { POST } = await import("@/app/api/scans/[token]/fixes/route");
    const res = await POST(postFixes(), ctx());
    expect(res.status).toBe(402);
    expect(((await res.json()) as { code: string }).code).toBe("purchase_unavailable");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("entitlement reports purchase unavailable while disabled", async () => {
    const e = await downloadTokenFor();
    expect(e).toMatchObject({ purchase: "unavailable", entitled: false });
    expect(e.downloadToken).toBeUndefined();
  });

  it("checkout refuses (503) while disabled", async () => {
    const { POST } = await import("@/app/api/scans/[token]/checkout/route");
    const res = await POST(new Request(`http://localhost/api/scans/${TOKEN}/checkout`, { method: "POST" }), ctx());
    expect(res.status).toBe(503);
  });

  it("402 when enabled but this scan is not paid for — JSON export too", async () => {
    enable();
    const { POST } = await import("@/app/api/scans/[token]/fixes/route");
    const zip = await POST(postFixes(), ctx());
    expect(zip.status).toBe(402);
    expect(((await zip.json()) as { code: string }).code).toBe("payment_required");
    const json = await POST(
      new Request(`http://localhost/api/scans/${TOKEN}/fixes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sitemapXml: true, format: "json" }),
      }),
      ctx(),
    );
    expect(json.status).toBe(402);
    const body = (await json.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("files");
  });

  it("an unpaid scan gets no download token", async () => {
    enable();
    const e = await downloadTokenFor();
    expect(e).toMatchObject({ purchase: "available", entitled: false });
    expect(e.downloadToken).toBeUndefined();
  });

  it("webhook rejects a bad signature and grants nothing", async () => {
    enable();
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const res = await POST(await signedWebhook(paidEvent(), "whsec_wrong"));
    expect(res.status).toBe(400);
    expect((await downloadTokenFor()).entitled).toBe(false);
  });

  it("webhook ignores an unpaid session and a session for a different product", async () => {
    enable();
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const unpaid = paidEvent();
    unpaid.data.object.payment_status = "unpaid";
    expect(((await (await POST(await signedWebhook(unpaid))).json()) as { granted?: boolean }).granted).toBeUndefined();
    const other = paidEvent();
    other.data.object.metadata.product = "something_else";
    expect(((await (await POST(await signedWebhook(other))).json()) as { granted?: boolean }).granted).toBeUndefined();
    expect((await downloadTokenFor()).entitled).toBe(false);
  });

  it("403 when paid but the download token is missing, forged, or for another scan", async () => {
    enable();
    expect((await grantViaWebhook()).granted).toBe(true);
    await grantViaWebhook(OTHER_SCAN_ID, OTHER_TOKEN);
    const { POST } = await import("@/app/api/scans/[token]/fixes/route");

    expect((await POST(postFixes(), ctx())).status).toBe(403);
    expect((await POST(postFixes({ "x-download-token": "v1.9999999999999.forged" }), ctx())).status).toBe(403);

    const other = await downloadTokenFor(OTHER_TOKEN);
    expect(other.entitled).toBe(true);
    expect((await POST(postFixes({ "x-download-token": other.downloadToken! }), ctx())).status).toBe(403);
  });

  it("paid entitlement for one scan does not unlock another scan", async () => {
    enable();
    await grantViaWebhook(OTHER_SCAN_ID, OTHER_TOKEN);
    const { POST } = await import("@/app/api/scans/[token]/fixes/route");
    expect((await POST(postFixes(), ctx())).status).toBe(402);
  });

  it("200 zip once paid (webhook) and presenting this scan's signed token", async () => {
    enable();
    await grantViaWebhook();
    const e = await downloadTokenFor();
    expect(e.entitled).toBe(true);
    const { POST } = await import("@/app/api/scans/[token]/fixes/route");
    const res = await POST(postFixes({ "x-download-token": e.downloadToken! }), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/zip");
    const buf = Buffer.from(await res.arrayBuffer());
    expect([buf[0], buf[1]]).toEqual([0x50, 0x4b]);
  });

  it("webhook is idempotent", async () => {
    enable();
    await grantViaWebhook();
    await grantViaWebhook();
    const rows = await holder.env.DB!.prepare(
      "SELECT COUNT(*) AS n FROM readiness_scan_entitlements WHERE scan_id = ?",
    )
      .bind(SCAN_ID)
      .first<{ n: number }>();
    expect(Number(rows?.n)).toBe(1);
  });

  it("success-URL confirm grants only after the provider says the session is paid for this scan", async () => {
    enable();
    const session = {
      id: "cs_test_confirm",
      status: "complete",
      payment_status: "paid",
      client_reference_id: SCAN_ID,
      metadata: { product: FILES_PRODUCT_TAG, scan_token: TOKEN },
      line_items: { data: [{ price: { id: ENABLED.STRIPE_PRICE_ID } }] },
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(session), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/scans/[token]/checkout/confirm/route");

    // A session for a different scan is refused.
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...session, client_reference_id: OTHER_SCAN_ID }), { status: 200 }),
    );
    const refused = await POST(
      new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ sessionId: "cs_test_confirm" }) }),
      ctx(),
    );
    expect(refused.status).toBe(402);

    const ok = await POST(
      new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ sessionId: "cs_test_confirm" }) }),
      ctx(),
    );
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { entitled: boolean; downloadToken: string };
    expect(body.entitled).toBe(true);
    expect(body.downloadToken).toMatch(/^v1\./);
    const [url, init] = fetchMock.mock.calls.at(-1)! as unknown as [string, RequestInit];
    expect(url).toContain("/v1/checkout/sessions/cs_test_confirm");
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${ENABLED.STRIPE_SECRET_KEY}`);
  });

  it("checkout returns the provider URL and binds the session to this scan", async () => {
    enable();
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ id: "cs_test_new", url: "https://checkout.example/pay" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/scans/[token]/checkout/route");
    const res = await POST(
      new Request(`https://preview.example/api/scans/${TOKEN}/checkout`, { method: "POST" }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { url: string }).url).toBe("https://checkout.example/pay");
    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    const form = new URLSearchParams(String(init.body));
    expect(form.get("client_reference_id")).toBe(SCAN_ID);
    expect(form.get("success_url")).toBe(
      `https://preview.example/scan/${TOKEN}?checkout={CHECKOUT_SESSION_ID}#fix-package`,
    );
  });
});
