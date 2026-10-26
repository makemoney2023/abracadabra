import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { costliestJobSentence, type ResultsPayload } from "@/lib/assessment/present";
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
  next: { marginTop: 6, marginBottom: 4, color: STUDIO.inkSoft, fontFamily: "Inter Tight", fontWeight: 500 },
  rule: { marginTop: 8, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: STUDIO.signal },
});

function visibilityLine(scores: ResultsPayload["scores"]): string {
  if (scores.visibility.status === "complete" && scores.visibility.total != null) {
    return `Website visibility ${scores.visibility.total} of 100`;
  }
  return scores.visibility.status === "pending" ? "Website visibility: still reading the site" : "Website visibility: the site could not be read this time";
}

/** The visitor's report: the stage name, the scores, and next steps for each section. */
export function AssessmentReportDocument({ results }: { results: ResultsPayload }) {
  const { scores } = results;
  const costliest = costliestJobSentence(results.topPressureLabel);
  const sections = [
    {
      key: "readiness",
      heading: `Readiness ${scores.readiness.total} of 100`,
      detail: [
        `Data ${scores.readiness.data}`,
        `Process ${scores.readiness.process}`,
        `People ${scores.readiness.people}`,
        `Decision ${scores.readiness.decision}`,
      ],
      next: "Next steps for how the work runs",
    },
    { key: "visibility", heading: visibilityLine(scores), detail: [], next: "Next steps for your website" },
    { key: "growth", heading: `Growth ${scores.growth.total} of 100`, detail: [], next: "Next steps for new customers" },
  ] as const;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.kicker}>Readiness Check</Text>
        <Text style={styles.muted}>Where your business is today</Text>
        <Text style={styles.title}>{results.stage.label}</Text>
        <View style={styles.rule} />
        <Text style={styles.muted}>
          {results.stage.sentence}
          {costliest ? ` ${costliest}` : ""}
        </Text>
        <Text style={styles.row}>Site: {results.domain ?? "not provided"}</Text>
        <Text style={styles.row}>Overall score {scores.overall.total} of 100</Text>
        {sections.map((section) => (
          <View key={section.key}>
            <Text style={styles.section}>{section.heading}</Text>
            {section.detail.length > 0 ? <Text style={styles.row}>{section.detail.join(" · ")}</Text> : null}
            <Text style={styles.next}>{section.next}</Text>
            {results.suggestions[section.key].length === 0 ? (
              <Text style={styles.row}>Nothing to flag here.</Text>
            ) : (
              results.suggestions[section.key].map((item) => (
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
