/**
 * Paywall for the generated fix files (zip / data export).
 *
 * The score, pillars, issues, and per-page guidance are always free.
 * Only file generation + download is gated, and only server-side.
 *
 * Provider: Stripe Checkout, configured entirely by env:
 * - STRIPE_SECRET_KEY      (secret)  server-side API key
 * - STRIPE_WEBHOOK_SECRET  (secret)  signing secret for /api/webhooks/stripe
 * - STRIPE_PRICE_ID        (var)     the one-time Price for "the files for one scan"
 * - PRICE_DISPLAY          (var, optional) label shown on the buy button, e.g. a formatted amount.
 *                                   Not used for charging; Stripe charges STRIPE_PRICE_ID.
 * - DOWNLOAD_TOKEN_SECRET  (secret, optional) signs short-lived download tokens.
 *                                   Defaults to a key derived from STRIPE_WEBHOOK_SECRET.
 *
 * Offer (display only; Stripe charges the Price minus the coupon):
 * - PRICE_AMOUNT_CENTS     (var) list price in minor units, e.g. 9999. Formats the label
 *                                when PRICE_DISPLAY is unset, and works out "you pay".
 * - PRICE_CURRENCY         (var) ISO code, default "usd". Must match the Stripe Price.
 * - CREDIT_AMOUNT_CENTS    (var, optional) credit taken off at checkout, e.g. 1000.
 * - STRIPE_CREDIT_COUPON_ID (var/secret) the Stripe coupon applied via discounts[].
 *                                Required whenever CREDIT_AMOUNT_CENTS is set, so the panel
 *                                never promises a credit Stripe won't apply.
 *
 * Any required value missing → paywall is "unavailable": nothing can be bought
 * and the file endpoints refuse with 402.
 */

export type PaywallEnv = Record<string, string | undefined>;

export type Offer = {
  /** "$99.99", or null when no price is configured (button then reads "Buy the files"). */
  priceDisplay: string | null;
  /** "$10", or null when there's no checkout credit. */
  creditDisplay: string | null;
  /** "$89.99" — what the buyer pays after the credit; null without a credit. */
  payDisplay: string | null;
  currency: string;
};

export type PaywallConfig =
  | {
      enabled: true;
      secretKey: string;
      webhookSecret: string;
      priceId: string;
      couponId: string | null;
      priceDisplay: string | null;
      offer: Offer;
      tokenSecret: string | null;
    }
  | {
      enabled: false;
      missing: string[];
      priceDisplay: string | null;
      offer: Offer;
    };

const REQUIRED = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID"] as const;

function read(env: PaywallEnv, name: string): string {
  return env[name]?.trim() ?? "";
}

function cents(env: PaywallEnv, name: string): number | null {
  const raw = read(env, name);
  if (!/^\d{1,9}$/.test(raw)) return null;
  const value = Number(raw);
  return value > 0 ? value : null;
}

/** "$99.99", "$10" (whole amounts drop the cents), "CA$10" for non-USD dollar codes. */
export function formatMoney(amountCents: number, currency = "usd"): string {
  const whole = amountCents % 100 === 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

export function priceDisplayFrom(env: PaywallEnv): string | null {
  const raw = read(env, "PRICE_DISPLAY");
  if (raw) return raw.slice(0, 40);
  const price = cents(env, "PRICE_AMOUNT_CENTS");
  return price ? formatMoney(price, currencyFrom(env)) : null;
}

function currencyFrom(env: PaywallEnv): string {
  const raw = read(env, "PRICE_CURRENCY").toLowerCase();
  return /^[a-z]{3}$/.test(raw) ? raw : "usd";
}

export function offerFrom(env: PaywallEnv): Offer {
  const currency = currencyFrom(env);
  const priceDisplay = priceDisplayFrom(env);
  const price = cents(env, "PRICE_AMOUNT_CENTS");
  const credit = cents(env, "CREDIT_AMOUNT_CENTS");
  if (!price || !credit || credit >= price) {
    return { priceDisplay, creditDisplay: null, payDisplay: null, currency };
  }
  return {
    priceDisplay,
    creditDisplay: formatMoney(credit, currency),
    payDisplay: formatMoney(price - credit, currency),
    currency,
  };
}

export function paywallConfig(env: PaywallEnv = process.env): PaywallConfig {
  const offer = offerFrom(env);
  const priceDisplay = offer.priceDisplay;
  const couponId = read(env, "STRIPE_CREDIT_COUPON_ID") || null;
  const missing: string[] = REQUIRED.filter((name) => !read(env, name));
  // A credit on the panel must be a credit at checkout.
  if (offer.creditDisplay && !couponId) missing.push("STRIPE_CREDIT_COUPON_ID");
  if (missing.length > 0) {
    return { enabled: false, missing, priceDisplay, offer };
  }
  return {
    enabled: true,
    secretKey: read(env, "STRIPE_SECRET_KEY"),
    webhookSecret: read(env, "STRIPE_WEBHOOK_SECRET"),
    priceId: read(env, "STRIPE_PRICE_ID"),
    couponId,
    priceDisplay,
    offer,
    tokenSecret: read(env, "DOWNLOAD_TOKEN_SECRET") || null,
  };
}

/** Product tag written into Checkout metadata and required on webhook events. */
export const FILES_PRODUCT_TAG = "schema_fix_files";
