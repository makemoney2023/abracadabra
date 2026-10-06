/** Blank stays empty. A real YYYY-MM-DD becomes UTC midnight. Anything else is bad. */
export function dayToUtc(raw: string): number | null | "bad" {
  const text = raw.trim();
  if (text.length === 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "bad";
  const ms = Date.parse(`${text}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) return "bad";
  if (new Date(ms).toISOString().slice(0, 10) !== text) return "bad";
  return ms;
}

export function dayLabel(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
