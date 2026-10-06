/** Wall clock for server pages. Kept out of the page so the render stays a pure call. */
export function clock(): number {
  return Date.now();
}
