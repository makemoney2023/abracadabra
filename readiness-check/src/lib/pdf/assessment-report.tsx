import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ResultsPayload } from "@/lib/assessment/present";
import { STUDIO } from "@/lib/brand/studio";
import { registerStudioPdfFonts } from "@/lib/pdf/fonts";

registerStudioPdfFonts();

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: "IBM Plex Sans",
    color: STUDIO.ink,
    backgroundColor: STUDIO.canvas,
  },
  kicker: {
    fontSize: 9,
    fontFamily: "Inter Tight",
    fontWeight: 500,
    color: STUDIO.accent,
    letterSpacing: 1.6,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  title: { fontSize: 22, marginBottom: 6, color: STUDIO.ink, fontFamily: "Inter Tight", fontWeight: 700 },
  muted: { color: STUDIO.inkSoft, marginBottom: 12 },
  section: { marginTop: 14, marginBottom: 4, fontSize: 14, color: STUDIO.accent, fontFamily: "Inter Tight", fontWeight: 700 },
  row: { marginBottom: 4, color: STUDIO.ink },
  rule: { marginTop: 8, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: STUDIO.signal },
});

const SECTIONS = [
  ["readiness", "Next steps for how the work runs"],
  ["visibility", "Next steps for your website"],
  ["growth", "Next steps for new customers"],
] as const;

/** The visitor's report: the stage name and next steps. No numeric score is printed. */
export function AssessmentReportDocument({ results }: { results: ResultsPayload }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.kicker}>Readiness Check</Text>
        <Text style={styles.muted}>Where your business is today</Text>
        <Text style={styles.title}>{results.stage.label}</Text>
        <View style={styles.rule} />
        <Text style={styles.muted}>
          {results.stage.sentence}
          {results.topPressureLabel ? ` The job that costs the most right now: ${results.topPressureLabel.replace(/[.\s]+$/, "")}.` : ""}
        </Text>
        <Text style={styles.row}>Site: {results.domain ?? "not provided"}</Text>
        {SECTIONS.map(([section, heading]) => (
          <View key={section}>
            <Text style={styles.section}>{heading}</Text>
            {results.suggestions[section].length === 0 ? (
              <Text style={styles.row}>Nothing to flag here.</Text>
            ) : (
              results.suggestions[section].map((item) => (
                <Text key={item.code} style={styles.row}>
                  {item.title} — {item.body}
                </Text>
              ))
            )}
          </View>
        ))}
        {results.pressures.length > 0 ? (
          <View>
            <Text style={styles.section}>Where the work slows down</Text>
            {results.pressures.map((item) => (
              <Text key={item.code} style={styles.row}>
                {item.label}
                {item.severityLabel ? ` — ${item.severityLabel}` : ""}
              </Text>
            ))}
          </View>
        ) : null}
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
