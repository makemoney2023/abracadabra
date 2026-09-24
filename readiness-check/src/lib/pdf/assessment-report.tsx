import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ResultsPayload } from "@/lib/assessment/present";
import { STUDIO } from "@/lib/brand/studio";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: STUDIO.ink,
    backgroundColor: STUDIO.canvas,
  },
  kicker: {
    fontSize: 9,
    color: STUDIO.accent,
    letterSpacing: 1.6,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  title: { fontSize: 22, marginBottom: 6, color: STUDIO.ink, fontFamily: "Helvetica-Bold" },
  muted: { color: STUDIO.inkSoft, marginBottom: 12 },
  section: { marginTop: 14, marginBottom: 4, fontSize: 14, color: STUDIO.accent, fontFamily: "Helvetica-Bold" },
  row: { marginBottom: 4, color: STUDIO.ink },
  rule: { marginTop: 8, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: STUDIO.signal },
});

export function AssessmentReportDocument({ results }: { results: ResultsPayload }) {
  const { scores } = results;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.kicker}>Readiness Check</Text>
        <Text style={styles.title}>{results.bandLabel}</Text>
        <View style={styles.rule} />
        <Text style={styles.muted}>{results.bandSentence}</Text>
        <Text style={styles.row}>Site: {results.domain ?? "not provided"}</Text>
        <Text style={styles.row}>Overall {scores.overall.total}</Text>
        <Text style={styles.section}>Readiness {scores.readiness.total}</Text>
        <Text style={styles.row}>Data {scores.readiness.data}</Text>
        <Text style={styles.row}>Process {scores.readiness.process}</Text>
        <Text style={styles.row}>People {scores.readiness.people}</Text>
        <Text style={styles.row}>Decision {scores.readiness.decision}</Text>
        <Text style={styles.section}>Growth {scores.growth.total}</Text>
        <Text style={styles.section}>
          Visibility {scores.visibility.total ?? "pending"} ({scores.visibility.status})
        </Text>
        <Text style={styles.section}>Suggestions</Text>
        {(["readiness", "growth", "visibility"] as const).flatMap((section) =>
          results.suggestions[section].map((item) => (
            <Text key={item.code} style={styles.row}>
              {item.title} — {item.body}
            </Text>
          )),
        )}
        <Text style={styles.section}>How we can help</Text>
        {results.offers.map((offer) => (
          <Text key={offer.row} style={styles.row}>
            {offer.said} {offer.build}
          </Text>
        ))}
        <Text style={styles.section}>Working session</Text>
        <Text style={styles.row}>{results.booking.mailto}</Text>
      </Page>
    </Document>
  );
}
