/**
 * The check used to publish "bands" with a score range. Visitors now get a stage name and next steps,
 * so every old band URL lands on the matching stage guide, and anything else under /band goes to the check.
 */
export const STAGE_IDS = ["early", "forming", "ready", "running"] as const;

const STAGE_PATTERN = STAGE_IDS.join("|");

export function stageRedirects() {
  return [
    { source: `/check/guide/band/:stage(${STAGE_PATTERN})`, destination: "/check/guide/stage/:stage", permanent: true },
    { source: `/band/:stage(${STAGE_PATTERN})`, destination: "/check/guide/stage/:stage", permanent: true },
    { source: "/check/guide/band/:path*", destination: "/check", permanent: true },
    { source: "/band/:path*", destination: "/check", permanent: true },
    { source: "/band", destination: "/check", permanent: true },
  ];
}
