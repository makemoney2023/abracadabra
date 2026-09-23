import type { AssessmentConfig } from "./config-schema";
import type { BandId } from "./types";

export function bandFor(total: number, source: AssessmentConfig): {
  id: BandId;
  label: string;
  sentence: string;
} {
  const band = source.bands.find((b) => total >= b.min && total <= b.max);
  if (!band) {
    const last = source.bands[source.bands.length - 1];
    return { id: last.id, label: last.label, sentence: last.sentence };
  }
  return { id: band.id, label: band.label, sentence: band.sentence };
}
