import type { Change } from "@/lib/search/report";

const whole = new Intl.NumberFormat("en-US");

export function formatCount(value: number): string {
  return whole.format(value);
}

export function formatCtr(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export function formatPosition(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}

/** Clicks and impressions change as a percent, CTR in percentage points, position in places. */
export function formatChange(kind: "clicks" | "impressions" | "ctr" | "position", change: Change): string | null {
  if (change.delta === null) return null;
  const sign = change.delta > 0 ? "+" : change.delta < 0 ? "−" : "±";
  const size = Math.abs(change.delta);
  if (kind === "ctr") return `${sign}${(size * 100).toFixed(1)} pts`;
  if (kind === "position") return `${sign}${size.toFixed(1)}`;
  return `${sign}${(size * 100).toFixed(size >= 10 ? 0 : 1)}%`;
}

export function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
