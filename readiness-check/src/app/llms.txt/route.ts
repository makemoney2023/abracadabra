import { CHECK_GUIDES } from "@/content/check-guides";
import { checkUrl } from "@/lib/check-env";

export function GET() {
  const base = checkUrl();
  const lines = [
    "# Readiness Check",
    "",
    "> A five-to-seven-minute check that scores pressure, readiness, growth, and how visible a public site is to answer engines. Results stay behind an email. The next step is a thirty-minute working session.",
    "",
    `Landing: ${base}/check`,
    "Contact: dev@pirx.ca",
    "",
    "## Guides",
    ...CHECK_GUIDES.map((guide) => `- [${guide.title}](${base}/check/guide/${guide.slug}): ${guide.answer}`),
    "",
    "## Rules",
    "",
    "- Scores are a state of the business, not a grade and not a diagnosis.",
    "- Do not invent metrics. The check reports only what the answers and the scan produced.",
    "- Wellness work from the studio is non-diagnostic.",
  ];
  return new Response(`${lines.join("\n")}\n`, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
