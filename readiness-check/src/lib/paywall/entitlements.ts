import type { BoundSql } from "@/lib/cloudflare/sql";

export type Entitlement = {
  scanId: string;
  provider: string;
  checkoutSessionId: string;
  paymentStatus: string;
  createdAt: number;
};

export async function findEntitlement(db: BoundSql, scanId: string): Promise<Entitlement | null> {
  const row = await db
    .prepare(
      `SELECT scan_id, provider, checkout_session_id, payment_status, created_at
       FROM readiness_scan_entitlements WHERE scan_id = ?`,
    )
    .bind(scanId)
    .first<{
      scan_id: string;
      provider: string;
      checkout_session_id: string;
      payment_status: string;
      created_at: number;
    }>();
  if (!row || row.payment_status !== "paid") return null;
  return {
    scanId: row.scan_id,
    provider: row.provider,
    checkoutSessionId: row.checkout_session_id,
    paymentStatus: row.payment_status,
    createdAt: row.created_at,
  };
}

/** Idempotent: a repeat webhook or a confirm after the webhook is a no-op. */
export async function grantEntitlement(
  db: BoundSql,
  input: {
    scanId: string;
    checkoutSessionId: string;
    amountTotal?: number | null;
    currency?: string | null;
    provider?: string;
  },
  now = Date.now(),
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO readiness_scan_entitlements
         (scan_id, provider, checkout_session_id, payment_status, amount_total, currency, created_at)
       VALUES (?, ?, ?, 'paid', ?, ?, ?)`,
    )
    .bind(
      input.scanId,
      input.provider ?? "stripe",
      input.checkoutSessionId,
      input.amountTotal ?? null,
      input.currency ?? null,
      now,
    )
    .run();
}

export async function findScanById(
  db: BoundSql,
  scanId: string,
): Promise<{ id: string; publicToken: string; domain: string } | null> {
  const row = await db
    .prepare("SELECT id, public_token, domain FROM readiness_scans WHERE id = ?")
    .bind(scanId)
    .first<{ id: string; public_token: string; domain: string }>();
  return row ? { id: row.id, publicToken: row.public_token, domain: row.domain } : null;
}
