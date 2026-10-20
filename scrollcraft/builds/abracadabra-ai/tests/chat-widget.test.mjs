import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCalUrl,
  contactProblems,
  launcherShouldHide,
  onCalMessage,
  readinessUrl,
  widgetCss,
} from "../assets/chat-widget.js";

test("booking url carries the chat session and drops out when Cal.com is unset", () => {
  assert.equal(buildCalUrl({ calLink: "" }), null);
  const url = new URL(buildCalUrl({
    calLink: "abracadabra/working-session",
    name: "Ada North",
    email: "ada@northwind.example",
    notes: "Quotes take all Friday.",
    sessionId: "6f1e8c0a-1b2c-4d3e-8f90-aabbccddeeff",
    domain: "northwind.example",
    utmSource: "google",
    utmCampaign: "spring",
  }));
  assert.equal(url.origin + url.pathname, "https://cal.com/abracadabra/working-session");
  assert.equal(url.searchParams.get("theme"), "dark");
  assert.equal(url.searchParams.get("embed"), "true");
  assert.equal(url.searchParams.get("name"), "Ada North");
  assert.equal(url.searchParams.get("email"), "ada@northwind.example");
  assert.equal(url.searchParams.get("metadata[source]"), "abracadabra-chat");
  assert.equal(url.searchParams.get("metadata[chat_session_id]"), "6f1e8c0a-1b2c-4d3e-8f90-aabbccddeeff");
  assert.equal(url.searchParams.get("metadata[domain]"), "northwind.example");
  assert.equal(url.searchParams.get("metadata[utm_source]"), "google");
  assert.equal(url.searchParams.get("metadata[utm_campaign]"), "spring");
  const tab = new URL(buildCalUrl({ calLink: "https://cal.com/abracadabra/working-session", embed: false, sessionId: "s" }));
  assert.equal(tab.searchParams.get("embed"), null);
});

test("launcher hides for the intake lock and the open menu", () => {
  assert.equal(launcherShouldHide({ bodyClass: "home" }), false);
  assert.equal(launcherShouldHide({ bodyClass: "home intake-lock" }), true);
  assert.equal(launcherShouldHide({ menuOpen: true }), true);
});

test("readiness link and contact consent stay explicit", () => {
  const url = new URL(readinessUrl("https://check.abra-ca-dabra.app/check", "sess-1"));
  assert.equal(url.searchParams.get("utm_source"), "chat");
  assert.equal(url.searchParams.get("chat_session_id"), "sess-1");
  assert.equal(contactProblems({ name: "Ada", email: "ada@northwind.example", consent: false }).field, "consent");
  assert.equal(contactProblems({ name: "Ada", email: "ada@northwind.example", consent: true }), null);
});

test("Cal.com success messages become a booking and other origins are ignored", () => {
  const booking = {
    externalId: "bk_1",
    startsAt: "2026-11-02T15:00:00.000Z",
    endsAt: "2026-11-02T15:30:00.000Z",
    email: "ada@northwind.example",
    name: "Ada",
  };
  let seen = null;
  assert.equal(onCalMessage({
    origin: "https://cal.com",
    data: { fullType: "bookingSuccessfulV2", data: { booking: { uid: "bk_1", startTime: booking.startsAt, endTime: booking.endsAt, attendees: [{ email: booking.email, name: booking.name }] } } },
  }, { onBooked: (value) => { seen = value; } }), true);
  assert.deepEqual(seen, booking);
  assert.equal(onCalMessage({ origin: "https://evil.example", data: { type: "bookingSuccessful", uid: "bk_2", startTime: booking.startsAt } }, { onBooked() {} }), false);
});

test("the studio skin uses the site tokens", () => {
  for (const token of ["#070706", "#11110F", "#17160F", "#F5F0E8", "#AAA49A", "#FF4B24", "#170804", "#8DEBF2", "#C6FFB3"]) {
    assert.match(widgetCss, new RegExp(token));
  }
  assert.match(widgetCss, /Inter Tight/);
  assert.match(widgetCss, /IBM Plex Sans/);
  assert.match(widgetCss, /220ms cubic-bezier/);
  assert.match(widgetCss, /92dvh/);
});

test("voice helpers: support check, socket URL, PCM decode, clock", async () => {
  const { formatClock, voiceSupported, realtimeUrl, pcmToFloat, MIC_WORKLET } = await import("../assets/chat-widget.js");
  const full = {
    AudioContext() {}, AudioWorkletNode() {}, WebSocket() {},
    navigator: { mediaDevices: { getUserMedia() {} } }, isSecureContext: true,
  };
  assert.equal(voiceSupported({}), false);
  assert.equal(voiceSupported(full), true);
  assert.equal(voiceSupported({ ...full, AudioWorkletNode: undefined }), false);
  assert.equal(voiceSupported({ ...full, isSecureContext: false }), false);
  assert.equal(voiceSupported({ ...full, AudioContext: undefined, webkitAudioContext() {} }), true);
  assert.equal(realtimeUrl({ protocol: "https:", host: "abra-ca-dabra.app" }), "wss://abra-ca-dabra.app/api/chat/realtime");
  assert.equal(realtimeUrl({ protocol: "http:", host: "127.0.0.1:4500" }), "ws://127.0.0.1:4500/api/chat/realtime");
  const pcm = new Int16Array([0, 16384, -32768, 32767]);
  const out = pcmToFloat(pcm.buffer);
  assert.deepEqual([...out].map((v) => Math.round(v * 1000) / 1000), [0, 0.5, -1, 1]);
  assert.equal(pcmToFloat(new Uint8Array(3).buffer).length, 1);
  assert.equal(formatClock(12_400), "0:12");
  assert.equal(formatClock(185_000), "3:05");
  assert.match(MIC_WORKLET, /registerProcessor\("abra-mic"/);
  assert.match(MIC_WORKLET, /sampleRate \/ 16000/);
});

