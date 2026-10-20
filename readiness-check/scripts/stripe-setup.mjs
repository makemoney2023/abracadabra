#!/usr/bin/env node
/**
 * One-time Stripe setup for the Schema fix-file paywall. TEST MODE ONLY.
 *
 * Creates (or finds) — idempotently, safe to re-run:
 *   - Product  id "schema_fix_files"               "Schema fix files"
 *   - Price    lookup_key "schema_fix_files_14999_usd"   $149.99 one-time, on that product
 *   - Coupon   id "schema_files_credit_10_usd"     $10 off, once
 *
 * Prints only the IDs, as the env lines to set on the Worker:
 *   STRIPE_PRICE_ID=price_…
 *   STRIPE_CREDIT_COUPON_ID=schema_files_credit_10_usd
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_… node scripts/stripe-setup.mjs
 *   (optional) PRICE_AMOUNT_CENTS=14999 CREDIT_AMOUNT_CENTS=1000 PRICE_CURRENCY=usd
 *
 * Refuses live keys (sk_live_/rk_live_). It never prints the key.
 */

const API = "https://api.stripe.com/v1";
const PRODUCT_ID = "schema_fix_files";

const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
const priceCents = Number(process.env.PRICE_AMOUNT_CENTS ?? 14999);
const creditCents = Number(process.env.CREDIT_AMOUNT_CENTS ?? 1000);
const currency = (process.env.PRICE_CURRENCY ?? "usd").toLowerCase();

function fail(message) {
  console.error(`stripe-setup: ${message}`);
  process.exit(1);
}

if (!key) fail("set STRIPE_SECRET_KEY to a test-mode key (sk_test_…).");
if (!/^(sk|rk)_test_/.test(key)) fail("refusing: this script only runs with a test-mode key (sk_test_ / rk_test_).");
if (!Number.isInteger(priceCents) || priceCents <= 0) fail("PRICE_AMOUNT_CENTS must be a positive integer.");
if (!Number.isInteger(creditCents) || creditCents < 0 || creditCents >= priceCents)
  fail("CREDIT_AMOUNT_CENTS must be an integer below the price.");
if (!/^[a-z]{3}$/.test(currency)) fail("PRICE_CURRENCY must be a 3-letter ISO code.");

const lookupKey = `schema_fix_files_${priceCents}_${currency}`;
const couponId = `schema_files_credit_${creditCents / 100}_${currency}`.replace(/\./g, "_");

async function stripe(method, path, form, idempotencyKey) {
  const headers = { authorization: `Bearer ${key}` };
  let body;
  if (form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(form).toString();
  }
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  const res = await fetch(`${API}${path}`, { method, headers, body });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function ensureProduct() {
  const got = await stripe("GET", `/products/${PRODUCT_ID}`);
  if (got.status === 200) return got.data.id;
  if (got.status !== 404) fail(`product lookup failed (${got.status}): ${got.data?.error?.message ?? "unknown"}`);
  const made = await stripe(
    "POST",
    "/products",
    {
      id: PRODUCT_ID,
      name: "Schema fix files",
      description: "The generated fix files for one Schema scan: llms.txt, structured data, and sitemap.",
      "metadata[product]": PRODUCT_ID,
    },
    `product-${PRODUCT_ID}`,
  );
  if (made.status !== 200) fail(`product create failed (${made.status}): ${made.data?.error?.message ?? "unknown"}`);
  return made.data.id;
}

async function ensurePrice(productId) {
  const found = await stripe("GET", `/prices?active=true&lookup_keys[]=${encodeURIComponent(lookupKey)}&limit=1`);
  if (found.status !== 200) fail(`price lookup failed (${found.status}): ${found.data?.error?.message ?? "unknown"}`);
  const existing = found.data.data?.[0];
  if (existing) {
    if (existing.unit_amount !== priceCents || existing.currency !== currency || existing.product !== productId)
      fail(`price with lookup_key ${lookupKey} exists but doesn't match; fix it in the dashboard.`);
    return existing.id;
  }
  const made = await stripe(
    "POST",
    "/prices",
    {
      product: productId,
      unit_amount: String(priceCents),
      currency,
      lookup_key: lookupKey,
      "metadata[product]": PRODUCT_ID,
    },
    `price-${lookupKey}`,
  );
  if (made.status !== 200) fail(`price create failed (${made.status}): ${made.data?.error?.message ?? "unknown"}`);
  return made.data.id;
}

async function ensureCoupon() {
  if (creditCents === 0) return null;
  const got = await stripe("GET", `/coupons/${couponId}`);
  if (got.status === 200) {
    if (got.data.amount_off !== creditCents || got.data.currency !== currency)
      fail(`coupon ${couponId} exists but doesn't match; fix it in the dashboard.`);
    return got.data.id;
  }
  if (got.status !== 404) fail(`coupon lookup failed (${got.status}): ${got.data?.error?.message ?? "unknown"}`);
  const made = await stripe(
    "POST",
    "/coupons",
    {
      id: couponId,
      name: "Checkout credit",
      amount_off: String(creditCents),
      currency,
      duration: "once",
      "metadata[product]": PRODUCT_ID,
    },
    `coupon-${couponId}`,
  );
  if (made.status !== 200) fail(`coupon create failed (${made.status}): ${made.data?.error?.message ?? "unknown"}`);
  return made.data.id;
}

const productId = await ensureProduct();
const priceId = await ensurePrice(productId);
const coupon = await ensureCoupon();

console.log(`STRIPE_PRODUCT_ID=${productId}`);
console.log(`STRIPE_PRICE_ID=${priceId}`);
if (coupon) console.log(`STRIPE_CREDIT_COUPON_ID=${coupon}`);
