import type { AssessmentConfig } from "./config-schema";
import type { AssessmentScores, Offer } from "./types";

export function mapPressuresToOffers(input: {
  pressures: AssessmentScores["pressures"];
  config: AssessmentConfig;
}): Offer[] {
  const { pressures, config: source } = input;
  const rows = pressures.length > 0 ? pressures.slice(0, 3).map((p) => p.offerRow) : ["custom_fit"];
  return rows.flatMap((row) => {
    const offer = source.offers.find((o) => o.row === row);
    return offer ? [offer] : [];
  });
}
