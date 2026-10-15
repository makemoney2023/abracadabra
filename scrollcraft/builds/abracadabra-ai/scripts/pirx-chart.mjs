/** Illustrative PiRX Search Console shape. Not a daily export. */

const SOURCE = "Source: Google Search Console, Jul 14 to Oct 13, 2026";

const SEARCH = [
  [0, 0.03],
  [0.16, 0.05],
  [0.35, 0.1],
  [0.53, 0.46],
  [0.69, 0.96],
  [0.84, 0.88],
  [1, 0.84],
];

const AI = [
  [0, 0.02],
  [0.16, 0.04],
  [0.35, 0.08],
  [0.53, 0.42],
  [0.69, 1],
  [0.84, 0.9],
  [1, 0.86],
];

const X0 = 112;
const X1 = 344;
const Y0 = 112;
const Y1 = 28;

function line(series) {
  return series
    .map(([t, v]) => {
      const x = X0 + (X1 - X0) * t;
      const y = Y0 - (Y0 - Y1) * v;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function panel({ title, peak, stroke, series }) {
  const points = line(series);
  const stepX = (X0 + (X1 - X0) * 0.53).toFixed(1);
  const area = `${points} ${X1}.0,${Y0}.0 ${X0}.0,${Y0}.0`;
  return `<svg viewBox="0 0 360 156" role="img" aria-label="${title}. Illustrative trend from near zero in mid-July, a step around Aug 31, and a daily peak by mid-September. Peak band ${peak}.">
<title>${title}</title>
<text x="8" y="16" fill="var(--ink)" font-size="13" font-family="IBM Plex Sans, sans-serif">${title}</text>
<text x="104" y="36" fill="var(--ink-soft)" font-size="11" font-family="IBM Plex Sans, sans-serif" text-anchor="end">${peak}</text>
<text x="104" y="112" fill="var(--ink-soft)" font-size="11" font-family="IBM Plex Sans, sans-serif" text-anchor="end">near zero</text>
<line x1="${X0}" y1="${Y1}" x2="${X0}" y2="${Y0}" stroke="var(--line)"/>
<line x1="${X0}" y1="${Y0}" x2="${X1}" y2="${Y0}" stroke="var(--line)"/>
<line x1="${stepX}" y1="${Y1}" x2="${stepX}" y2="${Y0}" stroke="var(--line)" stroke-dasharray="3 4"/>
<polygon points="${area}" fill="${stroke}" opacity="0.16"/>
<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
<text x="${X0}" y="132" fill="var(--ink-soft)" font-size="11" font-family="IBM Plex Sans, sans-serif">Jul 14</text>
<text x="${stepX}" y="132" fill="var(--ink-soft)" font-size="11" font-family="IBM Plex Sans, sans-serif" text-anchor="middle">Aug 31</text>
<text x="${X1}" y="132" fill="var(--ink-soft)" font-size="11" font-family="IBM Plex Sans, sans-serif" text-anchor="end">Oct 13</text>
<text x="8" y="150" fill="var(--ink-soft)" font-size="11" font-family="IBM Plex Sans, sans-serif">Illustrative trend, not a daily export</text>
</svg>`;
}

export function pirxChartHtml() {
  return `<figure class="pirx-chart">
<div class="pirx-chart__pair">
${panel({ title: "Search impressions", peak: "12-18K/day", stroke: "var(--accent)", series: SEARCH })}
${panel({ title: "AI-feature impressions", peak: "1.2-1.8K/day", stroke: "var(--optic)", series: AI })}
</div>
<p class="pirx-chart__source">${SOURCE}</p>
</figure>`;
}
