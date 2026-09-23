import type { ScoreResult } from "@/lib/types";
import { FINDING_IMPACT } from "./constants";

export type ScoreFinding = ScoreResult["findings"][number];

export function finding(
  code: ScoreFinding["code"],
  severity: ScoreFinding["severity"],
  passed: boolean,
  message: string,
  extra?: Pick<ScoreFinding, "pageUrl" | "evidence">,
): ScoreFinding {
  return { code, severity, passed, message, ...extra };
}

const SEVERITY_RANK: Record<ScoreFinding["severity"], number> = {
  critical: 0,
  warn: 1,
  info: 2,
};

/**
 * Ranks unresolved, non-info findings by approximate recoverable pillar points (highest first),
 * breaking ties by severity, and returns up to `limit` fix messages.
 */
export function buildPriorityFixes(findings: ScoreFinding[], limit = 5): string[] {
  return findings
    .filter((f) => !f.passed && f.severity !== "info")
    .sort((a, b) => {
      const impactDiff = (FINDING_IMPACT[b.code] ?? 0) - (FINDING_IMPACT[a.code] ?? 0);
      if (impactDiff !== 0) return impactDiff;
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    })
    .slice(0, limit)
    .map((f) => f.message);
}
