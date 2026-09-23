export function checkUrl(): string {
  return (process.env.NEXT_PUBLIC_CHECK_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function calLink(): string | null {
  const value = process.env.NEXT_PUBLIC_CAL_LINK?.trim();
  return value ? value : null;
}

/** Server-only. Empty when the webhook is not configured. */
export function calWebhookSecret(): string {
  return process.env.CAL_WEBHOOK_SECRET?.trim() ?? "";
}
