import { hmacSha256, timingSafeEqual, toHex } from "@/lib/paywall/crypto";
import { FILES_PRODUCT_TAG } from "@/lib/paywall/config";

/**
 * Minimal Stripe Checkout client over fetch (no SDK, Worker-friendly).
 * Only the calls the file paywall needs: create a session, read a session,
 * and verify a webhook signature.
 */

const API = "https://api.stripe.com/v1";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type CheckoutSession = {
  id: string;
  url?: string | null;
  status?: string | null;
  payment_status?: string | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
  amount_total?: number | null;
  currency?: string | null;
  line_items?: { data?: Array<{ price?: { id?: string } | null }> } | null;
};

export class StripeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function stripeRequest<T>(
  secretKey: string,
  path: string,
  init: { method: "GET" | "POST"; form?: URLSearchParams },
  fetchImpl: FetchLike,
): Promise<T> {
  const res = await fetchImpl(`${API}${path}`, {
    method: init.method,
    headers: {
      authorization: `Bearer ${secretKey}`,
      ...(init.form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: init.form?.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    // Never echo the key; Stripe's message is safe to log.
    throw new StripeError(data.error?.message ?? `Stripe request failed (${res.status})`, res.status);
  }
  return data;
}

export async function createFilesCheckoutSession(
  args: {
    secretKey: string;
    priceId: string;
    scanId: string;
    scanToken: string;
    domain: string;
    successUrl: string;
    cancelUrl: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<CheckoutSession> {
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("line_items[0][price]", args.priceId);
  form.set("line_items[0][quantity]", "1");
  form.set("client_reference_id", args.scanId);
  form.set("metadata[product]", FILES_PRODUCT_TAG);
  form.set("metadata[scan_id]", args.scanId);
  form.set("metadata[scan_token]", args.scanToken);
  form.set("metadata[domain]", args.domain);
  form.set("success_url", args.successUrl);
  form.set("cancel_url", args.cancelUrl);
  return stripeRequest<CheckoutSession>(
    args.secretKey,
    "/checkout/sessions",
    { method: "POST", form },
    fetchImpl,
  );
}

export async function retrieveCheckoutSession(
  secretKey: string,
  sessionId: string,
  fetchImpl: FetchLike = fetch,
): Promise<CheckoutSession> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    throw new StripeError("Invalid session id", 400);
  }
  return stripeRequest<CheckoutSession>(
    secretKey,
    `/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=line_items`,
    { method: "GET" },
    fetchImpl,
  );
}

/**
 * True when a session is a completed, paid purchase of the files for this scan.
 * Checks the scan binding, the product tag, and (when line items are present) the price.
 */
export function sessionGrantsFiles(
  session: CheckoutSession,
  expect: { scanId: string; scanToken: string; priceId?: string },
): boolean {
  if (session.payment_status !== "paid") return false;
  if (session.status && session.status !== "complete") return false;
  if (session.client_reference_id !== expect.scanId) return false;
  const meta = session.metadata ?? {};
  if (meta.product !== FILES_PRODUCT_TAG) return false;
  if (meta.scan_token !== expect.scanToken) return false;
  const prices = session.line_items?.data?.map((li) => li.price?.id).filter(Boolean) ?? [];
  if (expect.priceId && prices.length > 0 && !prices.includes(expect.priceId)) return false;
  return true;
}

/** Stripe webhook signature check (`Stripe-Signature: t=…,v1=…`), 5-minute tolerance. */
export async function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!header || !secret) return false;
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2).map((s) => s?.trim());
    if (k === "t" && v) timestamp = Number(v);
    if (k === "v1" && v) signatures.push(v);
  }
  if (timestamp === null || !Number.isFinite(timestamp) || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;
  const expected = toHex(await hmacSha256(secret, `${timestamp}.${rawBody}`));
  return signatures.some((sig) => timingSafeEqual(expected, sig));
}
