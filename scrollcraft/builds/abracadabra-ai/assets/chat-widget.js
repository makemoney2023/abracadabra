export const READINESS_FALLBACK = "https://check.abra-ca-dabra.app/check";
export const VOICE_MAX_MS = 30_000;
export const VOICE_MAX_BYTES = 600 * 1024;
// A tiny silent WAV. Playing it inside the first mic tap unlocks audio on iOS Safari.
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
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
.chip:hover, .ghost:hover, .icon:hover { border-color: rgba(245, 240, 232, 0.4); }
.bubble { max-width: 92%; padding: 10px 12px; border-radius: 8px; font-size: 15px; line-height: 1.55; white-space: pre-wrap; }
.bubble.assistant { background: #11110F; border: 1px solid rgba(245, 240, 232, 0.12); }
.bubble.user { align-self: flex-end; background: #17160F; border-left: 2px solid #FF4B24; }
.bubble.streaming::after {
  content: ""; display: inline-block; width: 2px; height: 14px; margin-left: 3px;
  background: #FF4B24; vertical-align: text-bottom;
  animation: blink 1s steps(1) infinite;
}
@keyframes blink { 50% { opacity: 0; } }
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
.card.booked { border-color: rgba(198, 255, 179, 0.45); }
.card.booked .kicker { color: #C6FFB3; }
.mic {
  flex: none; width: 40px; min-height: 40px; border-radius: 6px;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; color: #F5F0E8; border: 1px solid rgba(245, 240, 232, 0.24);
}
.mic[hidden] { display: none; }
.mic:hover { border-color: rgba(245, 240, 232, 0.4); }
.mic.recording { background: #FF4B24; color: #170804; border-color: #FF4B24; animation: ring 1.4s ease-out infinite; }
.mic.busy { opacity: 0.6; cursor: progress; }
.mic.speaking { border-color: #C6FFB3; color: #C6FFB3; }
@keyframes ring { 0% { box-shadow: 0 0 0 0 rgba(255, 75, 36, 0.45); } 100% { box-shadow: 0 0 0 10px rgba(255, 75, 36, 0); } }
.voice-note { margin: 0; padding: 0 14px 4px; color: #AAA49A; font-size: 12px; background: #11110F; }
.voice-note[hidden] { display: none; }
.voice-note strong { color: #F5F0E8; font-weight: 500; }
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
.sheet iframe { width: 100%; height: 100%; min-height: 520px; border: 0; background: #070706; border-radius: 8px; }
.skeleton { height: 280px; border-radius: 8px; background: linear-gradient(90deg, #11110F, #17160F, #11110F); background-size: 200% 100%; animation: pulse 1.2s ease infinite; }
@keyframes pulse { 50% { background-position: 100% 0; } }
.field { display: grid; gap: 6px; font-size: 13px; }
.check { display: flex; gap: 8px; align-items: flex-start; color: #F5F0E8; font-size: 14px; }
.error { color: #FF4B24; }
@media (max-width: 720px) {
  .launcher { right: 16px; bottom: 16px; }
  .panel, .panel.expanded {
    right: 0; bottom: 0; width: 100vw; border-radius: 16px 16px 0 0;
    height: min(78dvh, 100%);
  }
  .panel.expanded { height: 92dvh; }
}
@media (prefers-reduced-motion: reduce) {
  .panel, .bubble.streaming::after, .skeleton, .mic.recording { transition: none; animation: none; }
}
`;

/** Picks a MediaRecorder type. Safari and every iOS browser record MP4 (AAC); others prefer WebM/Opus. */
export function recorderMime(isTypeSupported, userAgent = "") {
  const supported = typeof isTypeSupported === "function" ? isTypeSupported : () => false;
  const ua = String(userAgent);
  const webkit = /iPad|iPhone|iPod/.test(ua) || (/Safari\//.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|Android/.test(ua));
  const order = webkit
    ? ["audio/mp4", "audio/mp4;codecs=mp4a.40.2", "audio/webm;codecs=opus", "audio/webm"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const type of order) {
    try {
      if (supported(type)) return type;
    } catch {
      // Keep looking.
    }
  }
  return "";
}

export function voiceSupported(win = typeof window === "undefined" ? undefined : window) {
  return Boolean(win?.MediaRecorder && win?.navigator?.mediaDevices?.getUserMedia && win?.isSecureContext !== false);
}

export function canStreamMp3(player) {
  try {
    return Boolean(player?.canPlayType?.("audio/mpeg"));
  } catch {
    return false;
  }
}

export function formatClock(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `0:${String(seconds).padStart(2, "0")}`;
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
    .filter((message) => message.role === "user")
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
      greeting: "Ask a plain question. A person reviews anything we follow up on.",
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
      <form class="composer">
        <textarea rows="1" aria-label="Message" placeholder="Ask about the work" maxlength="2000"></textarea>
        <button class="mic" type="button" data-mic aria-label="Speak your question" aria-pressed="false" hidden>${MIC_SVG}</button>
        <button class="send" type="submit">Send</button>
      </form>
      <p class="voice-note" data-voice-note hidden><strong>Tap the mic to talk, tap again to send.</strong> Audio isn't stored. Only the words are kept, like a typed chat.</p>
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
    this.mic.addEventListener("click", () => this.toggleVoice());
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
    this.stopTracks();
    clearInterval(this.voiceTimer);
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
    this.voiceState = "idle";
  }

  setVoiceState(state, label) {
    this.voiceState = state;
    this.mic.classList.toggle("recording", state === "recording");
    this.mic.classList.toggle("busy", state === "thinking");
    this.mic.classList.toggle("speaking", state === "speaking");
    this.mic.setAttribute("aria-pressed", state === "recording" ? "true" : "false");
    this.mic.innerHTML = state === "recording" || state === "speaking" ? STOP_SVG : MIC_SVG;
    const names = {
      idle: "Speak your question",
      recording: "Stop and send",
      thinking: "Working on it",
      speaking: "Stop the spoken answer",
    };
    this.mic.setAttribute("aria-label", names[state] || names.idle);
    this.mic.title = label || names[state] || names.idle;
    this.input.placeholder = state === "recording" ? `Listening ${label || ""}`.trim() : "Ask about the work";
  }

  /** Runs inside the tap, so iOS lets the same element play the answer later. */
  unlockAudio() {
    if (!this.player) {
      this.player = new Audio();
      this.player.preload = "auto";
      this.player.setAttribute("playsinline", "");
      this.player.addEventListener("ended", () => this.finishSpeaking());
      this.player.addEventListener("error", () => this.finishSpeaking());
    }
    if (this.audioUnlocked) return;
    this.audioUnlocked = true;
    try {
      this.player.src = SILENT_WAV;
      const played = this.player.play();
      if (played?.catch) played.catch(() => {});
    } catch {
      // Playback stays locked; the text answer still shows.
    }
  }

  stopSpeaking() {
    if (!this.player) return;
    this.player.pause();
    // Drop the stream so the server connection closes.
    this.player.removeAttribute("src");
    this.player.load();
    this.finishSpeaking();
  }

  finishSpeaking() {
    if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
    this.audioUrl = "";
    if (this.voiceState === "speaking") this.setVoiceState("idle");
  }

  stopTracks() {
    for (const track of this.micStream?.getTracks?.() || []) track.stop();
    this.micStream = null;
  }

  async toggleVoice() {
    if (this.voiceState === "thinking") return;
    if (this.voiceState === "speaking") {
      this.stopSpeaking();
      return;
    }
    if (this.voiceState === "recording") {
      this.recorder?.stop();
      return;
    }
    this.unlockAudio();
    await this.startRecording();
  }

  async startRecording() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
    } catch {
      this.note("The mic is blocked or missing. You can type your question instead.");
      return;
    }
    const mimeType = recorderMime((type) => MediaRecorder.isTypeSupported(type), navigator.userAgent);
    let recorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 });
    } catch {
      for (const track of stream.getTracks()) track.stop();
      this.note("This browser cannot record here. You can type your question instead.");
      return;
    }
    this.micStream = stream;
    this.recorder = recorder;
    const chunks = [];
    const started = Date.now();
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data?.size) chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      clearInterval(this.voiceTimer);
      clearTimeout(this.voiceLimit);
      this.stopTracks();
      const type = recorder.mimeType || mimeType || chunks[0]?.type || "audio/webm";
      const blob = new Blob(chunks, { type });
      void this.sendVoice(blob, Date.now() - started);
    }, { once: true });
    recorder.start(250);
    this.setVoiceState("recording", formatClock(0));
    this.voiceTimer = setInterval(() => this.setVoiceState("recording", formatClock(Date.now() - started)), 500);
    this.voiceLimit = setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, VOICE_MAX_MS);
  }

  async sendVoice(blob, elapsedMs) {
    if (elapsedMs < 600 || blob.size < 800) {
      this.setVoiceState("idle");
      this.note("That was too short. Tap the mic, talk, then tap again.");
      return;
    }
    if (blob.size > VOICE_MAX_BYTES) {
      this.setVoiceState("idle");
      this.note("That clip is too long. Keep it under 30 seconds.");
      return;
    }
    this.setVoiceState("thinking");
    const mine = this.addBubble("user", "…");
    mine.classList.add("streaming");
    let payload = {};
    try {
      const response = await fetch("/api/chat/voice", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": blob.type || "audio/webm" },
        body: blob,
      });
      payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        mine.remove();
        this.note(payload.error || "I could not hear that. You can type instead.");
        this.setVoiceState("idle");
        return;
      }
    } catch {
      mine.remove();
      this.note("The chat is quiet right now. Email houdini@abra-ca-dabra.app.");
      this.setVoiceState("idle");
      return;
    }
    mine.classList.remove("streaming");
    if (payload.transcript) {
      mine.textContent = payload.transcript;
      this.messages.push({ role: "user", text: payload.transcript });
    } else mine.remove();
    if (payload.reply) {
      this.addBubble("assistant", payload.reply);
      this.voiceTimings = {};
      this.markVoice("reply");
      this.messages.push({ role: "assistant", text: payload.reply });
    }
    if (payload.action) this.action(payload.action);
    if (payload.replyId) await this.speak(payload.replyId);
    else this.setVoiceState("idle");
  }

  /**
   * Streams the answer: the <audio> element reads GET /api/chat/speak as the MP3 arrives, so sound
   * starts with the first bytes. The element was unlocked inside the first mic tap, which is what
   * iOS Safari needs before a later play() without a tap. If the browser cannot stream MP3, or the
   * stream errors before it plays, fall back to downloading the whole clip (same play, not charged again).
   */
  async speak(replyId) {
    this.unlockAudio();
    this.lastSpokenId = replyId;
    const url = `/api/chat/speak?id=${encodeURIComponent(replyId)}&p=1`;
    if (canStreamMp3(this.player)) {
      const result = await this.playStream(url);
      if (result !== "failed") return;
    }
    await this.playBuffered(replyId, 1);
  }

  playStream(url) {
    return new Promise((resolve) => {
      const player = this.player;
      let settled = false;
      const done = (result) => {
        if (settled) return;
        settled = true;
        player.removeEventListener("playing", onPlaying);
        player.removeEventListener("error", onError);
        resolve(result);
      };
      const onPlaying = () => {
        this.markVoice("playing");
        done("playing");
      };
      const onError = () => done("failed");
      player.addEventListener("playing", onPlaying);
      player.addEventListener("error", onError);
      if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
      this.audioUrl = "";
      this.voiceMode = "stream";
      player.src = url;
      this.setVoiceState("speaking");
      let played;
      try {
        played = player.play();
      } catch {
        done("failed");
        return;
      }
      if (played?.catch) {
        played.catch((error) => {
          // Autoplay still locked: the text answer is on screen, do not fetch again.
          if (error?.name === "NotAllowedError") {
            this.setVoiceState("idle");
            done("blocked");
          } else done("failed");
        });
      }
    });
  }

  async playBuffered(replyId, play) {
    try {
      const response = await fetch("/api/chat/speak", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ replyId, play }),
      });
      if (!response.ok) {
        this.setVoiceState("idle");
        return;
      }
      const audio = await response.blob();
      if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
      this.audioUrl = URL.createObjectURL(audio);
      this.voiceMode = "buffered";
      this.player.addEventListener("playing", () => this.markVoice("playing"), { once: true });
      this.player.src = this.audioUrl;
      this.setVoiceState("speaking");
      await this.player.play();
    } catch {
      this.finishSpeaking();
      this.setVoiceState("idle");
    }
  }

  markVoice(name) {
    this.voiceTimings = { ...(this.voiceTimings || {}), [name]: performance.now() };
    try {
      performance.mark(`abra-voice-${name}`);
    } catch {
      // Timing marks are optional.
    }
  }

  turnstile() {
    return new Promise((resolve) => {
      const box = el("div", "card");
      box.append(el("p", "kicker", "Check"), el("p", null, "Confirm you are a person, then the chat opens."));
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
            resolve();
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
    this.addBubble("assistant", this.config.greeting || "Ask a plain question. A person reviews anything we follow up on.");
    const chips = el("div", "chips");
    const specs = [
      ["Book a 30-min working session", () => this.openBooking()],
      ["Take the 3-min AI Readiness Check", () => this.showReadiness()],
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
    const bubble = el("div", `bubble ${role}`, text);
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
      notes: bookingNotes(this.messages),
      sessionId: this.sessionId,
      domain: companyDomain(this.contact?.email),
      ...this.params(),
    };
  }

  async openBooking() {
    if (!this.isOpen) await this.openPanel();
    this.savedScroll = this.stream.scrollTop;
    this.panel.classList.add("expanded");
    this.sheet.hidden = false;
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
    card.append(
      el("p", "kicker", "Three minutes"),
      el("h3", null, "Take the AI Readiness Check."),
      el("p", null, "It scores the work, then you leave with a plan."),
    );
    const link = el("a", "primary", "Start the check");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.addEventListener("click", () => {
      void this.postEvent({ kind: "readiness_check_clicked" });
    });
    card.append(link);
    this.stream.append(card);
    this.stream.scrollTop = this.stream.scrollHeight;
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

  async send(text) {
    const question = String(text || "").trim();
    if (!question || !this.ready) return;
    this.input.value = "";
    this.input.style.height = "auto";
    this.messages.push({ role: "user", text: question });
    this.addBubble("user", question);
    const pending = this.addBubble("assistant", "");
    pending.classList.add("streaming");
    try {
      const response = await fetch("/api/chat/message", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ text: question, page: location.pathname }),
      });
      if (!response.ok || !response.body) {
        pending.classList.remove("streaming");
        pending.textContent = "The chat is quiet right now. Email houdini@abra-ca-dabra.app.";
        return;
      }
      let answer = "";
      await readSse(response, (event, data) => {
        if (event === "token") {
          answer += data.text || "";
          pending.textContent = answer;
        }
        if (event === "ui_action") this.action(data.action);
        if (event === "done") pending.classList.remove("streaming");
      });
      pending.classList.remove("streaming");
      this.messages.push({ role: "assistant", text: answer });
    } catch {
      pending.classList.remove("streaming");
      pending.textContent = "The chat is quiet right now. Email houdini@abra-ca-dabra.app.";
    }
  }

  action(name) {
    if (name === "offer_booking") {
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
