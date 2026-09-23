export function computeOpsPriority(input: {
  scoreTotal: number;
  hasContact: boolean;
  readiness?: number | null;
  topPressureSeverity?: number | null;
  booked?: boolean;
}): number {
  const base = 100 - input.scoreTotal + (input.hasContact ? 25 : 0);
  const readinessBonus = input.readiness != null && input.readiness < 50 ? 15 : 0;
  const pressureBonus = input.topPressureSeverity === 3 ? 10 : 0;
  const bookedBonus = input.booked ? 50 : 0;
  return base + readinessBonus + pressureBonus + bookedBonus;
}
