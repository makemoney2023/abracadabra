/**
 * URL sort helpers for `DataTable`.
 *
 * A sort is one query value: `name` for ascending, `-name` for descending,
 * and empty for no sort. Keeping it in the URL means sorted lists can be
 * linked, refreshed, and rendered on the server.
 */
export type SortDir = "asc" | "desc";
export type Sort = { key: string; dir: SortDir };

export function parseSort(sort: string | undefined): Sort | null {
  if (!sort) return null;
  const desc = sort.startsWith("-");
  const key = desc ? sort.slice(1) : sort;
  if (!key) return null;
  return { key, dir: desc ? "desc" : "asc" };
}

/** asc → desc → off, restarting at asc when the key changes. */
export function nextSort(current: string | undefined, key: string): string {
  const parsed = parseSort(current);
  if (!parsed || parsed.key !== key) return key;
  return parsed.dir === "asc" ? `-${key}` : "";
}

/**
 * Header link for one column. Keeps the rest of the query string and drops
 * `sort` when the cycle turns the column off.
 */
export function sortHref(basePath: string, sort: string | undefined, key: string): string {
  const next = nextSort(sort, key);
  const hashAt = basePath.indexOf("#");
  const hash = hashAt >= 0 ? basePath.slice(hashAt) : "";
  const bare = hashAt >= 0 ? basePath.slice(0, hashAt) : basePath;
  const queryAt = bare.indexOf("?");
  const path = queryAt >= 0 ? bare.slice(0, queryAt) : bare;
  const params = new URLSearchParams(queryAt >= 0 ? bare.slice(queryAt + 1) : "");
  if (next) params.set("sort", next);
  else params.delete("sort");
  const qs = params.toString();
  return `${path}${qs ? `?${qs}` : ""}${hash}`;
}

export type SortValue = string | number | null | undefined;

function compare(a: SortValue, b: SortValue): number {
  const aMissing = a === null || a === undefined || a === "";
  const bMissing = b === null || b === undefined || b === "";
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en", { sensitivity: "base", numeric: true });
}

/**
 * Returns a sorted copy. Missing values sit at the end in both directions so
 * the useful rows stay on top. Returns the same array when there is no sort.
 */
export function sortRows<Row>(
  rows: Row[],
  sort: string | undefined,
  get: (row: Row, key: string) => SortValue,
): Row[] {
  const parsed = parseSort(sort);
  if (!parsed) return rows;
  const sign = parsed.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = get(a, parsed.key);
    const bv = get(b, parsed.key);
    const aMissing = av === null || av === undefined || av === "";
    const bMissing = bv === null || bv === undefined || bv === "";
    if (aMissing || bMissing) return compare(av, bv);
    return compare(av, bv) * sign;
  });
}
