/**
 * Heat-ring / traffic score colors (vibrant UI stops).
 *
 * Research basis:
 * - Chrome Lighthouse score circles — red #FF4E42 / orange #FFA400 / green #0CCE6B
 * - ColorBrewer RdYlGn continuum — red → yellow → green diverging shape
 * - Always pair with numeric / band text (never color-alone)
 */

export type ScoreBand = "poor" | "fair" | "good" | "strong";

export type Rgb = { r: number; g: number; b: number };

/** Vibrant heat stops: red → orange → yellow → lime → green */
export const HEAT_STOPS: ReadonlyArray<{ t: number; hex: string }> = [
  { t: 0, hex: "#FF4E42" }, // Lighthouse fail red
  { t: 0.25, hex: "#FF8A00" }, // vivid orange
  { t: 0.5, hex: "#FFCC00" }, // vivid yellow
  { t: 0.75, hex: "#34C759" }, // vivid lime / Apple-style success green
  { t: 1, hex: "#0CCE6B" }, // Lighthouse pass green
] as const;

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const to = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${to(r)}${to(g)}${to(b)}`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Fraction of max in [0, 1]. */
export function scoreRatio(score: number, max: number): number {
  if (max <= 0) return 0;
  return clamp01(score / max);
}

/** Whole-number percent of max for visible labels (never color-alone). */
export function scorePercent(score: number, max: number): number {
  return Math.round(scoreRatio(score, max) * 100);
}

/** Interpolated RGB on the heat continuum. */
export function scoreColorRgb(ratio: number): Rgb {
  const r = clamp01(ratio);
  let i = 0;
  while (i < HEAT_STOPS.length - 1 && r > HEAT_STOPS[i + 1]!.t) i += 1;
  const a = HEAT_STOPS[i]!;
  const b = HEAT_STOPS[Math.min(i + 1, HEAT_STOPS.length - 1)]!;
  if (a.t === b.t) return hexToRgb(a.hex);
  const t = (r - a.t) / (b.t - a.t);
  const ca = hexToRgb(a.hex);
  const cb = hexToRgb(b.hex);
  return {
    r: lerp(ca.r, cb.r, t),
    g: lerp(ca.g, cb.g, t),
    b: lerp(ca.b, cb.b, t),
  };
}

/** CSS `#RRGGBB` for gauge/meter strokes. */
export function scoreColorCss(ratio: number): string {
  return rgbToHex(scoreColorRgb(ratio));
}

/** Conic-gradient stops for a full heat-ring track. */
export function heatConicGradientCss(): string {
  const stops = HEAT_STOPS.map((s) => `${s.hex} ${Math.round(s.t * 100)}%`).join(", ");
  return `conic-gradient(from -90deg, ${stops})`;
}

export function scoreBand(ratio: number): ScoreBand {
  const r = clamp01(ratio);
  if (r < 0.25) return "poor";
  if (r < 0.5) return "fair";
  if (r < 0.75) return "good";
  return "strong";
}

export function scoreBandLabel(band: ScoreBand): string {
  switch (band) {
    case "poor":
      return "Poor";
    case "fair":
      return "Fair";
    case "good":
      return "Good";
    case "strong":
      return "Strong";
  }
}

/** @deprecated Prefer scoreColorCss — kept for any hue-based callers. */
export function scoreHue(ratio: number): number {
  const { r, g, b } = scoreColorRgb(ratio);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return Math.round(h);
}
