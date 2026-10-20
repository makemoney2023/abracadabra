import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { STUDIO } from "@/lib/brand/studio";
import { registerStudioPdfFonts } from "@/lib/pdf/fonts";

registerStudioPdfFonts();

export { buildReportProps } from "@/lib/pdf/report-props";
export type { ReportFinding, ReportInput, ReportPage, ReportProps } from "@/lib/pdf/report-props";
import type { ReportProps } from "@/lib/pdf/report-props";

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: "IBM Plex Sans",
    color: STUDIO.ink,
    backgroundColor: STUDIO.canvas,
  },
  h1: { fontSize: 16, marginBottom: 6, fontFamily: "Inter Tight", fontWeight: 700, color: STUDIO.ink },
  h2: { fontSize: 12, marginTop: 14, marginBottom: 6, fontFamily: "Inter Tight", fontWeight: 700, color: STUDIO.accent },
  muted: { color: STUDIO.inkSoft, marginBottom: 10 },
  score: { fontSize: 28, fontFamily: "Inter Tight", fontWeight: 700, marginBottom: 8, color: STUDIO.ink },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(245, 240, 232, 0.08)",
    paddingVertical: 4,
  },
  cell: { flexGrow: 1, flexBasis: 0, color: STUDIO.ink },
  finding: { marginBottom: 4, color: STUDIO.ink },
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
