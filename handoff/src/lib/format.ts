/**
 * Small display formatters shared by the HQ screens.
 *
 * All functions are pure. They never read the clock on their own; callers
 * pass `now` so output is stable in tests and server renders.
 */

const COUNT = new Intl.NumberFormat("en-US");

const MONTH_DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

/** 1240 → "1,240" */
export function formatCount(value: number): string {
  return COUNT.format(value);
}

/**
 * Compact age for lists: "now", "5m", "2h", "3d", then "Mar 4", and
 * "Mar 4, 2025" once the date falls in a different year than `now`.
 */
export function formatRelative(value: DateInput, now: DateInput = new Date()): string {
  const at = toDate(value);
  const ref = toDate(now);
  const diff = ref.getTime() - at.getTime();

  if (!Number.isFinite(diff) || diff < MINUTE) return "now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d`;

  return at.getUTCFullYear() === ref.getUTCFullYear()
    ? MONTH_DAY.format(at)
    : MONTH_DAY_YEAR.format(at);
}

/** Cents → "$1,250" or "$1,250.50". Blank for a missing amount. */
export function formatMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "";
  const dollars = cents / 100;
  const whole = Number.isInteger(dollars);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

/** "Ada Lovelace" → "AL", "ada" → "A", blank → "?" */
export function initials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}
