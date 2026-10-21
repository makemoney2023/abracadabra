import type { ScanProgress } from "./d1-pipeline-store";

/** One line for the scan page and PDF on how a deep scan followed robots.txt. Null for the free scan. */
export function robotsNote(progress: ScanProgress | null | undefined): string | null {
  if (!progress || progress.robotsStatus === null || progress.tier === "free") return null;
  if (progress.robotsStatus === "unreachable") {
    return "robots.txt could not be read (server error or no response), so this deep scan read no pages. Deep scans follow robots.txt. Try again later.";
  }
  if (progress.robotsStatus === "missing") {
    return "This site has no robots.txt, so every page we found was allowed.";
  }
  const parts = ["This deep scan followed robots.txt for our scanner (SchemaAEOScanner)."];
  if (progress.pagesTotal === 0) parts.push("It does not allow any of the pages we found, so none were read.");
  else if (progress.robotsSkipped > 0) {
    parts.push(`${progress.robotsSkipped} ${progress.robotsSkipped === 1 ? "URL it disallows was" : "URLs it disallows were"} skipped.`);
  } else parts.push("It did not rule out any of the pages we found.");
  if (progress.crawlDelayMs > 0) {
    parts.push(`We waited ${Math.round(progress.crawlDelayMs / 100) / 10} s between requests, as its Crawl-delay asks.`);
  }
  return parts.join(" ");
}
