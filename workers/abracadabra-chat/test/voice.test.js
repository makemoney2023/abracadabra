import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest } from "../src/http.js";
import { looksLikeEcho, sentences, speakable, TTS_CHAR_CAP, ttsSpeaker, voiceEnabled } from "../src/voice.js";

const NOW = 1_700_000_000_000;
const AI = { run: async () => ({}) };
const VOICE_ENV = { VOICE_ENABLED: "true", AI_GATEWAY_TOKEN: "test-token", CF_ACCOUNT_ID: "acct", AI };

class FakeSocket {
  constructor() {
    this.sent = [];
    this.listeners = {};
    this.closed = false;
  }
  accept() {}
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  emit(type, data) {
    for (const fn of this.listeners[type] || []) fn({ data });
  }
  send(data) {
    if (this.closed) throw new Error("closed");
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  json() {
    return this.sent.filter((item) => typeof item === "string").map((item) => JSON.parse(item));
  }
  binary() {
    return this.sent.filter((item) => typeof item !== "string");
  }
}

const flush = async (rounds = 20) => {
  for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

function pcmStream(chunks, { hold } = {}) {
  let cancelled = false;
  const stream = new ReadableStream({
    async start(controller) {
      for (const [index, chunk] of chunks.entries()) {
        if (hold && index === 1) await hold;
        if (cancelled) return;
        controller.enqueue(new Uint8Array(chunk));
      }
      controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  stream.wasCancelled = () => cancelled;
  return stream;
}

function harness({ env = VOICE_ENV, reply = "We build software around the work you already do. Tell me the job that takes the most time.", tts } = {}) {
  const calls = [];
  const clock = { now: NOW };
  const h = {
    env: { ...env },
    calls,
    clock,
    flux: new FakeSocket(),
    sockets: [],
    deps: {
      now: () => clock.now,
      tickMs: 0,
      limits: { messages: new Map(), sessions: new Map() },
      rooms: new Map(),
      async sendHandoff() {},
      fetchImpl: async (url, init = {}) => {
        const body = init.body ? JSON.parse(init.body) : null;
        calls.push({ url: String(url), headers: init.headers, body });
        if (String(url).includes("aura")) {
          const stream = tts ? tts(body) : pcmStream([[1, 0, 2, 0], [3, 0]]);
          return new Response(stream, { headers: { "content-type": "audio/mpeg" } });
        }
        return Response.json({ success: true, result: { response: reply } });
      },
      webSocketPair: () => {
        const pair = { 0: new FakeSocket(), 1: new FakeSocket() };
        h.sockets.push(pair);
        return pair;
      },
      upgrade: (client, call) => {
        h.call = call;
        return new Response("upgraded", { status: 200, headers: { "x-test-upgrade": "1" } });
      },
    },
  };
  h.deps.openFlux = async () => h.flux;
  return h;
}

async function open(h, ip = "203.0.113.20") {
  const response = await handleRequest(new Request("https://abra-ca-dabra.app/api/chat/session", {
    method: "POST",
    headers: { origin: "http://127.0.0.1:4500", "content-type": "application/json", "cf-connecting-ip": ip },
    body: "{}",
  }), h.env, h.deps);
  assert.equal(response.status, 200);
  return `abra_chat=${response.headers.get("set-cookie").match(/abra_chat=([^;]+)/)[1]}`;
}

function dial(h, { cookie, ip = "203.0.113.20", upgrade = "websocket", origin = "https://abra-ca-dabra.app" } = {}) {
  const headers = { origin, "cf-connecting-ip": ip };
  if (upgrade) headers.upgrade = upgrade;
  if (cookie) headers.cookie = cookie;
  return handleRequest(new Request("https://abra-ca-dabra.app/api/chat/realtime", { headers }), h.env, h.deps);
}

async function connect(h, ip) {
  const cookie = await open(h, ip);
  const response = await dial(h, { cookie, ip });
  assert.equal(response.headers.get("x-test-upgrade"), "1");
  await flush();
  const browser = h.sockets.at(-1)[1];
  return { cookie, browser, call: h.call };
}

function storedSession(h) {
  const [room] = [...h.deps.rooms.values()];
  return room.get("session");
}

test("voice needs the switch, the AI binding, and the gateway", async () => {
  assert.equal(voiceEnabled({}), false);
  assert.equal(voiceEnabled({ ...VOICE_ENV, AI: undefined }), false);
  assert.equal(voiceEnabled({ ...VOICE_ENV, VOICE_ENABLED: "false" }), false);
  assert.equal(voiceEnabled({ ...VOICE_ENV, AI_GATEWAY_TOKEN: "" }), false);
  assert.equal(voiceEnabled(VOICE_ENV), true);
  const h = harness({ env: { ...VOICE_ENV, VOICE_ENABLED: "false" } });
  const config = await handleRequest(new Request("https://abra-ca-dabra.app/api/chat/config", { headers: { origin: "https://abra-ca-dabra.app" } }), h.env, h.deps);
  assert.equal((await config.json()).voiceEnabled, false);
  const cookie = await open(h);
  assert.equal((await dial(h, { cookie })).status, 404);
});

test("the call opens only inside a Turnstile-checked chat session", async () => {
  const h = harness();
  assert.equal((await dial(h)).status, 401);
  assert.equal((await dial(h, { origin: "https://evil.example" })).status, 403);
  const cookie = await open(h);
  assert.equal((await dial(h, { cookie, upgrade: null })).status, 426);
  assert.equal(h.sockets.length, 0);
});

test("one call at a time, three per chat, six per network per hour", async () => {
  const h = harness();
  const { cookie, call } = await connect(h, "198.51.100.1");
  assert.equal((await dial(h, { cookie, ip: "198.51.100.1" })).status, 409);
  call.end("visitor");
  assert.equal((await dial(h, { cookie, ip: "198.51.100.1" })).headers.get("x-test-upgrade"), "1");
  h.call.end("visitor");
  assert.equal((await dial(h, { cookie, ip: "198.51.100.1" })).headers.get("x-test-upgrade"), "1");
  h.call.end("visitor");
  assert.equal((await dial(h, { cookie, ip: "198.51.100.1" })).status, 429);

  const h2 = harness();
  let last = 0;
  for (let i = 0; i < 7; i += 1) {
    const cookie2 = await open(h2, `192.0.2.${i}`);
    const response = await dial(h2, { cookie: cookie2, ip: "198.51.100.50" });
    last = response.status;
    h2.call?.end("visitor");
  }
  assert.equal(last, 429);
});

test("a spoken turn runs Flux text through the chat brain and streams Aura-2 PCM back", async () => {
  const h = harness();
  const { browser } = await connect(h);
  assert.equal(browser.json()[0].type, "ready");
  assert.equal(browser.json()[0].sampleRate, 24000);
  assert.deepEqual(browser.json().find((m) => m.type === "state"), { type: "state", state: "listening" });

  // Mic frames go straight to Flux.
  browser.emit("message", new Uint8Array(640).buffer);
  assert.equal(h.flux.sent.length, 1);

  h.flux.emit("message", JSON.stringify({ event: "StartOfTurn", transcript: "What" }));
  h.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: "What does Abracadabra build?" }));
  await flush(60);

  const types = browser.json().map((m) => m.type);
  assert.deepEqual(types.slice(types.indexOf("user")), ["user", "state", "assistant", "state", "audio_start", "audio_end"]);
  // Still "speaking" until the browser finishes playing what it queued.
  assert.equal(h.call.state, "speaking");
  browser.emit("message", JSON.stringify({ type: "played", turn: 1 }));
  assert.equal(h.call.state, "listening");
  assert.equal(browser.json().find((m) => m.type === "assistant").text, "We build software around the work you already do. Tell me the job that takes the most time.");
  assert.equal(browser.binary().reduce((sum, chunk) => sum + chunk.byteLength, 0), 12, "two sentences of PCM");

  const llm = h.calls.find((c) => !c.url.includes("aura"));
  assert.match(llm.body.messages[0].content, /read aloud/);
  const tts = h.calls.filter((c) => c.url.includes("aura"));
  assert.equal(tts.length, 2);
  assert.match(tts[0].url, /gateway\.ai\.cloudflare\.com\/v1\/acct\/abracadabra-chat\/workers-ai\/@cf\/deepgram\/aura-2-en$/);
  assert.deepEqual({ ...tts[0].body, text: undefined }, { text: undefined, speaker: "luna", encoding: "linear16", container: "none", sample_rate: 24000 });
  assert.equal(tts[0].headers["cf-aig-collect-log-payload"], "false");
  assert.equal(tts[0].headers["cf-aig-collect-log"], "false");

  const session = await storedSession(h);
  assert.equal(session.voiceTurns, 1);
  assert.equal(session.voiceCalls, 1);
  assert.equal(session.messages.at(-2).text, "What does Abracadabra build?");
  assert.equal(session.messages.at(-2).voice, true);
  assert.ok(session.ttsChars > 0);
  assert.equal(JSON.stringify(session).includes("audio"), false, "no audio in the session");
});

test("binary frames that arrive as Blob reach Flux in order", async () => {
  const h = harness();
  const { browser } = await connect(h);
  browser.emit("message", new Blob([new Uint8Array([1, 1])]));
  browser.emit("message", new Blob([new Uint8Array([2, 2, 2, 2])]));
  browser.emit("message", new Uint8Array(6).buffer);
  await flush();
  assert.equal(h.flux.sent.length, 3);
  assert.deepEqual(h.flux.sent.map((frame) => frame.byteLength).sort(), [2, 4, 6]);
  const blobs = h.flux.sent.filter((frame) => frame.byteLength !== 6).map((frame) => frame.byteLength);
  assert.deepEqual(blobs, [2, 4]);
});

test("PCM samples stay whole when Aura splits a sample across chunks", async () => {
  const h = harness({ reply: "Short answer.", tts: () => pcmStream([[1, 2, 3], [4, 5, 6], [7]]) });
  const { browser } = await connect(h);
  h.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: "Hello there" }));
  await flush(60);
  const frames = browser.binary();
  assert.ok(frames.every((frame) => frame.byteLength % 2 === 0));
  assert.equal(frames.reduce((sum, frame) => sum + frame.byteLength, 0), 6);
});

