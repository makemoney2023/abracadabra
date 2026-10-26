import { addDays, SEARCH_RANGES, searchWindow, MAX_RANGE_DAYS, type SearchPeriod, type SearchRangeId, type SearchWindow } from "./report";

/**
 * Date windows for the agent API: a preset range (7d, 28d, 90d, 16m) or custom start/end, plus an optional comparison
 * (the same number of days right before, a custom period, or none). Everything is clamped to what HQ keeps: daily rows
 * for 16 months back from the newest day HQ holds (the anchor), at most 500 days per period.
 */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export type PeriodQuery = {
  range: SearchRangeId | null;
  start: string | null;
  end: string | null;
  compare: "previous" | "yoy" | "none" | null;
  /** Include the newest days Google may still change (is_final = 0). Default false: end on the newest final day. */
  includePartial: boolean;
  compareStart: string | null;
  compareEnd: string | null;
};

export type ResolvedWindow = { window: SearchWindow; clamped: boolean; floor: string; anchor: string };

function realDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

function days(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1;
}

/** Reads range, start, end, compare, compare_start, compare_end. Bad values are a message for a 400. */
export function parsePeriodQuery(get: (name: string) => string | null): { ok: true; value: PeriodQuery } | { ok: false; message: string } {
  const text = (name: string) => get(name)?.trim() || null;
  const rangeText = text("range");
  const range = rangeText ? (SEARCH_RANGES.find((item) => item.id === rangeText)?.id ?? null) : null;
  if (rangeText && !range) return { ok: false, message: "range must be 7d, 28d, 90d, or 16m." };
  const start = text("start");
  const end = text("end");
  const compareStart = text("compare_start");
  const compareEnd = text("compare_end");
  for (const [name, value] of [["start", start], ["end", end], ["compare_start", compareStart], ["compare_end", compareEnd]] as const) {
    if (value && !realDay(value)) return { ok: false, message: `${name} must be a date like 2026-10-01.` };
  }
  if (range && (start || end)) return { ok: false, message: "Use range or start/end, not both." };
  if (end && !start) return { ok: false, message: "end needs start." };
  if (start && end && start > end) return { ok: false, message: "start must be on or before end." };
  const compareText = text("compare");
  if (compareText && compareText !== "previous" && compareText !== "yoy" && compareText !== "none") {
    return { ok: false, message: "compare must be previous, yoy, or none." };
  }
  const partialText = text("include_partial");
  if (partialText && partialText !== "0" && partialText !== "1") return { ok: false, message: "include_partial must be 0 or 1." };
  if ((compareStart && !compareEnd) || (compareEnd && !compareStart)) return { ok: false, message: "compare_start and compare_end go together." };
  if (compareStart && compareEnd && compareStart > compareEnd) return { ok: false, message: "compare_start must be on or before compare_end." };
  if (compareStart && compareText && compareText !== "previous") return { ok: false, message: "compare dates go with no compare (or compare=previous)." };
  return {
    ok: true,
    value: { range, start, end, compare: compareText as PeriodQuery["compare"], compareStart, compareEnd, includePartial: partialText === "1" },
  };
}

export const DEFAULT_PERIOD: PeriodQuery = { range: null, start: null, end: null, compare: null, compareStart: null, compareEnd: null, includePartial: false };

/** The same day one year earlier (Feb 29 becomes Feb 28). */
export function yearBefore(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const last = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
  return `${year - 1}-${String(month).padStart(2, "0")}-${String(Math.min(date, last)).padStart(2, "0")}`;
}

/** Clamps one period into [floor, anchor] and to MAX_RANGE_DAYS (keeping the end). null when nothing is left. */
function clampPeriod(start: string, end: string, floor: string, anchor: string): { period: SearchPeriod | null; clamped: boolean } {
  let from = start < floor ? floor : start;
  const to = end > anchor ? anchor : end;
  let clamped = from !== start || to !== end;
  if (from > to) return { period: null, clamped: true };
  if (days(from, to) > MAX_RANGE_DAYS) {
    from = addDays(to, -(MAX_RANGE_DAYS - 1));
    clamped = true;
  }
  return { period: { start: from, end: to, days: days(from, to) }, clamped };
}

/** The window for one property, given its anchor (newest day HQ holds, else yesterday UTC). */
export function resolveWindow(query: PeriodQuery, anchor: string): ResolvedWindow {
  const floor = searchWindow("16m", anchor).current.start;
  let clamped = false;
  let current: SearchPeriod;
  let presetPrevious: SearchPeriod | null = null;
  if (query.start) {
    const fit = clampPeriod(query.start, query.end ?? anchor, floor, anchor);
    clamped = fit.clamped;
    // Nothing kept in those dates: an empty one-day window at the floor or anchor, so reads come back empty, not wrong.
    const edge = (query.end ?? anchor) < floor ? floor : anchor;
    current = fit.period ?? { start: edge, end: edge, days: 1 };
  } else {
    const preset = searchWindow(query.range ?? "28d", anchor);
    current = preset.current;
    presetPrevious = preset.previous;
  }
  let previous: SearchPeriod | null = null;
  if (query.compareStart && query.compareEnd) {
    const fit = clampPeriod(query.compareStart, query.compareEnd, floor, anchor);
    previous = fit.period;
    clamped = clamped || fit.clamped;
  } else if (query.compare === "yoy") {
    // Year over year: the same dates a year earlier, only as far back as HQ keeps (16 months).
    const fit = clampPeriod(yearBefore(current.start), yearBefore(current.end), floor, anchor);
    previous = fit.period;
    clamped = clamped || fit.clamped;
  } else if (query.compare !== "none") {
    if (!query.start) previous = presetPrevious;
    else {
      const prevEnd = addDays(current.start, -1);
      const fit = clampPeriod(addDays(prevEnd, -(current.days - 1)), prevEnd, floor, anchor);
      previous = fit.period;
      clamped = clamped || fit.clamped;
    }
    if (previous && previous.start < floor) previous = null;
  }
  return { window: { current, previous }, clamped, floor, anchor };
}
