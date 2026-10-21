/** Public Schema scanner. The Readiness Check stays on its own hostname. */
export const SCHEMA_ORIGIN = "https://schema.abra-ca-dabra.app";

export function schemaUrl(): string {
  return (process.env.NEXT_PUBLIC_SCHEMA_URL || SCHEMA_ORIGIN).replace(/\/$/, "");
}

function hostOf(raw: string): string | null {
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

/**
 * `/` on the Readiness Check hostname opens the check.
 * The Schema hostname, local dev, and every other path stay put.
 */
export function homeRedirectPath(host: string | null, pathname: string): "/check" | null {
  if (pathname !== "/" || !host) return null;
  const checkHost = process.env.NEXT_PUBLIC_CHECK_URL
    ? hostOf(process.env.NEXT_PUBLIC_CHECK_URL)
    : null;
  if (checkHost && host === checkHost) return "/check";
  return null;
}
