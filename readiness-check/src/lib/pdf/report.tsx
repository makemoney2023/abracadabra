import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { buildScoreSummary } from "@/lib/scoring/score-summary";
import type { ScoreBreakdown } from "@/lib/types";

export type ReportPage = {
  url: string;
  pageType: string;
  fetchStatus: string;
  hasJsonLd: boolean;
  schemaTypes: string[];
};

export type ReportFinding = {
  code: string;
  severity: string;
  passed: boolean;
  message: string;
  pageUrl?: string;
};

export type ReportInput = {
  domain: string;
  scoreTotal: number | null;
  scoreBreakdown: unknown;
  pages: ReportPage[];
  findings: ReportFinding[];
};

export type ReportProps = {
  title: string;
  domain: string;
  scoreTotal: number | null;
  summaryHeadline: string;
  summaryBody: string;
  summaryDrivers: string[];
  pillars: Array<{ label: string; score: number }>;
  pages: ReportPage[];
  findings: ReportFinding[];
};

const PILLAR_LABELS: Array<{ key: keyof ScoreBreakdown; label: string }> = [
  { key: "structuredData", label: "Structured data" },
  { key: "aiDiscoveryFiles", label: "AI discovery files" },
  { key: "aiCrawlability", label: "AI crawlability" },
  { key: "pageCoverage", label: "Page coverage" },
  { key: "answerReadiness", label: "Answer readiness" },
];

function asBreakdown(value: unknown): Partial<ScoreBreakdown> {
  if (!value || typeof value !== "object") return {};
  return value as Partial<ScoreBreakdown>;
}

export function buildReportProps(input: ReportInput): ReportProps {
  const breakdown = asBreakdown(input.scoreBreakdown);
  const topGaps = input.findings
    .filter((f) => !f.passed && (f.severity === "critical" || f.severity === "warn"))
    .slice(0, 3)
    .map((f) => ({ code: f.code, severity: f.severity, message: f.message }));
  const summary = buildScoreSummary({
    domain: input.domain,
    scoreTotal: input.scoreTotal,
    scoreBreakdown: input.scoreBreakdown,
    topGaps,
  });
  return {
    title: `Schema AEO/GEO report — ${input.domain}`,
    domain: input.domain,
    scoreTotal: input.scoreTotal,
    summaryHeadline: summary.headline,
    summaryBody: summary.body,
    summaryDrivers: summary.drivers,
    pillars: PILLAR_LABELS.map(({ key, label }) => ({
      label,
      score: typeof breakdown[key] === "number" ? (breakdown[key] as number) : 0,
    })),
    pages: input.pages,
    findings: input.findings,
  };
}

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  h1: { fontSize: 16, marginBottom: 6, fontFamily: "Helvetica-Bold" },
  h2: { fontSize: 12, marginTop: 14, marginBottom: 6, fontFamily: "Helvetica-Bold" },
  muted: { color: "#4b5563", marginBottom: 10 },
  score: { fontSize: 28, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingVertical: 4,
  },
  cell: { flexGrow: 1, flexBasis: 0 },
  finding: { marginBottom: 4 },
});

export function ScanReportDocument(props: ReportProps) {
  return (
    <Document title={props.title}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>{props.title}</Text>
        <Text style={styles.muted}>Domain: {props.domain}</Text>
        <Text style={styles.score}>
          Score: {props.scoreTotal ?? "—"}
        </Text>
        <Text style={styles.h2}>{props.summaryHeadline}</Text>
        <Text style={styles.muted}>{props.summaryBody}</Text>
        {props.summaryDrivers.map((driver) => (
          <Text key={driver} style={styles.finding}>
            • {driver}
          </Text>
        ))}

        <Text style={styles.h2}>Pillars</Text>
        {props.pillars.map((p) => (
          <View key={p.label} style={styles.row}>
            <Text style={styles.cell}>{p.label}</Text>
            <Text>{p.score}</Text>
          </View>
        ))}

        <Text style={styles.h2}>Page matrix</Text>
        {props.pages.length === 0 ? (
          <Text style={styles.muted}>No pages recorded.</Text>
        ) : (
          props.pages.map((page) => (
            <View key={page.url} style={styles.row} wrap={false}>
              <Text style={styles.cell}>{page.url}</Text>
              <Text style={styles.cell}>{page.pageType}</Text>
              <Text style={styles.cell}>{page.fetchStatus}</Text>
              <Text style={styles.cell}>
                {page.hasJsonLd ? "JSON-LD" : "no schema"}
              </Text>
            </View>
          ))
        )}

        <Text style={styles.h2}>Findings</Text>
        {props.findings.length === 0 ? (
          <Text style={styles.muted}>No findings.</Text>
        ) : (
          props.findings.map((f, idx) => (
            <Text key={`${f.code}-${idx}`} style={styles.finding}>
              [{f.severity}] {f.code}: {f.message}
              {f.passed ? " (passed)" : ""}
            </Text>
          ))
        )}

        <Text style={styles.h2}>Next steps</Text>
        <Text style={styles.muted}>
          Install the fix package (see INSTALL.md). Validate JSON-LD at validator.schema.org and
          Google Rich Results Test, then re-scan the domain.
        </Text>
      </Page>
    </Document>
  );
}
