/**
 * Illustrated Schema scanner card, drawn as SVG with outlined text.
 * It shows the scanner's report screen as it looks in the studio design: dark surfaces,
 * 1px borders, 8px corners, status pills and a faint grid. Sample content only:
 * "example.com", no real scan, no numeric score, no client data, no logos.
 */
import { C, TONES, kit, svgOpen } from "./hq-visuals.mjs";

export const SCHEMA_CARD_ALT = "Illustrative Schema scanner report for example.com: a URL field, a status ring and five areas with status pills and bars. Sample content.";

const AREAS = [
  { name: "Structured data", status: "Strong", tone: "green", fill: 0.92 },
  { name: "AI discovery files", status: "Partial", tone: "amber", fill: 0.46 },
  { name: "AI crawlability", status: "Strong", tone: "green", fill: 0.84 },
  { name: "Page coverage", status: "Partial", tone: "amber", fill: 0.58 },
  { name: "Answer readiness", status: "Needs work", tone: "accent", fill: 0.28 },
];

export function schemaScannerCard({ mode = "outline", id = "schema-ui" } = {}) {
  const k = kit(mode);
  const W = 1600;
  const H = 1000;
  const o = [svgOpen(W, H, { title: "Illustrative Schema scanner report", desc: SCHEMA_CARD_ALT, id, mode })];
  o.push(`<defs><pattern id="${id}-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#F5F0E8" stroke-opacity="0.035"/></pattern>`
    + `<radialGradient id="${id}-glow" cx="0.78" cy="0.12" r="0.7"><stop offset="0" stop-color="#FF4B24" stop-opacity="0.10"/><stop offset="1" stop-color="#FF4B24" stop-opacity="0"/></radialGradient>`
    + `<filter id="${id}-shadow" x="-5%" y="-5%" width="110%" height="115%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000" flood-opacity="0.45"/></filter></defs>`);
  o.push(`<rect width="${W}" height="${H}" fill="${C.canvas}"/><rect width="${W}" height="${H}" fill="url(#${id}-grid)"/><rect width="${W}" height="${H}" fill="url(#${id}-glow)"/>`);

  // Window
  o.push(`<g filter="url(#${id}-shadow)"><rect x="40" y="36" width="1520" height="928" rx="12" fill="${C.canvas}" stroke="rgba(245,240,232,0.20)"/></g>`);
  o.push(`<rect x="41" y="37" width="1518" height="926" rx="11" fill="url(#${id}-grid)"/>`);
  o.push(`<path d="M41 100H1559" stroke="rgba(245,240,232,0.12)"/>`);
  o.push(k.dots(76, 68).replace(/r="4"/g, 'r="6"'));
  o.push(k.text("Schema", { x: 800, y: 77, size: 26, font: "inter-600", fill: C.ink, anchor: "middle" }));
  o.push(k.text("SCAN REPORT", { x: 1522, y: 76, size: 18, font: "plex-500", fill: C.accentText, tracking: 0.1, anchor: "end" }));

  // URL row
  o.push(`<rect x="80" y="130" width="1010" height="76" rx="8" fill="${C.panel}" stroke="rgba(245,240,232,0.20)"/>`);
  o.push(k.text("WEBSITE URL", { x: 102, y: 156, size: 15, font: "plex-500", fill: C.accentText, tracking: 0.1 }));
  o.push(k.text("https://example.com", { x: 102, y: 189, size: 26, font: "plex-400", fill: C.ink }));
  o.push(`<rect x="1118" y="130" width="402" height="76" rx="8" fill="${C.accent}"/>`);
  o.push(k.text("Scan this site", { x: 1319, y: 178, size: 28, font: "inter-600", fill: "#170804", anchor: "middle" }));

  // Left panel: ring
  const px = 80, py = 246, pw = 520, ph = 664;
  o.push(k.panel(px, py, pw, ph, { fill: C.panel, r: 8 }));
  o.push(k.text("AI VISIBILITY", { x: px + 36, y: py + 52, size: 17, font: "plex-500", fill: C.soft, tracking: 0.12 }));
  o.push(k.text("example.com", { x: px + 36, y: py + 112, size: 54, font: "inter-600", fill: C.ink, tracking: -0.01 }));
  o.push(k.text("A scan of one sample site", { x: px + 36, y: py + 154, size: 24, font: "plex-400", fill: C.soft }));
  const rcx = px + pw / 2, rcy = py + 360, rr = 132;
  const circ = 2 * Math.PI * rr;
  o.push(`<circle cx="${rcx}" cy="${rcy}" r="${rr}" fill="none" stroke="rgba(245,240,232,0.10)" stroke-width="26"/>`);
  o.push(`<circle cx="${rcx}" cy="${rcy}" r="${rr}" fill="none" stroke="${C.green}" stroke-width="26" stroke-linecap="round" stroke-dasharray="${(circ * 0.58).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 ${rcx} ${rcy})"/>`);
  o.push(`<circle cx="${rcx}" cy="${rcy}" r="${rr}" fill="none" stroke="${C.amber}" stroke-width="26" stroke-linecap="round" stroke-dasharray="${(circ * 0.2).toFixed(1)} ${circ.toFixed(1)}" stroke-dashoffset="${(-circ * 0.62).toFixed(1)}" transform="rotate(-90 ${rcx} ${rcy})"/>`);
  o.push(k.text("Overall", { x: rcx, y: rcy - 6, size: 34, font: "inter-600", fill: C.ink, anchor: "middle" }));
  const p = k.pill(0, 0, "Sample result", "muted", { size: 20 });
  o.push(`<g transform="translate(${rcx - p.w / 2} ${rcy + 22})">${p.svg}</g>`);
  o.push(k.text("Five areas, each with a status.", { x: px + 36, y: py + ph - 82, size: 22, font: "plex-400", fill: C.soft }));
  o.push(k.text("Page-level detail sits in the full report.", { x: px + 36, y: py + ph - 48, size: 22, font: "plex-400", fill: C.soft }));

  // Right panel: five areas
  const qx = 632, qy = 246, qw = 888, qh = 664;
  o.push(k.panel(qx, qy, qw, qh, { fill: C.panel, r: 8 }));
  o.push(k.text("FIVE AREAS", { x: qx + 36, y: qy + 52, size: 17, font: "plex-500", fill: C.soft, tracking: 0.12 }));
  AREAS.forEach((a, i) => {
    const y = qy + 92 + i * 112;
    o.push(k.text(a.name, { x: qx + 36, y: y + 38, size: 32, font: "inter-600", fill: C.ink }));
    const pl = k.pill(0, 0, a.status, a.tone, { size: 20 });
    o.push(`<g transform="translate(${qx + qw - 36 - pl.w} ${y + 8})">${pl.svg}</g>`);
    const bw = qw - 72;
    o.push(`<rect x="${qx + 36}" y="${y + 62}" width="${bw}" height="16" rx="8" fill="rgba(245,240,232,0.08)"/>`);
    o.push(`<rect x="${qx + 36}" y="${y + 62}" width="${(bw * a.fill).toFixed(1)}" height="16" rx="8" fill="${TONES[a.tone].text}"/>`);
  });

  o.push(k.text("Illustrative interface. Sample content.", { x: 80, y: 944, size: 18, font: "plex-400", fill: C.soft }));
  o.push(`</svg>`);
  return o.join("");
}
