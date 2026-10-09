export const DENSITY_KEY = "hq:density:v1";
export const DENSITY_EVENT = "hq:density";

/** Runs before hydration so compact rows do not flash comfortable. */
export const DENSITY_BOOT = `(function(){try{if(localStorage.getItem("${DENSITY_KEY}")==="compact"){document.documentElement.setAttribute("data-density","compact");}}catch(e){}})();`;

export function applyDensity(compact: boolean) {
  if (compact) document.documentElement.setAttribute("data-density", "compact");
  else document.documentElement.removeAttribute("data-density");
  try {
    localStorage.setItem(DENSITY_KEY, compact ? "compact" : "comfortable");
  } catch {
    // Private browsing can reject storage writes.
  }
  window.dispatchEvent(new Event(DENSITY_EVENT));
}

export function densityIsCompact(): boolean {
  return document.documentElement.getAttribute("data-density") === "compact";
}
