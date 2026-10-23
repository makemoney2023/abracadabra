/**
 * The "Show retired" query value for Files lists. This file has no "use client" on purpose: the Space pages are server
 * components and call showRetired() while rendering. A function exported from a client component file cannot be called
 * on the server (Next throws "Attempted to call showRetired() from the server"), which is what broke every Space page.
 */

/** Query value that turns the filter on. Pages read it with `showRetired`. */
export const RETIRED_PARAM = "retired";

export function showRetired(value: string | string[] | undefined): boolean {
  return value === "1";
}

/** "Show retired (2)" or "Show retired", for the count line next to the switch. */
export function retiredLabel(count: number): string {
  return count > 0 ? `Show retired (${count})` : "Show retired";
}
