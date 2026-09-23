export type OutreachLead = {
  name?: string | null;
  domain: string;
};

export type OutreachScan = {
  scoreTotal: number | null;
  topGaps: Array<{ message: string } | string>;
};

/** Short copy-paste blurb: company, score, and top gaps for outreach. */
export function buildOutreachBlurb(lead: OutreachLead, scan: OutreachScan): string {
  const company = lead.name?.trim() || lead.domain;
  const score =
    typeof scan.scoreTotal === "number" ? String(scan.scoreTotal) : "n/a";
  const gaps = scan.topGaps
    .map((g) => (typeof g === "string" ? g : g.message))
    .filter(Boolean)
    .slice(0, 5);

  const gapLines =
    gaps.length > 0
      ? gaps.map((g) => `- ${g}`).join("\n")
      : "- No critical gaps listed";

  return [
    `Hi — quick note on ${company} (${lead.domain}).`,
    `Your AI visibility score is ${score}/100.`,
    "Top gaps we see (the translation layer AI engines look for):",
    gapLines,
    "Happy to walk through closing this AI blind spot if useful.",
  ].join("\n");
}
