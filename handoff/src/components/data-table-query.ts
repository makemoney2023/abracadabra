/**
 * URL-state helpers for `DataTable`: search, filters, page and page size.
 *
 * Every piece of table state lives in the query string, so a filtered or
 * paged list can be linked, refreshed, and rendered on the server. These
 * helpers are pure; `DataTable` wires them to the page's `searchParams`.
 */

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export type RawQuery = Record<string, string | string[] | undefined>;

/** Next hands a repeated param as an array. Use the first value, trimmed. */
export function firstParam(value: string | string[] | undefined): string {
  const one = Array.isArray(value) ? value[0] : value;
  return typeof one === "string" ? one.trim() : "";
}

/** `?page=` as a whole number, 1 or more. Anything else is page 1. */
export function parsePage(raw: string | undefined): number {
  if (!raw) return 1;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

/** `?size=` limited to the allowed sizes. Anything else is the default. */
export function parsePageSize(
  raw: string | undefined,
  fallback: number = DEFAULT_PAGE_SIZE,
  sizes: readonly number[] = PAGE_SIZES,
): number {
  const value = Number(raw);
  return Number.isInteger(value) && sizes.includes(value) ? value : fallback;
}

/** The sizes offered in the footer. The page's default is always one of them. */
export function pageSizeChoices(fallback: number, sizes: readonly number[] = PAGE_SIZES): number[] {
  return [...new Set([...sizes, fallback])].sort((a, b) => a - b);
}

export type Paged<Row> = {
  rows: Row[];
  page: number;
  pages: number;
  size: number;
  total: number;
  /** 1-based position of the first and last row on this page. 0 when empty. */
  from: number;
  to: number;
};

/** One page of rows. A page past the end clamps to the last page. */
export function paginate<Row>(rows: Row[], page: number, size: number): Paged<Row> {
  const total = rows.length;
  const safeSize = Math.max(1, Math.floor(size));
  const pages = Math.max(1, Math.ceil(total / safeSize));
  const current = Math.min(Math.max(1, Math.floor(page)), pages);
  const start = (current - 1) * safeSize;
  const slice = rows.slice(start, start + safeSize);
  return {
    rows: slice,
    page: current,
    pages,
    size: safeSize,
    total,
    from: total === 0 ? 0 : start + 1,
    to: total === 0 ? 0 : start + slice.length,
  };
}

export type PageItem = number | "gap";

/** Page numbers to show: first, last, and two either side of the current one. */
export function pageWindow(page: number, pages: number, around = 1): PageItem[] {
  if (pages <= 1) return [1];
  const keep = new Set<number>([1, pages]);
  for (let n = page - around; n <= page + around; n += 1) {
    if (n >= 1 && n <= pages) keep.add(n);
  }
  const sorted = [...keep].sort((a, b) => a - b);
  const out: PageItem[] = [];
  let last = 0;
  for (const n of sorted) {
    if (last && n - last === 2) out.push(last + 1);
    else if (last && n - last > 2) out.push("gap");
    out.push(n);
    last = n;
  }
  return out;
}

/** "Showing 1–25 of 140". */
export function rangeLabel(from: number, to: number, total: number): string {
  if (total === 0) return "No rows";
  if (from === 1 && to === total) return total === 1 ? "1 row" : `${total} rows`;
  return `Showing ${from}–${to} of ${total}`;
}

/** Every word must appear somewhere in the text, in any order. */
export function matchesSearch(text: string, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = text.toLowerCase();
  return words.every((word) => hay.includes(word));
}

export type FilterOption = { value: string; label: string; count?: number };

export type FilterDef<Row> = {
  /** Query param name, for example `status`. */
  key: string;
  /** Label on the button, for example "Status". */
  label: string;
  /** The row's value for this filter. Blank values are left out of the menu. */
  get: (row: Row) => string | null | undefined;
  /** Fixed menu. When left out, the menu lists the values found in the rows. */
  options?: { value: string; label: string }[];
};

/** Distinct values in the rows with a count each, sorted by label. */
export function deriveOptions<Row>(
  rows: Row[],
  get: (row: Row) => string | null | undefined,
): FilterOption[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = get(row)?.toString().trim();
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base", numeric: true }));
}

/** Keeps the rows that match every filter that has a value. */
export function applyFilters<Row>(
  rows: Row[],
  filters: FilterDef<Row>[],
  values: Record<string, string>,
): Row[] {
  const active = filters.filter((filter) => values[filter.key]);
  if (active.length === 0) return rows;
  return rows.filter((row) =>
    active.every((filter) => (filter.get(row)?.toString().trim() ?? "") === values[filter.key]),
  );
}

/**
 * Rebuilds a table link. `params` is the table's current state, `patch` is
 * what the link changes (`null` or "" removes a key). Params already in
 * `basePath` are kept. `page` is dropped unless the patch sets it, so a new
 * search, filter, sort or size starts again at page 1.
 */
export function buildHref(
  basePath: string,
  params: Record<string, string | undefined>,
  patch: Record<string, string | null | undefined> = {},
): string {
  const hashAt = basePath.indexOf("#");
  const hash = hashAt >= 0 ? basePath.slice(hashAt) : "";
  const bare = hashAt >= 0 ? basePath.slice(0, hashAt) : basePath;
  const queryAt = bare.indexOf("?");
  const path = queryAt >= 0 ? bare.slice(0, queryAt) : bare;
  const next = new URLSearchParams(queryAt >= 0 ? bare.slice(queryAt + 1) : "");
  for (const [key, value] of Object.entries(params)) {
    if (value) next.set(key, value);
  }
  next.delete("page");
  for (const [key, value] of Object.entries(patch)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  const qs = next.toString();
  return `${path}${qs ? `?${qs}` : ""}${hash}`;
}

/** Hidden inputs for a GET form that must keep the table's other params. */
export function hiddenFields(
  basePath: string,
  params: Record<string, string | undefined>,
  drop: string[],
): { name: string; value: string }[] {
  const href = buildHref(basePath, params, Object.fromEntries(drop.map((key) => [key, null])));
  const queryAt = href.indexOf("?");
  if (queryAt < 0) return [];
  const hashAt = href.indexOf("#");
  const qs = href.slice(queryAt + 1, hashAt >= 0 ? hashAt : undefined);
  return [...new URLSearchParams(qs).entries()].map(([name, value]) => ({ name, value }));
}

/** Path part of a base path, with no query or hash. */
export function pathOf(basePath: string): string {
  const cut = basePath.search(/[?#]/);
  return cut >= 0 ? basePath.slice(0, cut) : basePath;
}

export const COLUMNS_KEY_PREFIX = "hq:columns:v1:";

/** Column keys to hide, from a stored JSON list. Bad data hides nothing. */
export function parseHiddenColumns(raw: string | null | undefined, allowed?: readonly string[]): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const keys = value.filter((item): item is string => typeof item === "string");
    return allowed ? keys.filter((key) => allowed.includes(key)) : keys;
  } catch {
    return [];
  }
}

/** Letters, digits, dash and underscore only, so a key is safe in a selector. */
export function safeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_");
}
