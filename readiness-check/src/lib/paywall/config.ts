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
 * Any required value missing → paywall is "unavailable": nothing can be bought
 * and the file endpoints refuse with 402.
 */

export type PaywallEnv = Record<string, string | undefined>;

export type PaywallConfig =
  | {
      enabled: true;
      secretKey: string;
      webhookSecret: string;
      priceId: string;
      priceDisplay: string | null;
      tokenSecret: string | null;
    }
  | {
      enabled: false;
      missing: string[];
      priceDisplay: string | null;
    };

const REQUIRED = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID"] as const;

function read(env: PaywallEnv, name: string): string {
  return env[name]?.trim() ?? "";
}

export function priceDisplayFrom(env: PaywallEnv): string | null {
  const raw = read(env, "PRICE_DISPLAY");
  if (!raw) return null;
  return raw.slice(0, 40);
}

export function paywallConfig(env: PaywallEnv = process.env): PaywallConfig {
  const missing = REQUIRED.filter((name) => !read(env, name));
  const priceDisplay = priceDisplayFrom(env);
  if (missing.length > 0) {
    return { enabled: false, missing: [...missing], priceDisplay };
  }
  return {
    enabled: true,
    secretKey: read(env, "STRIPE_SECRET_KEY"),
    webhookSecret: read(env, "STRIPE_WEBHOOK_SECRET"),
    priceId: read(env, "STRIPE_PRICE_ID"),
    priceDisplay,
    tokenSecret: read(env, "DOWNLOAD_TOKEN_SECRET") || null,
  };
}

/** Product tag written into Checkout metadata and required on webhook events. */
export const FILES_PRODUCT_TAG = "schema_fix_files";