test("without a played message the call returns to listening once the audio must have ended", async () => {
  const h = harness({ reply: "Short answer." });
  const { call } = await connect(h);
  h.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: "Hello there" }));
  await flush(60);
  assert.equal(call.state, "speaking");
  call.tick();
  assert.equal(call.state, "speaking");
  h.clock.now += 1600;
  call.tick();
  assert.equal(call.state, "listening");
});

test("barge-in: new speech stops the reply, the assistant's own echo does not", async () => {
  let release;
  const hold = new Promise((resolve) => { release = resolve; });
  const streams = [];
  const h = harness({
    reply: "We build software around the work you already do.",
    tts: () => {
      const stream = pcmStream([[1, 0], [2, 0]], { hold });
      streams.push(stream);
      return stream;
    },
  });
  const { browser, call } = await connect(h);
  h.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: "What do you build?" }));
  await flush(60);
  assert.equal(call.state, "speaking");
  // The speaker leaks into the mic: Flux hears the reply itself. Not an interruption.
  h.flux.emit("message", JSON.stringify({ event: "StartOfTurn", transcript: "we build software around the work" }));
  assert.equal(call.state, "speaking");
  assert.equal(browser.json().some((m) => m.type === "interrupt"), false);
  // The visitor talks over it.
  h.flux.emit("message", JSON.stringify({ event: "Update", transcript: "Wait, how much does it cost?" }));
  assert.equal(call.state, "listening");
  assert.ok(browser.json().some((m) => m.type === "interrupt"));
  release();
  await flush(60);
  assert.equal(browser.json().some((m) => m.type === "audio_end"), false, "the stopped reply never finishes");
  assert.equal(streams[0].wasCancelled(), true);
});

