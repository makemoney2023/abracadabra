/**
 * Errors from Google's Search Console and OAuth endpoints, reduced to a kind and an HTTP status.
 * The message never carries a response body, a token, a key or a URL with a query string: only the kind, the status
 * and Google's short enum code (for example PERMISSION_DENIED or invalid_grant) when it looks like one.
 */
export type SearchErrorKind =
  | "not_configured"
  | "auth"
  | "access_lost"
  | "rate_limited"
  | "bad_request"
  | "not_found"
  | "server"
  | "network";

export class SearchApiError extends Error {
  readonly kind: SearchErrorKind;
  readonly status: number;
  readonly code: string | null;
  readonly retryAfterMs: number | null;

  constructor(kind: SearchErrorKind, status: number, code: string | null = null, retryAfterMs: number | null = null) {
    const safeCode = safeErrorCode(code);
    super(`Search Console ${kind}${status ? ` (HTTP ${status}${safeCode ? `: ${safeCode}` : ""})` : safeCode ? ` (${safeCode})` : ""}`);
    this.name = "SearchApiError";
    this.kind = kind;
    this.status = status;
    this.code = safeCode;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Google's error codes are short enums. Anything else (free text, ids, emails) is dropped. */
export function safeErrorCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[A-Za-z_]{1,40}$/.test(value) ? value : null;
}

export function isSearchApiError(error: unknown): error is SearchApiError {
  return error instanceof SearchApiError;
}

/** A short, safe line for logs and the last_error column. */
export function describeSearchError(error: unknown): string {
  if (error instanceof SearchApiError) return error.message;
  return "Search Console request failed.";
}
