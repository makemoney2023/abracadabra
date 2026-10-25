import { SEARCH_SYNC_CRON } from "@/lib/search/sync";

/**
 * The handoff Worker's scheduled() entry branches first on the cron. The daily Search Console cron (30 8 * * *) only
 * enqueues sync work and returns, so it never wakes agents, files scans, settles swarms or retries builds; every other
 * cron runs the regular jobs exactly as before.
 */
export async function routeScheduled(
  cron: string,
  jobs: { searchSync(): Promise<void>; regular(): Promise<void> },
): Promise<"search_sync" | "regular"> {
  if (cron === SEARCH_SYNC_CRON) {
    await jobs.searchSync();
    return "search_sync";
  }
  await jobs.regular();
  return "regular";
}