test("calls end at five minutes, after 45 quiet seconds, or when audio outruns the clock", async () => {
  const h = harness();
  const { browser, call } = await connect(h);
  h.clock.now += 44_000;
  call.tick();
  assert.equal(call.closed, false);
  h.clock.now += 2_000;
  call.tick();
  assert.equal(call.closed, true);
  assert.equal(browser.json().at(-1).reason, "idle");
  assert.equal(h.flux.closed, true);

  const h2 = harness();
  const second = await connect(h2);
  for (let i = 0; i < 6; i += 1) {
    h2.clock.now += 50_000;
    h2.flux.emit("message", JSON.stringify({ event: "Update", transcript: "still talking here" }));
    second.call.tick();
  }
  assert.equal(second.call.closed, true);
  assert.equal(second.browser.json().at(-1).reason, "max_length");

  const h3 = harness();
  const third = await connect(h3);
  third.browser.emit("message", new Uint8Array(64 * 1024).buffer);
  assert.equal(h3.flux.sent.length, 0, "oversized frames are dropped");
  for (let i = 0; i < 20; i += 1) third.browser.emit("message", new Uint8Array(16 * 1024).buffer);
  assert.equal(third.call.closed, true);
  assert.equal(third.browser.json().at(-1).reason, "rate");
});

test("voice turn and spoken-character caps end the call with a notice", async () => {
  const h = harness();
  const { call, browser } = await connect(h);
  const [room] = [...h.deps.rooms.values()];
  const session = await room.get("session");
  session.voiceTurns = 15;
  await room.put("session", session);
  h.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: "One more question" }));
  await flush(60);
  assert.equal(call.closed, true);
  assert.equal(browser.json().at(-1).reason, "turn_limit");

  const h2 = harness();
  const second = await connect(h2);
  const [room2] = [...h2.deps.rooms.values()];
  const s2 = await room2.get("session");
  s2.ttsChars = 2990;
  await room2.put("session", s2);
  h2.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: "Tell me more" }));
  await flush(60);
  assert.equal(second.call.closed, true);
  assert.equal(second.browser.json().at(-1).reason, "tts_limit");
  assert.ok(second.browser.json().some((m) => m.type === "assistant"), "the answer still shows as text");
  assert.equal(h2.calls.some((c) => c.url.includes("aura")), false);
});

test("Flux unavailable tells the visitor and closes", async () => {
  const h = harness();
  h.deps.openFlux = async () => null;
  const { browser, call } = await connect(h);
  assert.equal(call.closed, true);
  assert.equal(browser.json().at(-1).reason, "stt_unavailable");
});

test("helpers: echo check, sentences, speakable, speaker", () => {
  assert.equal(looksLikeEcho("we build software", "We build software around the work."), true);
  assert.equal(looksLikeEcho("how much is it", "We build software around the work."), false);
  assert.deepEqual(sentences("One. Two? Three!"), ["One.", "Two?", "Three!"]);
  assert.equal(speakable("Start here https://check.abra-ca-dabra.app/check now."), "Start here now.");
  assert.ok(speakable("One short sentence here. ".repeat(40)).length <= TTS_CHAR_CAP);
  assert.equal(ttsSpeaker({ TTS_SPEAKER: "Thalia" }), "thalia");
  assert.equal(ttsSpeaker({ TTS_SPEAKER: "nope" }), "luna");
});
