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

test("voice picks MP4 on Safari and iOS, WebM elsewhere, and shows the audio note", async () => {
  const { recorderMime, formatClock, voiceSupported } = await import("../assets/chat-widget.js");
  const both = (type) => type.startsWith("audio/mp4") || type.startsWith("audio/webm");
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1";
  const iphoneChrome = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1";
  const macSafari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15";
  const chrome = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
  assert.equal(recorderMime(both, iphone), "audio/mp4");
  assert.equal(recorderMime(both, iphoneChrome), "audio/mp4");
  assert.equal(recorderMime(both, macSafari), "audio/mp4");
  assert.equal(recorderMime(both, chrome), "audio/webm;codecs=opus");
  assert.equal(recorderMime((type) => type === "audio/mp4", chrome), "audio/mp4");
  assert.equal(recorderMime(() => false, chrome), "");
  assert.equal(formatClock(12_400), "0:12");
  assert.equal(voiceSupported({}), false);
  assert.equal(voiceSupported({ MediaRecorder() {}, navigator: { mediaDevices: { getUserMedia() {} } }, isSecureContext: true }), true);
  assert.match(widgetCss, /\.mic\.recording/);
});

test("streaming playback is used when the browser can play MP3", async () => {
  const { canStreamMp3 } = await import("../assets/chat-widget.js");
  assert.equal(canStreamMp3({ canPlayType: () => "maybe" }), true);
  assert.equal(canStreamMp3({ canPlayType: () => "" }), false);
  assert.equal(canStreamMp3(null), false);
});
