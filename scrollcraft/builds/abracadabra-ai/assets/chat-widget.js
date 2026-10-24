export const READINESS_FALLBACK = "https://check.abra-ca-dabra.app/check";
export const MIC_RATE = 16000;
// Runs off the main thread: averages the mic down to 16 kHz mono and posts 40 ms Int16 frames.
export const MIC_WORKLET = `
class AbraMic extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.step = sampleRate / ${16000};
    this.t = 0; this.acc = 0; this.count = 0;
    this.frame = new Int16Array(640); this.n = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this.acc += channel[i]; this.count++; this.t += 1;
      if (this.t >= this.step) {
        this.t -= this.step;
        const v = Math.max(-1, Math.min(1, this.acc / this.count));
        this.acc = 0; this.count = 0;
        this.frame[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        if (this.n === this.frame.length) {
          this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
          this.frame = new Int16Array(640); this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("abra-mic", AbraMic);
`;
const MIC_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v4"/></svg>`;
const STOP_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="2"/></svg>`;

const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "yahoo.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com",
]);

export const widgetCss = `
:host { color-scheme: dark; }
:host, * { box-sizing: border-box; }
button, textarea, input { font: inherit; color: inherit; }
button { cursor: pointer; }
.launcher, .panel, .card, .sheet, .composer, .bubble { 
  font-family: "IBM Plex Sans", system-ui, sans-serif;
}
.mark, .launcher, .header h2, .card h3, .sheet h2, .chip, .send, .primary {
  font-family: "Inter Tight", system-ui, sans-serif;
  letter-spacing: -0.02em;
}
.launcher {
  position: fixed; right: 24px; bottom: 24px; z-index: 30;
  display: inline-flex; align-items: center; gap: 10px;
  height: 48px; padding: 0 16px 0 14px; border-radius: 8px;
  background: #17160F; color: #F5F0E8;
  border: 1px solid rgba(245, 240, 232, 0.24);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35), 0 1px 0 rgba(245, 240, 232, 0.06) inset;
  font-size: 14px; font-weight: 500;
}
.launcher[hidden], .panel[hidden], .sheet[hidden] { display: none; }
.dot {
  width: 6px; height: 6px; border-radius: 50%; background: #C6FFB3;
  box-shadow: 0 0 0 4px rgba(198, 255, 179, 0.14); flex: none;
}
.spark { color: #FF4B24; display: inline-flex; }
.panel {
  position: fixed; right: 24px; bottom: 84px; z-index: 31;
  width: min(400px, calc(100vw - 32px));
  height: min(600px, calc(100dvh - 108px));
  display: flex; flex-direction: column;
  background: #11110F; color: #F5F0E8;
  border: 1px solid rgba(245, 240, 232, 0.24); border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35), 0 1px 0 rgba(245, 240, 232, 0.06) inset;
  overflow: hidden;
  transition: width 220ms cubic-bezier(.2, .7, .2, 1), height 220ms cubic-bezier(.2, .7, .2, 1);
}
.panel.expanded {
  width: min(540px, calc(100vw - 32px));
  height: min(680px, calc(100dvh - 96px));
}
.header, .sheet-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  min-height: 56px; padding: 10px 12px 10px 16px;
  border-bottom: 1px solid rgba(245, 240, 232, 0.12);
  background: #17160F;
}
.mark { margin: 0; font-size: 15px; font-weight: 600; }
.status { margin: 2px 0 0; color: #AAA49A; font-size: 12px; display: flex; align-items: center; gap: 8px; }
.header-actions, .sheet-actions { display: flex; align-items: center; gap: 6px; }
.ghost, .texty {
  background: transparent; color: #F5F0E8;
  border: 1px solid rgba(245, 240, 232, 0.24); border-radius: 6px;
  min-height: 36px; padding: 0 10px; font-size: 13px; font-weight: 500;
}
.texty { border: 0; color: #AAA49A; text-decoration: underline; text-underline-offset: 3px; padding: 0 8px; }
.icon {
  width: 36px; height: 36px; border-radius: 6px; border: 1px solid rgba(245, 240, 232, 0.24);
  background: transparent; color: #F5F0E8;
}
.stream { flex: 1; overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; background: #070706; }
.stream::-webkit-scrollbar { width: 8px; }
.stream::-webkit-scrollbar-thumb { background: rgba(245, 240, 232, 0.24); border-radius: 8px; }
.chips { display: flex; flex-direction: column; gap: 8px; }
.chip {
  text-align: left; background: #17160F; color: #F5F0E8;
  border: 1px solid rgba(245, 240, 232, 0.12); border-radius: 8px;
  padding: 12px 14px; font-size: 14px; font-weight: 500;
}
.chips.follow { flex-direction: row; flex-wrap: wrap; }
.chips.follow .chip { padding: 8px 12px; font-size: 13px; }
.chip:hover, .ghost:hover, .icon:hover { border-color: rgba(245, 240, 232, 0.4); }
.bubble { max-width: 92%; padding: 10px 12px; border-radius: 8px; font-size: 15px; line-height: 1.55; white-space: pre-wrap; }
.bubble.assistant { background: #11110F; border: 1px solid rgba(245, 240, 232, 0.12); }
.bubble a { color: #FF4B24; text-decoration: underline; text-underline-offset: 2px; overflow-wrap: anywhere; }
.bubble a:focus-visible { outline: 2px solid #FF4B24; outline-offset: 2px; border-radius: 2px; }
.bubble.user { align-self: flex-end; background: #17160F; border-left: 2px solid #FF4B24; }
.bubble.streaming::after {
  content: ""; display: inline-block; width: 2px; height: 14px; margin-left: 3px;
  background: #FF4B24; vertical-align: text-bottom;
  animation: blink 1s steps(1) infinite;
}
@keyframes blink { 50% { opacity: 0; } }
.bubble.thinking { display: inline-flex; align-items: center; gap: 10px; color: #AAA49A; }
.bubble.thinking::after { display: none; }
.thinking-dots { display: inline-flex; gap: 4px; }
.thinking-dots i { width: 6px; height: 6px; border-radius: 50%; background: #8DEBF2; opacity: 0.35; animation: think 1.2s ease-in-out infinite; }
.thinking-dots i:nth-child(2) { animation-delay: 0.15s; }
.thinking-dots i:nth-child(3) { animation-delay: 0.3s; }
@keyframes think { 0%, 80%, 100% { opacity: 0.35; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
.thinking-text { font-size: 14px; }
.retry { margin-top: 8px; display: block; background: transparent; color: #F5F0E8; border: 1px solid rgba(245, 240, 232, 0.3); border-radius: 8px; padding: 6px 12px; font-size: 14px; }
.retry:hover { border-color: #FF4B24; }
.retry:focus-visible { outline: 2px solid #FF4B24; outline-offset: 2px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.card {
  background: #17160F; border: 1px solid rgba(245, 240, 232, 0.12); border-radius: 8px;
  padding: 16px; display: grid; gap: 10px;
  box-shadow: 0 1px 0 rgba(245, 240, 232, 0.06) inset;
}
.kicker { margin: 0; color: #FF4B24; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
.card h3, .sheet h2 { margin: 0; font-size: 1.15rem; font-weight: 600; line-height: 1.25; }
.card p, .fine, .error { margin: 0; color: #AAA49A; font-size: 14px; line-height: 1.5; }
.primary, .send {
  display: inline-flex; align-items: center; justify-content: center;
  background: #FF4B24; color: #170804; border: 0; border-radius: 6px;
  min-height: 40px; padding: 0 14px; font-weight: 600; font-size: 14px; text-decoration: none;
}
.primary.secondary { background: transparent; color: #F5F0E8; border: 1px solid rgba(245, 240, 232, 0.24); }
.card a { color: #8DEBF2; }
.card a.primary { color: #170804; }
.card.booked { border-color: rgba(198, 255, 179, 0.45); }
.card ul, .card ol { margin: 0; padding-left: 18px; color: #F5F0E8; font-size: 14px; line-height: 1.5; display: grid; gap: 4px; }
.audit-score { color: #F5F0E8 !important; font-size: 15px !important; }
.clip-play { position: relative; display: block; width: 100%; padding: 0; border: 0; border-radius: 6px; overflow: hidden; background: #070706; cursor: pointer; aspect-ratio: 16 / 9; }
.clip-play img, .clip video { display: block; width: 100%; height: 100%; object-fit: cover; border-radius: 6px; }
.clip-play::after { content: "▶"; position: absolute; inset: auto auto 10px 10px; background: rgba(7, 7, 6, 0.8); color: #F5F0E8; border-radius: 999px; padding: 4px 10px; font-size: 13px; }
.clip-play:focus-visible { outline: 2px solid #FF4B24; outline-offset: 2px; }
.clip figure { margin: 0; display: grid; gap: 8px; }
.clip figcaption { color: #AAA49A; font-size: 13px; line-height: 1.45; }
.clip figcaption strong { color: #F5F0E8; font-weight: 600; }
.card-links { display: flex; flex-wrap: wrap; gap: 14px; font-size: 14px; }
.demo-badge { margin: 0; padding: 4px 14px; background: #2A1C08; color: #FFD7A8; font-size: 12px; font-weight: 600; }
.demo-badge[hidden] { display: none; }
.rc-options { display: grid; gap: 8px; }
.choice { text-align: left; background: #11110F; color: #F5F0E8; border: 1px solid rgba(245, 240, 232, 0.2); border-radius: 8px; padding: 10px 12px; font-size: 14px; line-height: 1.4; min-height: 44px; }
.choice:hover { border-color: #8DEBF2; }
.choice:focus-visible, .rc-field:focus-visible { outline: 2px solid #FF4B24; outline-offset: 2px; }
.choice:disabled, .rc button:disabled { opacity: 0.6; cursor: progress; }
.rc-check { padding: 6px 0; line-height: 1.4; }
.rc-detail { color: #F5F0E8 !important; font-style: italic; }
.rc-field { width: 100%; background: #070706; color: #F5F0E8; border: 1px solid rgba(245, 240, 232, 0.24); border-radius: 6px; min-height: 40px; padding: 0 10px; font: inherit; font-size: 16px; }
.rc-row { display: flex; gap: 12px; align-items: center; }
.card.booked .kicker { color: #C6FFB3; }
.mic {
  flex: none; width: 40px; min-height: 40px; border-radius: 6px;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; color: #F5F0E8; border: 1px solid rgba(245, 240, 232, 0.24);
}
.mic[hidden] { display: none; }
.mic:hover { border-color: rgba(245, 240, 232, 0.4); }
.mic.live { background: #FF4B24; color: #170804; border-color: #FF4B24; animation: ring 1.4s ease-out infinite; }
.mic.busy { opacity: 0.6; cursor: progress; }
@keyframes ring { 0% { box-shadow: 0 0 0 0 rgba(255, 75, 36, 0.45); } 100% { box-shadow: 0 0 0 10px rgba(255, 75, 36, 0); } }
.voice-note { margin: 0; padding: 0 14px 4px; color: #AAA49A; font-size: 12px; background: #11110F; }
.voice-note[hidden] { display: none; }
.voice-note strong { color: #F5F0E8; font-weight: 500; }
.call {
  display: flex; align-items: center; gap: 10px; padding: 10px 14px;
  border-top: 1px solid rgba(245, 240, 232, 0.12); background: #17160F;
}
.call[hidden] { display: none; }
.call-orb { flex: none; width: 12px; height: 12px; border-radius: 50%; background: #8DEBF2; box-shadow: 0 0 0 0 rgba(141, 235, 242, 0.5); animation: breathe 1.6s ease-in-out infinite; }
.call[data-state="thinking"] .call-orb { background: #F5F0E8; animation: pulse-dot 0.8s ease-in-out infinite; }
.call[data-state="speaking"] .call-orb { background: #C6FFB3; animation: talk 0.5s ease-in-out infinite alternate; }
.call[data-state="connecting"] .call-orb { background: #AAA49A; animation: none; }
.call-text { flex: 1; min-width: 0; }
.call-state { margin: 0; color: #F5F0E8; font-size: 14px; font-weight: 600; }
.call-heard { margin: 2px 0 0; color: #AAA49A; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-height: 1.2em; }
.call-time { color: #AAA49A; font-size: 12px; font-variant-numeric: tabular-nums; }
.call-end { background: #FF4B24; color: #170804; border: 0; border-radius: 6px; min-height: 36px; padding: 0 12px; font-weight: 600; font-size: 14px; }
@keyframes breathe { 50% { box-shadow: 0 0 0 7px rgba(141, 235, 242, 0); } }
@keyframes pulse-dot { 50% { opacity: 0.35; } }
@keyframes talk { from { transform: scale(0.8); } to { transform: scale(1.25); } }
.composer { display: flex; gap: 8px; padding: 12px; border-top: 1px solid rgba(245, 240, 232, 0.12); background: #11110F; }
textarea, .field input {
  width: 100%; resize: none; min-height: 40px; max-height: 120px;
  background: #070706; color: #F5F0E8; border: 1px solid rgba(245, 240, 232, 0.12); border-radius: 6px;
  padding: 9px 10px; font-size: 15px;
}
textarea:focus, .field input:focus, button:focus-visible { outline: 2px solid #FF4B24; outline-offset: 2px; }
.foot { margin: 0; padding: 0 14px 12px; color: #AAA49A; font-size: 12px; background: #11110F; }
.sheet { position: absolute; inset: 0; display: flex; flex-direction: column; background: #070706; }
.sheet-body { flex: 1; overflow: auto; padding: 12px; }
.sheet iframe { width: 100%; height: 100%; min-height: 360px; border: 0; background: #070706; border-radius: 8px; }
.skeleton { height: 280px; border-radius: 8px; background: linear-gradient(90deg, #11110F, #17160F, #11110F); background-size: 200% 100%; animation: pulse 1.2s ease infinite; }
@keyframes pulse { 50% { background-position: 100% 0; } }
.field { display: grid; gap: 6px; font-size: 13px; }
.check { display: flex; gap: 8px; align-items: flex-start; color: #F5F0E8; font-size: 14px; }
.error { color: #FF4B24; }
@media (max-width: 720px) {
  .launcher { right: 16px; bottom: 16px; }
  /* left + right instead of 100vw: 100vw includes a classic scrollbar and pushed the panel off the left edge. */
  .panel, .panel.expanded {
    left: 0; right: 0; bottom: 0; width: auto; max-width: 100%; border-radius: 16px 16px 0 0;
    height: min(78dvh, 100%);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  .panel.expanded { height: 92dvh; }
}
@media (prefers-reduced-motion: reduce) {
  .panel, .bubble.streaming::after, .skeleton, .mic.live, .call-orb, .thinking-dots i { transition: none; animation: none; }
}
`;

export function voiceSupported(win = typeof window === "undefined" ? undefined : window) {
  const Context = win?.AudioContext || win?.webkitAudioContext;
  return Boolean(
    Context && win?.AudioWorkletNode && win?.WebSocket && win?.navigator?.mediaDevices?.getUserMedia && win?.isSecureContext !== false,
  );
}

export function realtimeUrl(loc = typeof location === "undefined" ? undefined : location, pass = "") {
  const scheme = loc?.protocol === "http:" ? "ws:" : "wss:";
  const query = pass ? `?pass=${encodeURIComponent(pass)}` : "";
  return `${scheme}//${loc?.host || ""}/api/chat/realtime${query}`;
}

/** Turns 16-bit little-endian PCM into Web Audio samples. */
export function pcmToFloat(buffer) {
  const view = new DataView(buffer);
  const out = new Float32Array(Math.floor(buffer.byteLength / 2));
  for (let i = 0; i < out.length; i += 1) out[i] = view.getInt16(i * 2, true) / 0x8000;
  return out;
}

export function formatClock(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export const CALL_LABELS = {
  connecting: "Connecting…",
  listening: "Listening",
  thinking: "Thinking…",
  speaking: "Speaking · talk to interrupt",
};

// What the "working" indicator says while an answer is on its way: right away, after ~2s, after ~5s.
// Pre-generated Aura-2 lines (workers/abracadabra-chat npm run fillers): luna in /assets/voice/, the other
// A/B voices in /assets/voice/<voice>/. Same order as the worker; the call names its voice in "ready".
// Lines without built audio are never sent by the worker (FILLER_READY); their files may 404 until npm run fillers.
export const FILLER_LINES = ["Let me check.", "One sec.", "Let me see.", "Just a moment.", "Okay, one moment.", "Let me look.", "Bear with me a second.", "Hmm, let me think.", "Okay, checking.", "Give me a second."];
const FILLER_COUNT = FILLER_LINES.length;
const FILLER_PATH = "/assets/voice/filler-";
const FILLER_VOICES = ["luna", "thalia", "andromeda"];
export function fillerUrl(voice, index, version = FILLER_VERSION) {
  const name = FILLER_VOICES.includes(voice) ? voice : "luna";
  return `${name === "luna" ? FILLER_PATH : `/assets/voice/${name}/filler-`}${index}.mp3?v=${version}`;
}
const FILLER_VERSION = "7";
export const GREETING = "Hi, I'm the Abracadabra assistant. Ask me anything about our work, or tell me the job that eats your week.";
export const RETRY_TEXT = "Sorry, that took longer than it should. Please try again.";
// The worker marks retryable errors with `retry: true`. Older worker builds sent a longer sentence
// with the same opening, so match on the stable prefix too rather than one exact string.
const RETRY_PREFIX = "Sorry, that took longer than it should.";
export const isRetryText = (text) => typeof text === "string" && text.startsWith(RETRY_PREFIX);
export const THINKING_STEPS_MS = [0, 2000, 5000];
export const TYPED_TIMEOUT_MS = 20000;
export function thinkingLabel(question, step = 0) {
  if (step <= 0) return "Thinking…";
  if (step >= 2) return "Almost there…";
  const text = String(question || "").toLowerCase();
  if (/\b(book|call|meet|schedule|calendar|session)\b/.test(text)) return "Getting the booking ready…";
  if (/\b(cost|price|pricing|quote|budget|how much)\b/.test(text)) return "Checking how we price work…";
  if (/cloudflare|secure|security|host|fast|speed/.test(text)) return "Checking how we build…";
  if (/\b(service|services|offer|help with|can you build|voice|agent|assistant|automat|app)\b/.test(text)) return "Looking through our services…";
  if (/\b(ready|readiness|start|begin)\b/.test(text)) return "Checking the Readiness Check…";
  return "Looking through our work…";
}

export function launcherShouldHide({ bodyClass = "", menuOpen = false } = {}) {
  return menuOpen || String(bodyClass).split(/\s+/).includes("intake-lock");
}

export function companyDomain(email) {
  const domain = String(email || "").toLowerCase().split("@")[1] || "";
  if (!domain || FREE_MAIL.has(domain)) return "";
  return domain;
}

export function bookingNotes(messages) {
  return (messages || [])
    .filter((message) => message.role === "user" && !message.demo)
    .slice(-3)
    .map((message) => message.text)
    .join(" ")
    .slice(0, 500);
}

export function buildCalUrl(input = {}) {
  const link = String(input.calLink || "").trim().replace(/^https:\/\/cal\.com\//, "").replace(/^\/+/, "");
  if (!link) return null;
  const url = new URL(`https://cal.com/${link}`);
  if (input.embed !== false) {
    url.searchParams.set("embed", "true");
    url.searchParams.set("layout", "month_view");
  }
  url.searchParams.set("theme", "dark");
  if (input.name) url.searchParams.set("name", input.name);
  if (input.email) url.searchParams.set("email", input.email);
  if (input.notes) url.searchParams.set("notes", String(input.notes).slice(0, 500));
  url.searchParams.set("metadata[source]", "abracadabra-chat");
  if (input.sessionId) url.searchParams.set("metadata[chat_session_id]", input.sessionId);
  if (input.domain) url.searchParams.set("metadata[domain]", input.domain);
  if (input.utmSource) url.searchParams.set("metadata[utm_source]", input.utmSource);
  if (input.utmCampaign) url.searchParams.set("metadata[utm_campaign]", input.utmCampaign);
  return url.toString();
}

/** An https link that opens in a new tab, or null for anything else. */
function safeLink(href, label) {
  let url;
  try {
    url = new URL(String(href || ""));
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const link = el("a", "texty", label);
  link.href = url.toString();
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

export function readinessUrl(base, sessionId) {
  const url = new URL(base || READINESS_FALLBACK);
  if (!url.searchParams.get("utm_source")) url.searchParams.set("utm_source", "chat");
  if (sessionId) url.searchParams.set("chat_session_id", sessionId);
  return url.toString();
}

export function parseCalBookingMessage(event) {
  const data = event?.data;
  if (!data || typeof data !== "object") return null;
  const type = String(data.fullType || data.type || "");
  if (!/bookingSuccessful/i.test(type)) return null;
  const booking = data.data?.booking || data.data || data.payload || data;
  const externalId = booking.uid || booking.id || data.uid || null;
  const startsAt = booking.startTime || booking.start || data.startTime || null;
  if (!externalId || !startsAt) return null;
  const endsAt = booking.endTime || booking.end || data.endTime || null;
  const attendee = booking.attendees?.[0] || {};
  return {
    externalId: String(externalId),
    startsAt: String(startsAt),
    endsAt: endsAt ? String(endsAt) : null,
    email: attendee.email || data.email || null,
    name: attendee.name || data.name || null,
  };
}

export function onCalMessage(event, { onBooked, allowedOrigins = ["https://cal.com", "https://app.cal.com"] } = {}) {
  if (!allowedOrigins.includes(event?.origin)) return false;
  const booking = parseCalBookingMessage(event);
  if (!booking || typeof onBooked !== "function") return false;
  onBooked(booking);
  return true;
}

export function contactProblems(fields) {
  const name = String(fields?.name || "").trim();
  const email = String(fields?.email || "").trim();
  const goal = String(fields?.goal || "").trim();
  const windows = String(fields?.windows || "").trim();
  if (!name) return { field: "name", message: "Add your name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { field: "email", message: "Add a real email address." };
  if (goal.length > 1000) return { field: "goal", message: "Keep the note shorter." };
  if (windows.length > 300) return { field: "windows", message: "Keep the times shorter." };
  if (fields?.consent !== true) return { field: "consent", message: "Tick the box so a person can write back." };
  return null;
}

export function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "the time you picked";
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Assistant replies can carry links to our own pages, the Readiness Check, or Cal.com.
// They are built as real anchors from text nodes, so nothing in a reply is parsed as HTML.
const LINK = /https:\/\/(?:www\.|check\.)?abra-ca-dabra\.app(?:\/[^\s<>"')]*)?|https:\/\/(?:app\.)?cal\.(?:com|eu)\/[^\s<>"')]*/g;

function renderLinked(node, text) {
  const value = String(text || "");
  node.textContent = "";
  let at = 0;
  for (const match of value.matchAll(LINK)) {
    let href = match[0];
    const tail = href.match(/[.,;:!?]+$/);
    if (tail) href = href.slice(0, -tail[0].length);
    node.append(document.createTextNode(value.slice(at, match.index)));
    const link = document.createElement("a");
    const url = new URL(href);
    const here = url.hostname === location.hostname || url.hostname === "abra-ca-dabra.app" || url.hostname === "www.abra-ca-dabra.app";
    link.href = here && !url.hostname.startsWith("check.") ? `${url.pathname}${url.search}${url.hash}` : href;
    link.textContent = url.hostname.replace(/^www\./, "") + (url.pathname === "/" ? "" : url.pathname);
    if (!here || url.hostname.startsWith("check.")) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    node.append(link);
    at = match.index + href.length;
  }
  node.append(document.createTextNode(value.slice(at)));
}

async function readSse(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let split = buffer.indexOf("\n\n");
    while (split >= 0) {
      const chunk = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const event = chunk.match(/^event: ?(.*)$/m)?.[1] || "message";
      const data = chunk.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
      onEvent(event, data ? JSON.parse(data) : {});
      split = buffer.indexOf("\n\n");
    }
  }
}

const ElementBase = typeof HTMLElement === "undefined" ? class {} : HTMLElement;

export class AbraChat extends ElementBase {
  constructor() {
    super();
    this.isOpen = false;
    this.sessionId = "";
    this.config = {
      calLink: "",
      readinessCheckUrl: READINESS_FALLBACK,
      turnstileSiteKey: "",
      greeting: GREETING,
    };
    this.messages = [];
    this.contact = null;
    this.ready = false;
  }

  connectedCallback() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = widgetCss;
    root.append(style);
    this.launcher = el("button", "launcher");
    this.launcher.type = "button";
    this.launcher.setAttribute("aria-expanded", "false");
    this.launcher.innerHTML = `<span class="spark" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M7 0l1.2 4.6L13 6.2 8.2 8.2 7 14 5.8 8.2 1 6.2l4.8-1.6z"/></svg></span><span class="dot" aria-hidden="true"></span><span>Ask Abracadabra</span>`;
    this.panel = el("section", "panel");
    this.panel.hidden = true;
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-modal", "true");
    this.panel.setAttribute("aria-labelledby", "abra-chat-title");
    this.panel.innerHTML = `
      <header class="header">
        <div>
          <p class="mark" id="abra-chat-title">abracadabra</p>
          <p class="status"><span class="dot" aria-hidden="true"></span> Online · Replies in seconds</p>
        </div>
        <div class="header-actions">
          <button class="ghost" type="button" data-book>Book a call</button>
          <button class="icon" type="button" data-close aria-label="Close chat">×</button>
        </div>
      </header>
      <div class="stream" role="log" aria-live="polite"></div>
      <p class="sr-only" role="status" aria-live="polite" data-chat-status></p>
      <form class="composer">
        <textarea rows="1" aria-label="Message" placeholder="Ask about the work" maxlength="2000"></textarea>
        <button class="mic" type="button" data-mic aria-label="Start voice chat" title="Start voice chat" aria-pressed="false" hidden>${MIC_SVG}</button>
        <button class="send" type="submit">Send</button>
      </form>
      <div class="call" data-call data-state="connecting" hidden>
        <span class="call-orb" aria-hidden="true"></span>
        <div class="call-text" aria-live="polite">
          <p class="call-state" data-call-state>Connecting…</p>
          <p class="call-heard" data-call-heard></p>
        </div>
        <span class="call-time" data-call-time>0:00</span>
        <button class="call-end" type="button" data-call-end>End</button>
      </div>
      <p class="demo-badge" data-demo-badge role="status" hidden>Demo: role-play receptionist. Nothing is booked or kept. Say “stop demo” to end.</p>
      <p class="voice-note" data-voice-note hidden><strong>Tap the mic to talk out loud. Just speak; tap End when you're done.</strong> Audio isn't stored. Only the words are kept, like a typed chat.</p>
      <p class="foot">Plain answers. A person reviews any follow-up.</p>
      <div class="sheet" hidden>
        <div class="sheet-bar">
          <button class="ghost" type="button" data-back>Back to chat</button>
          <h2>30-minute working session</h2>
          <a class="texty" data-newtab target="_blank" rel="noopener noreferrer">New tab</a>
        </div>
        <div class="sheet-body"></div>
      </div>`;
    root.append(this.launcher, this.panel);
    this.stream = this.panel.querySelector(".stream");
    this.form = this.panel.querySelector(".composer");
    this.input = this.panel.querySelector("textarea");
    this.sheet = this.panel.querySelector(".sheet");
    this.sheetBody = this.panel.querySelector(".sheet-body");
    this.newTab = this.panel.querySelector("[data-newtab]");
    this.mic = this.panel.querySelector("[data-mic]");
    this.voiceNote = this.panel.querySelector("[data-voice-note]");
    this.callBar = this.panel.querySelector("[data-call]");
    this.callState = this.panel.querySelector("[data-call-state]");
    this.callHeard = this.panel.querySelector("[data-call-heard]");
    this.callTime = this.panel.querySelector("[data-call-time]");
    this.demoBadge = this.panel.querySelector("[data-demo-badge]");
    this.status = this.panel.querySelector("[data-chat-status]");
    this.mic.addEventListener("click", () => this.toggleCall());
    this.panel.querySelector("[data-call-end]").addEventListener("click", () => this.endCall("visitor"));
    this.launcher.addEventListener("click", () => this.openPanel());
    this.panel.querySelector("[data-close]").addEventListener("click", () => this.closePanel());
    this.panel.querySelector("[data-book]").addEventListener("click", () => this.openBooking());
    this.panel.querySelector("[data-back]").addEventListener("click", () => this.closeBooking());
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.send(this.input.value);
    });
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        this.form.requestSubmit();
      }
    });
    this.input.addEventListener("input", () => {
      this.input.style.height = "auto";
      this.input.style.height = `${Math.min(this.input.scrollHeight, 120)}px`;
    });
    this.panel.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!this.sheet.hidden) this.closeBooking();
      else this.closePanel();
    });
    this.onMessage = (event) => onCalMessage(event, { onBooked: (booking) => this.completeBooking(booking) });
    window.addEventListener("message", this.onMessage);
    this.sync = () => this.syncChrome();
    document.body.addEventListener("toggle", this.sync, true);
    this.observer = new MutationObserver(this.sync);
    this.observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    this.onScroll = () => {
      if (this.scrollFrame) return;
      this.scrollFrame = requestAnimationFrame(() => {
        this.scrollFrame = 0;
        this.placeLauncher();
      });
    };
    window.addEventListener("scroll", this.onScroll, { passive: true });
    window.addEventListener("resize", this.onScroll, { passive: true });
    this.syncChrome();
    this.placeLauncher();
  }

  disconnectedCallback() {
    this.endCall("left");
    window.removeEventListener("message", this.onMessage);
    window.removeEventListener("scroll", this.onScroll);
    window.removeEventListener("resize", this.onScroll);
    if (this.scrollFrame) cancelAnimationFrame(this.scrollFrame);
    document.body?.removeEventListener("toggle", this.sync, true);
    this.observer?.disconnect();
  }

  placeLauncher() {
    if (!this.launcher || this.isOpen) return;
    const block = document.querySelector("form.intake button[type='submit'], .site-close .btn--primary");
    if (!block) {
      this.launcher.style.bottom = "";
      return;
    }
    const rect = block.getBoundingClientRect();
    const zone = 88;
    const covers = rect.top < window.innerHeight && rect.bottom > window.innerHeight - zone;
    this.launcher.style.bottom = covers ? `${Math.min(window.innerHeight - rect.top + 16, 240)}px` : "";
  }

  syncChrome() {
    const hide = launcherShouldHide({
      bodyClass: document.body?.className || "",
      menuOpen: Boolean(document.querySelector(".site-nav__menu[open]")),
    });
    this.launcher.hidden = hide || this.isOpen;
    if (hide && this.isOpen) this.closePanel();
  }

  async openPanel() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.panel.hidden = false;
    this.launcher.hidden = true;
    this.launcher.setAttribute("aria-expanded", "true");
    if (!this.booted) {
      this.booted = true;
      await this.boot();
    }
    this.input.focus();
  }

  closePanel() {
    this.endCall("closed");
    this.isOpen = false;
    this.closeBooking();
    this.panel.hidden = true;
    this.launcher.hidden = launcherShouldHide({
      bodyClass: document.body?.className || "",
      menuOpen: Boolean(document.querySelector(".site-nav__menu[open]")),
    });
    this.launcher.setAttribute("aria-expanded", "false");
    this.launcher.focus();
  }

  async boot() {
    try {
      const response = await fetch("/api/chat/config", { headers: { accept: "application/json" } });
      if (response.ok) this.config = { ...this.config, ...(await response.json()) };
    } catch {
      this.note("The studio line is quiet. You can still leave a note, or email houdini@abra-ca-dabra.app.");
    }
    if (this.config.turnstileSiteKey) await this.turnstile();
    await this.ensureSession();
    this.greeting();
    this.setupVoice();
  }

  setupVoice() {
    const on = Boolean(this.config.voiceEnabled && this.ready && voiceSupported());
    this.mic.hidden = !on;
    this.voiceNote.hidden = !on;
    this.callState_ = "idle";
  }

  async toggleCall() {
    if (this.call) this.endCall("visitor");
    else await this.startCall();
  }

  /**
   * One tap starts a hands-free call. Everything that needs the tap (AudioContext creation and
   * resume, which is what unlocks sound on iOS Safari) happens before the first await.
   */
  async startCall() {
    if (this.call || !voiceSupported()) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    let ctx;
    try {
      ctx = this.audioCtx && this.audioCtx.state !== "closed" ? this.audioCtx : new Context({ latencyHint: "interactive" });
    } catch {
      this.note("This browser cannot start a voice chat. You can type your question instead.");
      return;
    }
    this.audioCtx = ctx;
    const resumed = ctx.resume?.().catch?.(() => {});
    try {
      // A silent sample played inside the tap keeps iOS output unlocked.
      const blank = ctx.createBuffer(1, 1, ctx.sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = blank;
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      // Optional.
    }
    const call = {
      ws: null, stream: null, node: null, sink: null, sources: new Set(), playHead: 0,
      started: Date.now(), state: "connecting", turn: 0, serverState: "connecting", ending: false,
    };
    this.call = call;
    this.setCallUi("connecting");
    this.callTimer = setInterval(() => this.renderClock(), 500);
    // The person check runs while the mic permission prompt is up.
    const passing = this.voicePass().then((pass) => ({ pass }), (error) => ({ error }));
    try {
      call.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch {
      this.endCall("mic_blocked", { quiet: true });
      this.note("The mic is blocked or missing. You can type your question instead.");
      return;
    }
    this.voiceTimings = {};
    this.markVoice("mic");
    if (this.call !== call) {
      for (const track of call.stream.getTracks()) track.stop();
      return;
    }
    try {
      await resumed;
      if (!this.workletUrl) this.workletUrl = URL.createObjectURL(new Blob([MIC_WORKLET], { type: "text/javascript" }));
      if (!ctx.abraMicLoaded) {
        await ctx.audioWorklet.addModule(this.workletUrl);
        ctx.abraMicLoaded = true;
      }
      const input = ctx.createMediaStreamSource(call.stream);
      call.node = new AudioWorkletNode(ctx, "abra-mic", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
      call.sink = ctx.createGain();
      call.sink.gain.value = 0;
      input.connect(call.node);
      call.node.connect(call.sink).connect(ctx.destination);
      call.input = input;
    } catch {
      this.endCall("audio_error", { quiet: true });
      this.note("This browser cannot start a voice chat. You can type your question instead.");
      return;
    }
    if (this.call !== call) return;
    this.loadFillers(ctx);
    const checked = await passing;
    if (this.call !== call) return;
    if (!checked.pass) {
      this.endCall("check_failed", { quiet: true });
      this.note(checked.error?.message || "The voice check did not go through. You can keep typing.");
      return;
    }
    const ws = new WebSocket(realtimeUrl(location, checked.pass));
    ws.binaryType = "arraybuffer";
    call.ws = ws;
    call.node.port.onmessage = (event) => {
      if (ws.readyState === 1) ws.send(event.data);
    };
    ws.addEventListener("message", (event) => this.onCallMessage(call, event.data));
    ws.addEventListener("close", () => {
      if (this.call === call) this.endCall(call.endReason || "closed", { quiet: true, socketClosed: true });
    });
    ws.addEventListener("error", () => {
      if (this.call === call && call.serverState === "connecting") {
        this.endCall("connect_failed", { quiet: true });
        this.note("The voice line did not connect. You can keep typing.");
      }
    });
  }

  onCallMessage(call, data) {
    if (this.call !== call) return;
    if (typeof data !== "string") {
      this.playPcm(call, data);
      return;
    }
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    switch (message.type) {
      case "ready":
        call.rate = message.sampleRate || 24000;
        // The call's voice (A/B test): its own filler lines, so a filler never switches voices.
        if (message.voice && message.voice !== "luna" && this.audioCtx) this.loadFillers(this.audioCtx, message.voice);
        break;
      case "state":
        call.serverState = message.state;
        if (message.state === "listening") this.callHeard.textContent = "";
        this.setCallUi(message.state === "listening" && call.sources.size ? "speaking" : message.state);
        if (message.state === "thinking") this.startCallThinking(call);
        else this.stopCallThinking(call);
        break;
      case "filler":
        this.playFiller(call, message.index);
        break;
      case "interim":
        if (call.serverState === "listening") this.callHeard.textContent = message.text;
        break;
      case "user":
        this.markVoice("heard");
        call.lastHeard = message.text;
        this.callHeard.textContent = "";
        this.messages.push({ role: "user", text: message.text, ...(message.demo ? { demo: true } : {}) });
        this.addBubble("user", message.text);
        break;
      case "assistant":
        call.turn = message.turn;
        this.messages.push({ role: "assistant", text: message.text, ...(message.demo ? { demo: true } : {}) });
        this.addBubble("assistant", message.text);
        this.markVoice("reply");
        if (message.action) this.action(message.action);
        break;
      case "ui_action":
        this.action(message.action);
        break;
      case "card":
        this.showCard(message.card);
        break;
      case "demo":
        this.setDemo(message.state === "on");
        break;
      case "audio_start":
        call.turn = message.turn;
        call.audioDone = false;
        break;
      case "audio_end":
        call.audioDone = true;
        this.maybePlayed(call);
        break;
      case "interrupt":
        this.stopPlayback(call);
        break;
      case "notice":
        this.note(message.text);
        break;
      case "end":
        call.endReason = message.reason;
        this.endCall(message.reason, { quiet: true });
        break;
      default:
        break;
    }
  }

  /** Queues each PCM chunk right after the previous one so the reply plays as it streams. */
  playPcm(call, buffer) {
    const ctx = this.audioCtx;
    if (!ctx || !buffer?.byteLength) return;
    const samples = pcmToFloat(buffer);
    if (!samples.length) return;
    const clip = ctx.createBuffer(1, samples.length, call.rate || 24000);
    clip.copyToChannel ? clip.copyToChannel(samples, 0) : clip.getChannelData(0).set(samples);
    const source = ctx.createBufferSource();
    source.buffer = clip;
    source.connect(ctx.destination);
    const at = Math.max(ctx.currentTime + 0.02, call.playHead);
    source.start(at);
    call.playHead = at + clip.duration;
    call.sources.add(source);
    if (!call.playing) {
      call.playing = true;
      this.markVoice("playing");
      this.voiceTimings.audibleAt = this.voiceTimings.playing + (at - ctx.currentTime + (ctx.outputLatency || ctx.baseLatency || 0)) * 1000;
      this.setCallUi("speaking");
    }
    source.onended = () => {
      call.sources.delete(source);
      this.maybePlayed(call);
    };
  }

  /** Loads the pre-generated filler lines once per page; they are tiny and cached by the browser. */
  loadFillers(ctx, voice = "luna") {
    const name = FILLER_VOICES.includes(voice) ? voice : "luna";
    this.fillerSets ||= {};
    this.fillers = this.fillerSets[name];
    if (this.fillers) return;
    this.fillers = this.fillerSets[name] = [];
    const set = this.fillers;
    for (let index = 0; index < FILLER_COUNT; index += 1) {
      fetch(fillerUrl(name, index))
        .then((response) => (response.ok ? response.arrayBuffer() : null))
        .then((bytes) => (bytes ? new Promise((resolve, reject) => ctx.decodeAudioData(bytes, resolve, reject)) : null))
        .then((buffer) => { if (buffer) set[index] = buffer; })
        .catch(() => {});
    }
  }

  /** Plays one short "Let me check that." line; the answer queues right after it. Talking stops it. */
  playFiller(call, index) {
    const ctx = this.audioCtx;
    const clip = this.fillers?.[index] || this.fillers?.find(Boolean);
    if (!ctx || !clip || call.playing) return;
    const source = ctx.createBufferSource();
    source.buffer = clip;
    source.connect(ctx.destination);
    const at = Math.max(ctx.currentTime + 0.02, call.playHead);
    source.start(at);
    call.playHead = at + clip.duration;
    call.sources.add(source);
    this.markVoice("filler");
    this.voiceTimings.fillerAudibleAt = this.voiceTimings.filler + (at - ctx.currentTime + (ctx.outputLatency || ctx.baseLatency || 0)) * 1000;
    this.stopCallThinking(call, { keepText: true });
    this.callHeard.textContent = FILLER_LINES[index] || "One sec…";
    source.onended = () => {
      call.sources.delete(source);
      this.maybePlayed(call);
    };
  }

  startCallThinking(call) {
    this.stopCallThinking(call);
    const show = (step) => {
      if (this.call !== call || call.serverState !== "thinking") return;
      this.callHeard.textContent = thinkingLabel(call.lastHeard, step || 1);
    };
    show(1);
    call.thinkingTimer = setTimeout(() => show(2), THINKING_STEPS_MS[2] - THINKING_STEPS_MS[1]);
  }

  stopCallThinking(call, { keepText = false } = {}) {
    clearTimeout(call.thinkingTimer);
    call.thinkingTimer = null;
    if (!keepText && call.serverState !== "thinking" && call.serverState !== "listening") this.callHeard.textContent = "";
  }

  maybePlayed(call) {
    if (call.sources.size || !call.audioDone || !call.playing) return;
    call.playing = false;
    call.audioDone = false;
    if (call.ws?.readyState === 1) call.ws.send(JSON.stringify({ type: "played", turn: call.turn }));
    this.setCallUi(call.serverState === "speaking" ? "listening" : call.serverState);
  }

  stopPlayback(call) {
    for (const source of call.sources) {
      source.onended = null;
      try { source.stop(); } catch { /* not started */ }
    }
    call.sources.clear();
    call.playHead = 0;
    call.playing = false;
    call.audioDone = false;
    this.setCallUi("listening");
  }

  endCall(reason = "visitor", { quiet = false, socketClosed = false } = {}) {
    const call = this.call;
    if (!call) return;
    this.call = null;
    clearInterval(this.callTimer);
    clearTimeout(call.thinkingTimer);
    if (!quiet && call.ws?.readyState === 1) {
      try { call.ws.send(JSON.stringify({ type: "end" })); } catch { /* gone */ }
    }
    if (!socketClosed) {
      try { call.ws?.close(1000); } catch { /* gone */ }
    }
    for (const source of call.sources) {
      try { source.stop(); } catch { /* not started */ }
    }
    call.sources.clear();
    if (call.node) call.node.port.onmessage = null;
    try { call.input?.disconnect(); } catch { /* gone */ }
    try { call.node?.disconnect(); } catch { /* gone */ }
    try { call.sink?.disconnect(); } catch { /* gone */ }
    for (const track of call.stream?.getTracks?.() || []) track.stop();
    this.lastCallEnd = reason;
    this.setDemo(false);
    this.setCallUi("idle");
  }

  setCallUi(state) {
    this.callState_ = state;
    const live = state !== "idle";
    this.callBar.hidden = !live;
    this.callBar.dataset.state = state;
    this.callState.textContent = CALL_LABELS[state] || "";
    if (!live) this.callHeard.textContent = "";
    this.mic.classList.toggle("live", live);
    this.mic.setAttribute("aria-pressed", live ? "true" : "false");
    this.mic.innerHTML = live ? STOP_SVG : MIC_SVG;
    const label = live ? "End voice chat" : "Start voice chat";
    this.mic.setAttribute("aria-label", label);
    this.mic.title = label;
    this.voiceNote.hidden = live || this.mic.hidden;
    this.renderClock();
    this.fitSheet();
  }

  /** On a voice call the booking sheet stops above the call bar, so End and the call state stay in view. */
  fitSheet() {
    if (!this.sheet) return;
    if (this.sheet.hidden || this.callBar.hidden) {
      this.sheet.style.bottom = "";
      return;
    }
    const gap = this.panel.getBoundingClientRect().bottom - this.callBar.getBoundingClientRect().top;
    this.sheet.style.bottom = `${Math.max(0, Math.round(gap))}px`;
  }

  renderClock() {
    if (this.call) this.callTime.textContent = formatClock(Date.now() - this.call.started);
  }

  markVoice(name) {
    this.voiceTimings = { ...(this.voiceTimings || {}), [name]: performance.now() };
    try {
      performance.mark(`abra-voice-${name}`);
    } catch {
      // Timing marks are optional.
    }
  }

  turnstile(message = "Confirm you are a person, then the chat opens.") {
    return new Promise((resolve) => {
      const box = el("div", "card");
      box.append(el("p", "kicker", "Check"), el("p", null, message));
      const mount = el("div");
      box.append(mount);
      this.stream.append(box);
      const render = () => {
        if (!window.turnstile) return setTimeout(render, 50);
        window.turnstile.render(mount, {
          sitekey: this.config.turnstileSiteKey,
          theme: "dark",
          callback: (token) => {
            this.turnstileToken = token;
            box.remove();
            resolve(token);
          },
        });
      };
      if (!document.querySelector("script[data-abra-turnstile]")) {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.dataset.abraTurnstile = "1";
        script.onload = render;
        document.head.append(script);
      } else render();
    });
  }

  /** A fresh Turnstile pass for this one call; the worker refuses a call without it. */
  async voicePass() {
    const token = this.config.turnstileSiteKey ? await this.turnstile("Quick check before the voice chat starts.") : "";
    const response = await fetch("/api/chat/voice-pass", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ turnstileToken: token || "", page: location.pathname, title: document.title }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.pass) throw new Error(data.error || "The voice check did not go through.");
    return data.pass;
  }

  async ensureSession() {
    if (this.sessionId) return;
    const response = await fetch("/api/chat/session", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        page: `${location.pathname}${location.search}`,
        turnstileToken: this.turnstileToken || "",
      }),
    });
    if (!response.ok) {
      this.note("The chat could not open. Email houdini@abra-ca-dabra.app.");
      this.form.querySelector("button").disabled = true;
      return;
    }
    const payload = await response.json();
    this.sessionId = payload.sessionId;
    this.ready = true;
  }

  greeting() {
    if (this.stream.childElementCount) return;
    this.addBubble("assistant", this.config.greeting || GREETING);
    const chips = el("div", "chips");
    const specs = [
      ["Book a 30-min working session", () => this.openBooking()],
      ["Take the AI Readiness Check (5–7 min)", () => this.showReadiness()],
      ["What would you automate first?", () => this.send("What would you automate first for my business?")],
    ];
    for (const [label, run] of specs) {
      const button = el("button", "chip", label);
      button.type = "button";
      button.addEventListener("click", run);
      chips.append(button);
    }
    this.stream.append(chips);
  }

  addBubble(role, text) {
    const bubble = el("div", `bubble ${role}`, role === "assistant" ? null : text);
    if (role === "assistant") renderLinked(bubble, text);
    this.stream.append(bubble);
    this.stream.scrollTop = this.stream.scrollHeight;
    return bubble;
  }

  note(text) {
    const card = el("div", "card");
    card.append(el("p", null, text));
    this.stream.append(card);
  }

  params() {
    const search = new URLSearchParams(location.search);
    return {
      utmSource: search.get("utm_source") || "",
      utmCampaign: search.get("utm_campaign") || "",
    };
  }

  calInput(embed = true) {
    return {
      calLink: this.config.calLink,
      embed,
      name: this.contact?.name || "",
      email: this.contact?.email || "",
      notes: this.bookingNotesOverride || bookingNotes(this.messages),
      sessionId: this.sessionId,
      domain: companyDomain(this.contact?.email),
      ...this.params(),
    };
  }

  async openBooking({ notes = "" } = {}) {
    // A recap or mini-audit button passes its own notes; they prefill Cal.com, nothing is sent.
    this.bookingNotesOverride = String(notes || "").slice(0, 500);
    if (!this.isOpen) await this.openPanel();
    this.savedScroll = this.stream.scrollTop;
    this.panel.classList.add("expanded");
    this.sheet.hidden = false;
    this.fitSheet();
    requestAnimationFrame(() => this.fitSheet());
    this.sheetBody.replaceChildren();
    const link = buildCalUrl(this.calInput(true));
    const external = buildCalUrl(this.calInput(false));
    if (external) this.newTab.href = external;
    else this.newTab.href = "mailto:houdini@abra-ca-dabra.app?subject=Working%20session";
    if (this.sessionId) {
      this.bookingOffered = true;
      void this.postEvent({ kind: "booking_opened" });
    }
    if (!link) {
      this.fallbackForm();
      return;
    }
    const skeleton = el("div", "skeleton");
    skeleton.setAttribute("aria-hidden", "true");
    const frame = document.createElement("iframe");
    frame.title = "Book a thirty-minute working session";
    frame.src = link;
    frame.hidden = true;
    frame.addEventListener("load", () => {
      skeleton.remove();
      frame.hidden = false;
    });
    this.sheetBody.append(skeleton, frame);
  }

  closeBooking() {
    this.sheet.hidden = true;
    this.fitSheet();
    this.panel.classList.remove("expanded");
    if (Number.isFinite(this.savedScroll)) this.stream.scrollTop = this.savedScroll;
  }

  fallbackForm() {
    const card = el("div", "card");
    card.append(
      el("p", "kicker", "Next step · 30 minutes"),
      el("h3", null, "Pick two times that work."),
      el("p", null, "Leave your email. We send a calendar invite. A person sends it. Nothing goes out on its own."),
    );
    const form = document.createElement("form");
    form.className = "card";
    form.innerHTML = `
      <label class="field">Name <input name="name" autocomplete="name" required maxlength="120"></label>
      <label class="field">Email <input name="email" type="email" autocomplete="email" required maxlength="200"></label>
      <label class="field">Two times <input name="windows" placeholder="Tue morning, Thu afternoon" maxlength="300"></label>
      <label class="check"><input name="consent" type="checkbox"> A person may write back about this note.</label>
      <p class="error" hidden></p>
      <button class="primary" type="submit">Send times</button>`;
    if (this.contact?.name) form.elements.name.value = this.contact.name;
    if (this.contact?.email) form.elements.email.value = this.contact.email;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.submitContact({
        name: form.elements.name.value,
        email: form.elements.email.value,
        goal: "Working session",
        windows: form.elements.windows.value,
        consent: form.elements.consent.checked,
      }, form.querySelector(".error"));
    });
    this.sheetBody.append(card, form);
  }

  showReadiness() {
    const url = readinessUrl(this.config.readinessCheckUrl, this.sessionId);
    const card = el("div", "card");
    card.dataset.readinessCard = "true";
    card.append(
      el("p", "kicker", "Five to seven minutes"),
      el("h3", null, "Take the AI Readiness Check."),
      el("p", null, "Answer here in the chat, one question at a time. You get a score for readiness, growth, and how AI answer engines read your site, then a plan."),
    );
    const start = el("button", "primary", "Start it here");
    start.type = "button";
    start.addEventListener("click", () => {
      start.disabled = true;
      void this.postEvent({ kind: "readiness_check_clicked" });
      void this.startReadiness();
    });
    const link = el("a", "texty", "Open it on its own page");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.addEventListener("click", () => {
      void this.postEvent({ kind: "readiness_check_clicked" });
    });
    card.append(start, link);
    this.stream.append(card);
    this.stream.scrollTop = this.stream.scrollHeight;
  }

  async readinessCall(body) {
    try {
      const response = await fetch("/api/chat/readiness", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      return { status: response.status, data };
    } catch {
      return { status: 0, data: { error: "The check is not answering right now. You can take it on its own page." } };
    }
  }

  async startReadiness() {
    if (!this.sessionId) await this.ensureSession();
    const { data } = await this.readinessCall({ op: "start" });
    this.renderReadiness(data);
  }

  renderReadiness(data) {
    if (data.done) return this.showReadinessResult(data);
    if (data.step) return this.readinessCard(data.step, data.error);
    const card = el("div", "card");
    card.append(el("p", "kicker", "Readiness Check"), el("p", "error", data.error || "Something went wrong."));
    const link = el("a", "texty", "Open the check");
    link.href = data.fallbackUrl || readinessUrl(this.config.readinessCheckUrl, this.sessionId);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    card.append(link);
    this.stream.append(card);
    this.stream.scrollTop = this.stream.scrollHeight;
  }

  /** One question as a card: buttons for one choice, boxes for several, a field for text. */
  readinessCard(step, error) {
    this.stream.querySelector("[data-readiness-step]")?.remove();
    const card = el("div", "card rc");
    card.dataset.readinessStep = step.id;
    const titleId = `rc-${step.id.replace(/[^a-z0-9]/gi, "")}-${Date.now()}`;
    const count = step.progress ? `Readiness Check · ${step.progress.answered + 1} of about ${step.progress.estimate}` : "Readiness Check";
    const title = el("h3", null, step.prompt);
    title.id = titleId;
    card.append(el("p", "kicker", count), title);
    if (step.detail) card.append(el("p", "rc-detail", `“${step.detail}”`));
    const group = el("div", "rc-options");
    group.setAttribute("role", "group");
    group.setAttribute("aria-labelledby", titleId);
    const problem = el("p", "error");
    problem.setAttribute("role", "alert");
    if (error) problem.textContent = error;
    else problem.hidden = true;
    const submit = (value, label) => this.answerReadiness(step, value, label, card, problem);

    if (step.kind === "single_select" || step.kind === "severity") {
      for (const option of step.options || []) {
        const button = el("button", "choice", option.label);
        button.type = "button";
        button.addEventListener("click", () => submit(option.value, option.label));
        group.append(button);
      }
      card.append(group, problem);
    } else if (step.kind === "multi_select") {
      card.append(el("p", "fine", "Pick any that apply."));
      for (const option of step.options || []) {
        const row = el("label", "check rc-check");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.value = option.value;
        row.append(box, document.createTextNode(` ${option.label}`));
        group.append(row);
      }
      const next = el("button", "primary", "None of these, next");
      next.type = "button";
      group.addEventListener("change", () => {
        next.textContent = group.querySelector("input:checked") ? "Next" : "None of these, next";
      });
      next.addEventListener("click", () => {
        const picked = [...group.querySelectorAll("input:checked")];
        const labels = picked.map((box) => box.parentElement.textContent.trim());
        submit(picked.map((box) => box.value), labels.length ? labels.join(" / ") : "None of these");
      });
      card.append(group, problem, next);
    } else {
      const field = document.createElement("input");
      field.className = "rc-field";
      field.setAttribute("aria-labelledby", titleId);
      if (step.kind === "url") {
        field.inputMode = "url";
        field.autocomplete = "url";
        field.placeholder = "example.com";
      }
      if (step.maxLength) field.maxLength = step.maxLength;
      card.append(field);
      if (step.suggestions?.length) {
        const chips = el("div", "chips");
        for (const suggestion of step.suggestions) {
          const chip = el("button", "chip", suggestion);
          chip.type = "button";
          chip.addEventListener("click", () => { field.value = suggestion; field.focus(); });
          chips.append(chip);
        }
        card.append(chips);
      }
      const row = el("div", "rc-row");
      const next = el("button", "primary", "Next");
      next.type = "button";
      next.addEventListener("click", () => submit(field.value, field.value.trim()));
      field.addEventListener("keydown", (event) => {
        if (event.key === "Enter") { event.preventDefault(); next.click(); }
      });
      row.append(next);
      if (step.kind === "text") {
        const skip = el("button", "texty", "Skip");
        skip.type = "button";
        skip.addEventListener("click", () => submit("", "(skipped)"));
        row.append(skip);
      }
      card.append(problem, row);
    }
    this.stream.append(card);
    // Long questions start at their heading, not at the bottom of the list.
    this.stream.scrollTop = Math.max(0, card.offsetTop - this.stream.offsetTop - 8);
    card.querySelector("button, input")?.focus({ preventScroll: true });
  }

  async answerReadiness(step, value, label, card, problem) {
    if (card.dataset.busy) return;
    card.dataset.busy = "1";
    for (const control of card.querySelectorAll("button, input")) control.disabled = true;
    const { status, data } = await this.readinessCall({ op: "answer", stepId: step.id, answer: value });
    if (status === 200) {
      card.remove();
      this.addBubble("user", label || "(skipped)");
      this.renderReadiness(data);
      return;
    }
    delete card.dataset.busy;
    for (const control of card.querySelectorAll("button, input")) control.disabled = false;
    if (data.step && data.step.id !== step.id) {
      card.remove();
      this.readinessCard(data.step);
      return;
    }
    if (!data.step && data.fallbackUrl) {
      card.remove();
      this.renderReadiness(data);
      return;
    }
    problem.hidden = false;
    problem.textContent = data.error || "Check that answer.";
  }

  showReadinessResult(data) {
    if (this.stream.querySelector("[data-readiness-result]")) return;
    const card = el("div", "card booked");
    card.dataset.readinessResult = "true";
    card.append(
      el("p", "kicker", "Readiness Check · scored"),
      el("h3", null, `${data.band?.label || "Scored"}.`),
    );
    if (data.band?.sentence) card.append(el("p", null, data.band.sentence));
    card.append(el("p", "fine", "The full report opens on the check site. It asks for your email, then shows each score and three suggestions in each section."));
    const report = el("a", "primary", "See your score and plan");
    report.href = data.reportUrl;
    report.target = "_blank";
    report.rel = "noopener noreferrer";
    const book = el("button", "texty", "Book a 30-min working session");
    book.type = "button";
    book.addEventListener("click", () => this.openBooking());
    card.append(report, book);
    this.stream.append(card);
    this.stream.scrollTop = this.stream.scrollHeight;
    this.status.textContent = `Readiness Check scored: ${data.band?.label || "done"}.`;
  }

  showBookingCard() {
    if (this.stream.querySelector("[data-booking-card]")) return;
    const card = el("div", "card");
    card.dataset.bookingCard = "true";
    card.append(
      el("p", "kicker", "Next step · 30 minutes"),
      el("h3", null, "Book a thirty-minute working session."),
      el("p", null, "Bring one workflow. Leave with a clear plan."),
    );
    const open = el("button", "primary", "Open calendar in chat");
    open.type = "button";
    open.addEventListener("click", () => this.openBooking());
    const tab = el("a", "texty", "Open in a new tab");
    const href = buildCalUrl(this.calInput(false));
    tab.href = href || "mailto:houdini@abra-ca-dabra.app";
    tab.target = "_blank";
    tab.rel = "noopener noreferrer";
    card.append(open, tab);
    this.stream.append(card);
  }

  showContactCard() {
    if (this.stream.querySelector("[data-contact-card]")) return;
    const card = el("div", "card");
    card.dataset.contactCard = "true";
    card.append(el("p", "kicker", "Follow up"), el("h3", null, "Leave your name and email."));
    const form = document.createElement("form");
    form.innerHTML = `
      <label class="field">Name <input name="name" autocomplete="name" required maxlength="120"></label>
      <label class="field">Email <input name="email" type="email" autocomplete="email" required maxlength="200"></label>
      <label class="field">What you need <input name="goal" maxlength="1000"></label>
      <label class="check"><input name="consent" type="checkbox"> A person may write back about this note.</label>
      <p class="error" hidden></p>
      <button class="primary" type="submit">Send to the studio</button>`;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.submitContact({
        name: form.elements.name.value,
        email: form.elements.email.value,
        goal: form.elements.goal.value,
        windows: "",
        consent: form.elements.consent.checked,
      }, form.querySelector(".error"), card);
    });
    card.append(form);
    this.stream.append(card);
  }

  async submitContact(fields, errorNode, card) {
    const problem = contactProblems({ ...fields, consent: fields.consent === true });
    if (problem) {
      errorNode.hidden = false;
      errorNode.textContent = problem.message;
      return;
    }
    errorNode.hidden = true;
    const response = await fetch("/api/chat/contact", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fields),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      errorNode.hidden = false;
      errorNode.textContent = payload.error || "We could not save that.";
      return;
    }
    this.contact = fields;
    if (card) card.querySelector("form")?.remove();
    const done = el("div", "card");
    done.append(
      el("p", "kicker", "Received"),
      el("h3", null, "Got it."),
      el("p", null, "A person reads this before anyone writes back."),
    );
    const book = el("button", "primary", "Skip the wait. Pick a 30-min slot now");
    book.type = "button";
    book.addEventListener("click", () => this.openBooking());
    done.append(book);
    this.stream.append(done);
    if (!this.sheet.hidden) this.closeBooking();
  }

  async postEvent(body) {
    if (!this.sessionId) return;
    await fetch("/api/chat/events", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async send(text, { retry = false } = {}) {
    const question = String(text || "").trim();
    if (!question || !this.ready || this.busy) return;
    this.busy = true;
    this.clearFollowUps();
    if (!retry) {
      this.input.value = "";
      this.input.style.height = "auto";
      this.messages.push({ role: "user", text: question });
      this.addBubble("user", question);
    }
    const pending = this.addBubble("assistant", "");
    const stopThinking = this.showThinking(pending, question);
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), TYPED_TIMEOUT_MS);
    let answer = "";
    let failed = null;
    let retryable = false;
    let followUps = [];
    const cards = [];
    try {
      const response = await fetch("/api/chat/message", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ text: question, page: location.pathname, title: document.title }),
        signal: abort.signal,
      });
      if (!response.ok || !response.body) {
        failed = response.status === 429 ? ((await response.json().catch(() => ({}))).error || "This chat is full. Email houdini@abra-ca-dabra.app.") : RETRY_TEXT;
      } else {
        await readSse(response, (event, data) => {
          if (event === "token") {
            if (!answer) {
              stopThinking();
              this.markTyped("first");
            }
            answer += data.text || "";
            renderLinked(pending, answer);
            this.stream.scrollTop = this.stream.scrollHeight;
          }
          if (event === "final") {
            if (!answer) stopThinking();
            answer = data.text || answer;
            renderLinked(pending, answer);
            this.stream.scrollTop = this.stream.scrollHeight;
          }
          if (event === "error") {
            failed = data.text || RETRY_TEXT;
            if (data.retry === true) retryable = true;
          }
          if (event === "ui_action") this.action(data.action);
          if (event === "suggestions" && Array.isArray(data.items)) followUps = data.items;
          if (event === "card" && data && typeof data === "object") cards.push(data);
        });
        if (!answer && !failed) failed = RETRY_TEXT;
      }
    } catch {
      failed = RETRY_TEXT;
    } finally {
      clearTimeout(timeout);
      stopThinking();
      pending.classList.remove("streaming");
      this.busy = false;
    }
    if (failed && !answer) {
      this.showRetry(pending, failed, question, retryable || isRetryText(failed));
      return;
    }
    this.status.textContent = "Answer ready.";
    this.messages.push({ role: "assistant", text: answer });
    for (const card of cards) this.showCard(card);
    this.showFollowUps(followUps);
  }

  /** Inline cards from the worker: the mini-audit offer, the recap, a case-study film. */
  showCard(card) {
    if (!card || typeof card !== "object") return;
    if (card.kind === "audit_offer") this.auditOfferCard(card);
    else if (card.kind === "recap") this.recapCard(card);
    else if (card.kind === "clip") this.clipCard(card);
    this.stream.scrollTop = this.stream.scrollHeight;
  }

  /** Receptionist demo on a voice call: a visible label while it runs. */
  setDemo(on) {
    if (this.demoBadge) this.demoBadge.hidden = !on;
    if (on) this.status.textContent = "Demo started: role-play receptionist.";
  }

  /** Mini-audit offer: nothing is scanned until the visitor taps Run the scan. */
  auditOfferCard({ host }) {
    const name = String(host || "").slice(0, 253);
    if (!name || this.stream.querySelector(`[data-audit-host="${CSS.escape(name)}"]`)) return;
    const card = el("div", "card");
    card.dataset.auditHost = name;
    card.append(
      el("p", "kicker", "Mini-audit · Schema scanner"),
      el("h3", null, `Scan ${name}?`),
      el("p", null, "We check how easily AI search can read the site: structured data, llms.txt, robots.txt and the sitemap. It reads public pages only and takes a minute or two."),
    );
    const run = el("button", "primary", "Run the scan");
    run.type = "button";
    const live = el("p", "fine");
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    run.addEventListener("click", () => {
      run.disabled = true;
      void this.runAudit(card, name, live, run);
    });
    card.append(run, live);
    this.stream.append(card);
  }

  async auditCall(body) {
    try {
      const response = await fetch("/api/chat/audit", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, data: await response.json().catch(() => ({})) };
    } catch {
      return { status: 0, data: { error: "The scanner is not answering right now. You can run it on its own page." } };
    }
  }

  async runAudit(card, host, live, run) {
    if (!this.sessionId) await this.ensureSession();
    live.textContent = `Scanning ${host}…`;
    const started = await this.auditCall({ op: "start", host });
    if (started.data.result) return this.auditResult(card, started.data.result, run, live);
    if (!started.data.token) return this.auditProblem(card, live, run, started.data.error, started.data.fallbackUrl);
    const wait = this.auditPollMs ?? 5000;
    for (let i = 0; i < 60; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, wait));
      const { data } = await this.auditCall({ op: "status", token: started.data.token });
      if (data.status === "complete" && data.result) return this.auditResult(card, data.result, run, live);
      if (data.status === "queued" || data.status === "running") {
        const pages = Number(data.progress?.pagesScanned || data.progress?.pages || 0);
        live.textContent = pages ? `Scanning ${host}… ${pages} pages read.` : `Scanning ${host}…`;
        continue;
      }
      return this.auditProblem(card, live, run, data.error, data.reportUrl);
    }
    return this.auditProblem(card, live, run, "The scan is taking longer than usual.", null);
  }

  auditProblem(card, live, run, error, href) {
    live.textContent = "";
    run.remove();
    card.append(el("p", "error", error || "The scan did not finish."));
    const link = safeLink(href, "Open the scanner") || safeLink("https://schema.abra-ca-dabra.app/", "Open the scanner");
    card.append(link);
  }

  auditResult(card, result, run, live) {
    run.remove();
    live.textContent = "Scan finished.";
    const score = Number.isFinite(result.score) ? `${result.domain}: ${result.score} out of 100 for AI search visibility.` : `${result.domain}: scan finished.`;
    card.append(el("p", "audit-score", score));
    const fixes = (result.fixes || []).slice(0, 2);
    if (fixes.length) {
      card.append(el("p", null, fixes.length === 1 ? "The fix to start with:" : "Two fixes to start with:"));
      const list = el("ol");
      for (const fix of fixes) list.append(el("li", null, String(fix.text || "").slice(0, 240)));
      card.append(list);
    } else card.append(el("p", null, "Nothing big to fix."));
    const links = el("div", "card-links");
    const report = safeLink(result.reportUrl, "Open the full report");
    if (report) links.append(report);
    const book = el("button", "primary secondary", "Book a session about this");
    book.type = "button";
    const notes = `Mini-audit in the chat: ${score} ${fixes.map((f) => f.text).join(" ")}`.slice(0, 500);
    book.addEventListener("click", () => this.openBooking({ notes }));
    card.append(links, book);
    this.messages.push({ role: "assistant", text: score });
  }

  /** "Here's what I heard" with a suggested first build. The booking button only opens the calendar. */
  recapCard(card) {
    this.stream.querySelector("[data-recap-card]")?.remove();
    const view = el("div", "card");
    view.dataset.recapCard = "true";
    view.append(el("p", "kicker", "Recap"), el("h3", null, "Here's what I heard"));
    const list = el("ul");
    for (const line of (card.heard || []).slice(0, 5)) list.append(el("li", null, String(line).slice(0, 300)));
    const build = el("p", null, "");
    build.append(el("strong", null, "Suggested first build: "), document.createTextNode(String(card.build || "").slice(0, 300)));
    view.append(list, build);
    if (/^\/[a-z0-9/-]*$/i.test(card.buildPath || "")) {
      const more = el("a", "texty", "Read about it");
      more.href = card.buildPath;
      view.append(more);
    }
    const book = el("button", "primary", "Book with this recap");
    book.type = "button";
    book.addEventListener("click", () => this.openBooking({ notes: String(card.notes || "").slice(0, 500) }));
    view.append(book, el("p", "fine", "Not quite right? Tell me in the chat."));
    this.stream.append(view);
  }

  /** A case-study film: a lazy thumbnail; the video loads only when tapped. Silent screen captures. */
  clipCard(card) {
    const path = (value) => (/^\/[a-z0-9/._-]*$/i.test(String(value || "")) ? String(value) : "");
    const src = path(card.src);
    const poster = path(card.poster);
    if (!src || !poster) return;
    const title = String(card.title || "Film").slice(0, 120);
    const view = el("div", "card clip");
    view.dataset.clip = String(card.id || "");
    const figure = document.createElement("figure");
    const play = el("button", "clip-play");
    play.type = "button";
    play.setAttribute("aria-label", `Play the film: ${title}. Silent screen capture.`);
    const img = document.createElement("img");
    img.src = poster;
    img.alt = `Still from the film: ${title}`;
    img.loading = "lazy";
    img.decoding = "async";
    img.width = 640;
    img.height = 360;
    play.append(img);
    play.addEventListener("click", () => {
      const video = document.createElement("video");
      video.src = src;
      video.poster = poster;
      video.controls = true;
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.setAttribute("aria-label", `${title}. ${String(card.caption || "")} Silent screen capture.`);
      play.replaceWith(video);
      video.focus?.();
      if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) video.play?.().catch(() => {});
    });
    const caption = document.createElement("figcaption");
    caption.append(el("strong", null, title), document.createTextNode(` ${String(card.caption || "").slice(0, 200)} Silent screen capture.`));
    figure.append(play, caption);
    const links = el("div", "card-links");
    const page = path(card.page);
    if (page) {
      const a = el("a", null, "Read the case study");
      a.href = page;
      links.append(a);
    }
    const films = el("a", null, "All films");
    films.href = path(card.films) || "/films.html";
    links.append(films);
    view.append(el("p", "kicker", "Film"), figure, links);
    this.stream.append(view);
  }

  /** Up to two follow-up questions under the answer (from the worker's "suggestions" event). Tapping one asks it. */
  showFollowUps(items) {
    const list = (items || []).map((item) => String(item || "").trim().slice(0, 80)).filter(Boolean).slice(0, 2);
    if (!list.length) return;
    const chips = el("div", "chips follow");
    chips.dataset.follow = "true";
    for (const label of list) {
      const button = el("button", "chip", label);
      button.type = "button";
      button.addEventListener("click", () => this.send(label));
      chips.append(button);
    }
    this.stream.append(chips);
    this.stream.scrollTop = this.stream.scrollHeight;
  }

  clearFollowUps() {
    for (const node of this.stream?.querySelectorAll?.('[data-follow="true"]') || []) node.remove();
  }

  /** Animated dots plus a status line that changes if the answer takes longer. Returns a stop function. */
  showThinking(bubble, question) {
    bubble.classList.add("thinking");
    bubble.textContent = "";
    const dots = el("span", "thinking-dots");
    dots.setAttribute("aria-hidden", "true");
    dots.append(el("i"), el("i"), el("i"));
    const label = el("span", "thinking-text", thinkingLabel(question, 0));
    bubble.append(dots, label);
    this.status.textContent = label.textContent;
    this.markTyped("sent");
    const timers = THINKING_STEPS_MS.slice(1).map((ms, index) => setTimeout(() => {
      label.textContent = thinkingLabel(question, index + 1);
      this.status.textContent = label.textContent;
    }, ms));
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      bubble.classList.remove("thinking");
      bubble.textContent = "";
    };
  }

  showRetry(bubble, text, question, retryable = isRetryText(text)) {
    bubble.textContent = "";
    bubble.classList.add("failed");
    bubble.append(document.createTextNode(text));
    if (retryable) {
      const again = el("button", "retry", "Try again");
      again.type = "button";
      again.addEventListener("click", () => {
        bubble.remove();
        this.send(question, { retry: true });
      });
      bubble.append(again);
    }
    this.stream.scrollTop = this.stream.scrollHeight;
    this.status.textContent = "The answer did not come through.";
  }

  markTyped(name) {
    this.typedTimings = { ...(name === "sent" ? {} : this.typedTimings || {}), [name]: performance.now() };
  }

  action(name) {
    if (name === "open_booking") {
      // A clear ask to book: open the calendar inside the chat (also during a voice call).
      this.bookingOffered = true;
      this.showBookingCard();
      void this.openBooking();
    } else if (name === "offer_booking") {
      this.bookingOffered = true;
      this.showBookingCard();
    } else if (name === "offer_readiness_check") this.showReadiness();
    else if (name === "request_contact") this.showContactCard();
  }

  async completeBooking(booking) {
    const when = formatWhen(booking.startsAt);
    const card = el("div", "card booked");
    card.append(
      el("p", "kicker", "Booked"),
      el("h3", null, `Booked for ${when}.`),
      el("p", null, "A calendar invite is on its way."),
    );
    this.stream.append(card);
    this.closeBooking();
    // On a voice call the assistant says the time out loud.
    if (this.call?.ws?.readyState === 1) this.call.ws.send(JSON.stringify({ type: "booked", when }));
    await this.postEvent({
      kind: "booking_completed",
      externalId: booking.externalId,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      email: booking.email,
      name: booking.name,
    });
  }
}

if (typeof document !== "undefined" && typeof customElements !== "undefined") {
  const boot = () => {
    if (!customElements.get("abra-chat")) customElements.define("abra-chat", AbraChat);
    if (!document.querySelector("abra-chat")) document.body.append(document.createElement("abra-chat"));
  };
  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot);
}
