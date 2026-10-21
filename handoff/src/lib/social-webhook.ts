import type { Sql } from "@/db/sql";
import { signIntakeBody } from "./intake/sign";
import { postOutcome, recordOutcome, syncSocialAccounts, type SendMode } from "./social";
import type { ZernioClient, ZernioPostPlatform } from "./zernio";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

/** Secret set on the Zernio webhook. Empty means every delivery is refused. */
export function zernioWebhookSecret(): string {
  const fromProcess = process.env.ZERNIO_WEBHOOK_SECRET?.trim() ?? "";
  if (fromProcess) return fromProcess;
  const holder = globalThis as typeof globalThis & {
    [CLOUDFLARE_CONTEXT]?: { env?: { ZERNIO_WEBHOOK_SECRET?: unknown } };
  };
  const value = holder[CLOUDFLARE_CONTEXT]?.env?.ZERNIO_WEBHOOK_SECRET;
  return typeof value === "string" ? value.trim() : "";
}

/** The events HQ subscribes to. */
export const ZERNIO_WEBHOOK_EVENTS = [
  "post.scheduled",
  "post.published",
  "post.failed",
  "post.partial",
  "post.cancelled",
  "post.platform.published",
  "post.platform.failed",
  "post.tiktok.url_resolved",
  "account.connected",
  "account.disconnected",
] as const;

/** X-Zernio-Signature is the lowercase hex HMAC-SHA256 of the raw body. */
export async function verifyZernioSignature(secret: string, body: string, signature: string): Promise<boolean> {
  if (!secret || !signature) return false;
  const expected = await signIntakeBody(secret, body);
  const got = signature.trim().toLowerCase();
  if (expected.length !== got.length) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) diff |= expected.charCodeAt(index) ^ got.charCodeAt(index);
  return diff === 0;
}

type Payload = {
  id?: unknown;
  event?: unknown;
  test?: unknown;
  profiles?: { id?: string; externalId?: string | null }[];
  post?: { id?: string; status?: string; platforms?: ZernioPostPlatform[] };
  platform?: { name?: string; status?: string; publishedUrl?: string; error?: string };
  account?: { accountId?: string; id?: string };
};

export type WebhookResult = "duplicate" | "ignored" | "updated" | "unknown_post";

/**
 * Applies one Zernio delivery. Post events update the matching social_posts row (status, errors, public links).
 * account.disconnected marks the account for sign-in again; account.connected re-reads that client's accounts.
 */
export async function applyZernioEvent(
  sql: Sql,
  raw: unknown,
  now: number,
  zernio: ZernioClient | null,
): Promise<WebhookResult> {
  const payload = (raw ?? {}) as Payload;
  const id = typeof payload.id === "string" ? payload.id : "";
  const event = typeof payload.event === "string" ? payload.event : "";
  if (!id || !event || payload.test === true) return "ignored";
  const seen = await sql.get<{ id: string }>("SELECT id FROM social_webhook_events WHERE id = ?", [id]);
  if (seen) return "duplicate";
  const result = await handle(sql, payload, event, now, zernio);
  await sql.run("INSERT INTO social_webhook_events (id, event, received_at) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING", [
    id,
    event,
    now,
  ]);
  return result;
}

async function handle(sql: Sql, payload: Payload, event: string, now: number, zernio: ZernioClient | null): Promise<WebhookResult> {
  if (event === "account.disconnected") {
    const accountId = payload.account?.accountId ?? payload.account?.id;
    if (!accountId) return "ignored";
    await sql.run("UPDATE social_accounts SET is_active = 0, synced_at = ? WHERE id = ?", [now, accountId]);
    return "updated";
  }
  if (event === "account.connected") {
    const organizationId = payload.profiles?.[0]?.externalId;
    if (!organizationId || !zernio) return "ignored";
    const organization = await sql.get<{ id: string; name: string }>("SELECT id, name FROM organizations WHERE id = ?", [
      organizationId,
    ]);
    if (!organization) return "ignored";
    await syncSocialAccounts(sql, zernio, organization, now);
    return "updated";
  }
  if (!event.startsWith("post.") || !payload.post?.id) return "ignored";
  const row = await sql.get<{ id: string; mode: SendMode; error: string | null }>(
    "SELECT id, mode, error FROM social_posts WHERE zernio_post_id = ?",
    [payload.post.id],
  );
  if (!row) return "unknown_post";
  if (event.startsWith("post.platform.") || event === "post.tiktok.url_resolved") {
    const target: ZernioPostPlatform = {
      platform: payload.platform?.name ?? "",
      status: payload.platform?.status,
      accountId: payload.account?.accountId,
      publishedUrl: payload.platform?.publishedUrl,
      error: payload.platform?.error,
    };
    const outcome = postOutcome({ status: payload.post.status, platforms: [target] }, row.mode);
    const errors = [row.error, outcome.error].filter(Boolean).join("\n") || null;
    await recordOutcome(sql, row.id, { ...outcome, error: errors?.slice(0, 1000) ?? null }, now);
    return "updated";
  }
  await recordOutcome(sql, row.id, postOutcome(payload.post, row.mode), now);
  return "updated";
}
