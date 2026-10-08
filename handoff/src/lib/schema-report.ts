export const SCHEMA_PILLARS = [
  { key: "structuredData", label: "Structured data", max: 35 },
  { key: "aiDiscoveryFiles", label: "AI discovery files", max: 20 },
  { key: "aiCrawlability", label: "AI crawlability", max: 20 },
  { key: "pageCoverage", label: "Page coverage", max: 15 },
  { key: "answerReadiness", label: "Answer readiness", max: 10 },
] as const;

export type SchemaReportPage = {
  url: string;
  pageType: string;
  fetchStatus: string;
  hasJsonLd: boolean;
  schemaTypes: string[];
};

export type SchemaReportFinding = {
  severity: string;
  message: string;
  passed: boolean;
  pageUrl: string | null;
};

export type SchemaScanReport = {
  status: string;
  scoreTotal: number | null;
  error: string | null;
  pillars: { label: string; score: number; max: number }[];
  pages: SchemaReportPage[];
  gaps: SchemaReportFinding[];
  publicToken: string | null;
};

export function schemaScanReport(input: {
  status: string;
  scoreTotal: number | null;
  scoreBreakdown: unknown;
  error: string | null;
  publicToken: string | null;
  pages: SchemaReportPage[];
  findings: SchemaReportFinding[];
}): SchemaScanReport {
  const ready = input.status === "complete";
  const breakdown =
    input.scoreBreakdown && typeof input.scoreBreakdown === "object"
      ? (input.scoreBreakdown as Record<string, unknown>)
      : {};
  return {
    status: input.status,
    scoreTotal: input.scoreTotal,
    error: input.error,
    publicToken: input.publicToken,
    pillars: ready
      ? SCHEMA_PILLARS.map((pillar) => {
          const score = breakdown[pillar.key];
          return {
            label: pillar.label,
            score: typeof score === "number" ? score : 0,
            max: pillar.max,
          };
        })
      : [],
    pages: ready ? input.pages : [],
    gaps: ready ? input.findings.filter((finding) => !finding.passed) : [],
  };
}

export type SchemaLeadView = {
  total: string;
  lines: string[];
  reportUrl: string | null;
};

const CHECK_ORIGIN = "https://check.abra-ca-dabra.app";

export function presentSchemaLead(report: SchemaScanReport): SchemaLeadView {
  if (report.status === "failed") return { total: "Schema scan failed.", lines: [], reportUrl: null };
  if (report.status === "queued") return { total: "Schema scan is queued.", lines: [], reportUrl: null };
  if (report.status !== "complete" || report.scoreTotal == null) {
    return { total: "Schema scan is still running.", lines: [], reportUrl: null };
  }
  return {
    total: `Schema score ${report.scoreTotal}/100.`,
    lines: report.pillars.map((pillar) => `${pillar.label} ${pillar.score}/${pillar.max}.`),
    reportUrl: report.publicToken ? `${CHECK_ORIGIN}/scan/${report.publicToken}` : null,
  };
}
