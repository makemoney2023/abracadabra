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

function harness({ env = VOICE_ENV, reply = "We build software around the work you already do. Tell me the job that takes the most time.", tts, llm } = {}) {
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
        if (llm) return llm(body);
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

async function voicePass(h, cookie, ip = "203.0.113.20", token = "") {
  const response = await handleRequest(new Request("https://abra-ca-dabra.app/api/chat/voice-pass", {
    method: "POST",
    headers: { origin: "http://127.0.0.1:4500", "content-type": "application/json", "cf-connecting-ip": ip, cookie },
    body: JSON.stringify({ turnstileToken: token }),
  }), h.env, h.deps);
  return { status: response.status, body: await response.json() };
}

async function dial(h, { cookie, ip = "203.0.113.20", upgrade = "websocket", origin = "https://abra-ca-dabra.app", pass } = {}) {
  const headers = { origin, "cf-connecting-ip": ip };
  if (upgrade) headers.upgrade = upgrade;
  if (cookie) headers.cookie = cookie;
  if (pass === undefined && cookie) pass = (await voicePass(h, cookie, ip)).body.pass || "";
  const query = pass ? `?pass=${pass}` : "";
  return handleRequest(new Request(`https://abra-ca-dabra.app/api/chat/realtime${query}`, { headers }), h.env, h.deps);
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
  assert.deepEqual(types.slice(types.indexOf("user")), ["user", "state", "state", "audio_start", "assistant", "audio_end"]);
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

test("calls end at eight minutes, after 45 quiet seconds, or when audio outruns the clock", async () => {
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
  for (let i = 0; i < 9; i += 1) {
    h2.clock.now += 50_000;
    h2.flux.emit("message", JSON.stringify({ event: "Update", transcript: "still talking here" }));
    second.call.tick();
  }
  assert.equal(second.call.closed, false, "still open at seven and a half minutes");
  h2.clock.now += 50_000;
  second.call.tick();
  assert.equal(second.call.closed, true);
  assert.equal(second.browser.json().at(-1).reason, "max_length");
  assert.ok(second.browser.json().some((m) => m.type === "notice" && /That is 8 minutes/.test(m.text)));

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
  session.voiceTurns = 25;
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


function sseStream(parts, { hold } = {}) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    async start(controller) {
      for (const [index, part] of parts.entries()) {
        if (hold && index === 1) await hold;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ response: part })}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  }), { headers: { "content-type": "text/event-stream" } });
}

test("the first sentence is spoken while the model is still writing", async () => {
  let release;
  const hold = new Promise((resolve) => { release = resolve; });
  const h = harness({ llm: () => sseStream(["We build custom apps around your work. ", "You can book a thirty-minute working session right here in this chat."], { hold }) });
  const { browser } = await connect(h);
  h.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: "What do you build?" }));
  await flush(60);
  const aura = h.calls.filter((c) => c.url.includes("aura"));
  assert.equal(aura.length, 1);
  assert.equal(aura[0].body.text, "We build custom apps around your work.");
  assert.ok(browser.binary().length > 0, "audio is already streaming");
  assert.equal(browser.json().some((m) => m.type === "assistant"), false);
  assert.equal(h.calls.find((c) => !c.url.includes("aura")).body.stream, true);
  release();
  await flush(60);
  assert.equal(h.calls.filter((c) => c.url.includes("aura")).length, 2);
  assert.match(browser.json().find((m) => m.type === "assistant").text, /^We build custom apps around your work\. You can book/);
});

test("a slow answer gets one cached filler line, and its echo is not a barge-in", async () => {
  let release;
  const hold = new Promise((resolve) => { release = resolve; });
  const h = harness({ llm: () => sseStream(["", "We build custom apps."], { hold }) });
  h.deps.fillerAfterMs = 5;
  const { browser, call } = await connect(h);
  h.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: "What do you build?" }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  const filler = browser.json().find((m) => m.type === "filler");
  assert.deepEqual(filler, { type: "filler", index: 0, turn: 1 });
  assert.equal(h.calls.filter((c) => c.url.includes("aura")).length, 0, "filler is not synthesized per call");
  h.flux.emit("message", JSON.stringify({ event: "Update", transcript: "let me check" }));
  assert.equal(call.state, "thinking");
  release();
  await flush(60);
  assert.equal(browser.json().filter((m) => m.type === "filler").length, 1);
  assert.equal(call.state, "speaking");
});

test("a fast answer plays no filler", async () => {
  const h = harness();
  h.deps.fillerAfterMs = 30;
  const { browser } = await connect(h);
  h.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: "Hello there" }));
  await flush(60);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(browser.json().some((m) => m.type === "filler"), false);
});

test("a model error is spoken as a short retry line and not saved as an answer", async () => {
  const h = harness({ llm: () => new Response("busy", { status: 503 }) });
  const { browser } = await connect(h);
  h.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: "What do you build?" }));
  await flush(60);
  assert.equal(browser.json().find((m) => m.type === "assistant").text, "Sorry, I lost that one. Could you say it again?");
  assert.equal(h.calls.filter((c) => c.url.includes("aura")).length, 1);
  const session = await storedSession(h);
  assert.equal(session.messages.length, 0);
});

test("the widget's filler lines and files match the worker's", async () => {
  const { FILLERS, FILLER_READY } = await import("../src/voice.js");
  const { FILLER_AUDIO } = await import("../src/filler-audio.js");
  const { readFile, stat } = await import("node:fs/promises");
  const widget = await readFile(new URL("../../../scrollcraft/builds/abracadabra-ai/assets/chat-widget.js", import.meta.url), "utf8");
  assert.ok(widget.includes(`FILLER_LINES = ${JSON.stringify(FILLERS).replace(/","/g, "\", \"")}`));
  assert.ok(widget.includes(`const FILLER_VERSION = "${FILLER_AUDIO.version}";`), "widget cache key matches the built audio");
  assert.ok(FILLERS.length >= 10 && new Set(FILLERS).size === FILLERS.length);
  assert.equal(FILLERS.some((line) => /good question|great question/i.test(line)), false);
  assert.ok(FILLER_READY.length >= 1);
  for (const index of FILLER_READY) {
    const file = await stat(new URL(`../../../scrollcraft/builds/abracadabra-ai/assets/voice/filler-${index}.mp3`, import.meta.url));
    assert.ok(file.size > 1000 && file.size < 20000);
  }
});

test("every call needs its own fresh Turnstile pass, used once", async () => {
  const h = harness({ env: { ...VOICE_ENV, TURNSTILE_SECRET_KEY: "secret" } });
  const base = h.deps.fetchImpl;
  const verified = [];
  h.deps.fetchImpl = async (url, init) => {
    if (String(url).includes("turnstile")) {
      const token = new URLSearchParams(init.body).get("response") || JSON.parse(init.body || "{}").response;
      verified.push(token);
      return Response.json({ success: token === "good-session" || token === "good-call" });
    }
    return base(url, init);
  };
  const session = await handleRequest(new Request("https://abra-ca-dabra.app/api/chat/session", {
    method: "POST",
    headers: { origin: "https://abra-ca-dabra.app", "content-type": "application/json", "cf-connecting-ip": "203.0.113.30" },
    body: JSON.stringify({ turnstileToken: "good-session" }),
  }), h.env, h.deps);
  assert.equal(session.status, 200);
  const cookie = `abra_chat=${session.headers.get("set-cookie").match(/abra_chat=([^;]+)/)[1]}`;
  // The session's pass does not open a call by itself.
  assert.equal((await dial(h, { cookie, pass: "" })).status, 403);
  assert.equal((await dial(h, { cookie, pass: crypto.randomUUID() })).status, 403);
  assert.equal((await voicePass(h, cookie, "203.0.113.30", "bad")).status, 403);
  const good = await voicePass(h, cookie, "203.0.113.30", "good-call");
  assert.equal(good.status, 200);
  assert.deepEqual(verified, ["good-session", "bad", "good-call"]);
  assert.equal((await dial(h, { cookie, pass: good.body.pass })).headers.get("x-test-upgrade"), "1");
  h.call.end("visitor");
  // Used once.
  assert.equal((await dial(h, { cookie, pass: good.body.pass })).status, 403);
  // Expires after two minutes.
  const late = await voicePass(h, cookie, "203.0.113.30", "good-call");
  h.clock.now += 2 * 60 * 1000 + 1;
  assert.equal((await dial(h, { cookie, pass: late.body.pass })).status, 403);
});

function slowLlm(delayMs, text) {
  const calls = [];
  const llm = (body) => {
    calls.push(body);
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      async start(controller) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ response: text })}\n\ndata: [DONE]\n\n`));
        controller.close();
      },
    }), { headers: { "content-type": "text/event-stream" } });
  };
  return { llm, calls };
}

test("eager end of turn starts the model early and keeps it when the words match", async () => {
  const model = slowLlm(30, "We build custom apps and voice agents.");
  const h = harness({ llm: model.llm });
  const { browser, call } = await connect(h);
  h.flux.emit("message", JSON.stringify({ event: "StartOfTurn", transcript: "What" }));
  h.flux.emit("message", JSON.stringify({ event: "EagerEndOfTurn", transcript: "What do you build" }));
  await flush(10);
  assert.equal(model.calls.length, 1, "model started on the eager event");
  assert.equal(browser.json().some((m) => m.type === "assistant"), false, "nothing shown before the turn is final");
  h.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: "What do you build?" }));
  await new Promise((resolve) => setTimeout(resolve, 60));
  await flush(60);
  assert.equal(model.calls.length, 1, "the early answer was reused");
  assert.equal(call.eagerHits, 1);
  assert.match(browser.json().find((m) => m.type === "assistant").text, /custom apps/);
});

test("eager guesses are dropped on TurnResumed or a different final transcript", async () => {
  const model = slowLlm(5, "Here is an answer.");
  const h = harness({ llm: model.llm });
  const { browser, call } = await connect(h);
  h.flux.emit("message", JSON.stringify({ event: "EagerEndOfTurn", transcript: "What do you" }));
  await flush(10);
  h.flux.emit("message", JSON.stringify({ event: "TurnResumed", transcript: "What do you charge" }));
  await flush(10);
  assert.equal(call.eager, null);
  h.flux.emit("message", JSON.stringify({ event: "EagerEndOfTurn", transcript: "What do you charge" }));
  await flush(10);
  h.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: "What do you charge for a website?" }));
  await new Promise((resolve) => setTimeout(resolve, 40));
  await flush(60);
  assert.equal(model.calls.length, 3, "two guesses, then a fresh call for the real words");
  assert.equal(call.eagerHits || 0, 0);
  assert.equal(model.calls.at(-1).messages.at(-1).content, "What do you charge for a website?");
  assert.ok(browser.json().some((m) => m.type === "assistant"));
});

test("Flux is asked for eager end-of-turn events", async () => {
  const { openFlux } = await import("../src/voice.js");
  let params;
  const socket = { accept() {} };
  await openFlux({ AI: { run: async (_model, input) => { params = input; return { webSocket: socket }; } } });
  assert.equal(params.eager_eot_threshold, "0.5");
  assert.equal(params.eot_threshold, "0.6");
  await openFlux({ VOICE_EOT_THRESHOLD: "0.8", AI: { run: async (_model, input) => { params = input; return { webSocket: socket }; } } });
  assert.equal(params.eot_threshold, "0.8");
  assert.equal(params.eager_eot_threshold, "0.5");
});

test("VOICE_EOT_THRESHOLD tunes end of turn within 0.5 to 0.9; eager stays below it", async () => {
  const { fluxThresholds } = await import("../src/voice.js");
  assert.deepEqual(fluxThresholds({}), { eot_threshold: "0.6", eager_eot_threshold: "0.5" });
  assert.deepEqual(fluxThresholds({ VOICE_EOT_THRESHOLD: "0.5" }), { eot_threshold: "0.5", eager_eot_threshold: "0.4" });
  assert.deepEqual(fluxThresholds({ VOICE_EOT_THRESHOLD: "0.9" }), { eot_threshold: "0.9", eager_eot_threshold: "0.5" });
  for (const bad of ["0.2", "1.5", "fast", ""]) assert.equal(fluxThresholds({ VOICE_EOT_THRESHOLD: bad }).eot_threshold, "0.6", bad);
});

test("a clear ask to book opens the calendar at once and says so, without the model", async () => {
  const h = harness({ env: { ...VOICE_ENV, CAL_LINK: "abra/30min" } });
  const { browser } = await connect(h);
  h.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: "Can we book a call?" }));
  await flush(60);
  const out = browser.json();
  const action = out.findIndex((m) => m.type === "ui_action");
  assert.equal(out[action].action, "open_booking");
  assert.ok(action < out.findIndex((m) => m.type === "assistant"), "calendar opens before the answer");
  assert.match(out.find((m) => m.type === "assistant").text, /opened the booking calendar/);
  assert.equal(out.find((m) => m.type === "assistant").action, null);
  assert.equal(h.calls.filter((c) => !c.url.includes("aura")).length, 0);
  assert.match(h.calls.find((c) => c.url.includes("aura")).body.text, /opened the booking calendar/);
  assert.equal((await storedSession(h)).bookingOffered, true);
});

test("without a Cal.com link the voice points to the two-times form", async () => {
  const h = harness();
  const { browser } = await connect(h);
  h.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: "I'd like to schedule a meeting" }));
  await flush(60);
  assert.match(browser.json().find((m) => m.type === "assistant").text, /short form/);
});

test("a booking made during the call is confirmed out loud once", async () => {
  const h = harness();
  const { browser } = await connect(h);
  browser.emit("message", JSON.stringify({ type: "booked", when: "November 2, 10:00 AM EST<script>" }));
  browser.emit("message", JSON.stringify({ type: "booked", when: "November 2, 10:00 AM EST" }));
  await flush(60);
  const said = browser.json().filter((m) => m.type === "assistant");
  assert.equal(said.length, 1);
  assert.equal(said[0].text, "You're booked for November 2, 10:00 AM ESTscript. A calendar invite is on its way to your email.");
  assert.equal(h.calls.filter((c) => c.url.includes("aura")).length, 1);
});

test("booking intent: clear asks open the calendar, mentions only offer it", async () => {
  const { uiActionFor, wantsBooking } = await import("../src/policy.js");
  for (const ask of ["Can we book a call?", "book it", "I want to schedule a meeting", "Could we set up a time next week?", "Can I talk to a person?", "open the calendar", "can we meet"]) {
    assert.equal(wantsBooking(ask), true, ask);
    assert.equal(uiActionFor(ask), "open_booking", ask);
  }
  for (const mention of ["How much does a call cost?", "What happens on the call?", "I don't want to book a call yet", "What's your pricing?", "Do you build call center agents?"]) {
    assert.equal(wantsBooking(mention), false, mention);
  }
  assert.equal(uiActionFor("What's your pricing?"), "offer_booking");
});

test("a voice call answers about the page the visitor opened it on", async () => {
  const bodies = [];
  const h = harness({ llm: (body) => { bodies.push(body); return Response.json({ success: true, result: { response: "We build that." } }); } });
  const cookie = await open(h);
  const passed = await handleRequest(new Request("https://abra-ca-dabra.app/api/chat/voice-pass", {
    method: "POST",
    headers: { origin: "http://127.0.0.1:4500", "content-type": "application/json", "cf-connecting-ip": "203.0.113.20", cookie },
    body: JSON.stringify({ page: "/services/custom-apps/", title: "Custom apps | Abracadabra" }),
  }), h.env, h.deps);
  const { pass } = await passed.json();
  assert.equal((await dial(h, { cookie, pass })).headers.get("x-test-upgrade"), "1");
  await flush();
  h.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: "How much is this?" }));
  await flush(60);
  assert.match(bodies[0].messages[0].content, /READING THIS PAGE NOW: Custom apps \|/);
});

test("voice: a repeat booking pitch is not spoken twice in a row, and the prompt knows it was offered", async () => {
  const pitch = "We build custom apps around your work. You can book a thirty-minute working session right here in this chat.";
  const h = harness({ reply: pitch });
  const { browser } = await connect(h);
  h.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: "What do you build?" }));
  await flush(80);
  h.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: "Can I see some examples?" }));
  await flush(80);
  const answers = browser.json().filter((m) => m.type === "assistant").map((m) => m.text);
  assert.equal(answers.length, 2);
  assert.match(answers[0], /book a thirty-minute working session/);
  assert.equal(answers[1], "We build custom apps around your work.");
  const llm = h.calls.filter((c) => !c.url.includes("aura"));
  assert.match(llm.at(-1).body.messages[0].content, /already offered the working session or the Readiness Check in your last answer/);
  assert.equal(h.calls.filter((c) => c.url.includes("aura") && /book/.test(c.body.text)).length, 1, "the pitch is spoken once");
});

test("voice caps: 25 turns, 8 minutes, and the 3,000 spoken-character cost guard stays", async () => {
  const voice = await import("../src/voice.js");
  assert.equal(voice.VOICE_TURNS_PER_SESSION, 25);
  assert.equal(voice.MAX_CALL_MS, 8 * 60 * 1000);
  assert.equal(voice.VOICE_TTS_CHARS_PER_SESSION, 3000);
  assert.equal(voice.TTS_CHAR_CAP, 400);
});

test("voice answers are short: about 35 words in the prompt and a lower token cap", async () => {
  const { MAX_TOKENS, VOICE_MAX_TOKENS, VOICE_SUFFIX } = await import("../src/model.js");
  assert.match(VOICE_SUFFIX, /about 35 words or fewer/);
  assert.ok(VOICE_MAX_TOKENS < MAX_TOKENS && VOICE_MAX_TOKENS >= 80);
  const h = harness();
  await connect(h);
  h.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: "What do you build?" }));
  await flush(60);
  const llm = h.calls.find((c) => c.url.includes("llama"));
  assert.equal(llm.body.max_tokens, VOICE_MAX_TOKENS);
});

test("barge-in: three words stop the reply at once; two words only after 400 ms", async () => {
  const hold = new Promise(() => {});
  const make = () => harness({ reply: "We build software around the work you already do.", tts: () => pcmStream([[1, 0], [2, 0]], { hold }) });
  const h = make();
  h.deps.bargeHoldMs = 30;
  const { browser, call } = await connect(h);
  h.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: "What do you build?" }));
  await flush(60);
  assert.equal(call.state, "speaking");
  h.flux.emit("message", JSON.stringify({ event: "Update", transcript: "hold on" }));
  assert.equal(call.state, "speaking", "two words do not stop it yet");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(call.state, "listening", "two words still there after the hold stop it");
  assert.ok(browser.json().some((m) => m.type === "interrupt"));

  const h2 = make();
  const second = await connect(h2);
  h2.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: "What do you build?" }));
  await flush(60);
  h2.flux.emit("message", JSON.stringify({ event: "Update", transcript: "wait hold on" }));
  assert.equal(second.call.state, "listening", "three words stop it at once");

  const h3 = make();
  h3.deps.bargeHoldMs = 30;
  const third = await connect(h3);
  h3.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: "What do you build?" }));
  await flush(60);
  h3.flux.emit("message", JSON.stringify({ event: "Update", transcript: "mm hm" }));
  h3.flux.emit("message", JSON.stringify({ event: "Update", transcript: "we build" }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(third.call.state, "speaking", "a short sound that turns out to be echo is not a barge-in");
  third.call.end("test");
  second.call.end("test");
  call.end("test");
});

test("fillers: only built lines, never on two turns in a row, only in the fillers' voice", async () => {
  const { FILLER_READY, FILLER_AFTER_MS } = await import("../src/voice.js");
  assert.equal(FILLER_AFTER_MS, 1600);
  const slow = () => sseStream(["", "We build custom apps."], { hold: new Promise((resolve) => setTimeout(resolve, 30)) });
  const h = harness({ llm: slow });
  h.deps.fillerAfterMs = 5;
  const { browser, call } = await connect(h);
  for (const [turn, text] of ["What do you build?", "And for clinics?", "How long does it take?"].entries()) {
    h.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: text }));
    await new Promise((resolve) => setTimeout(resolve, 60));
    await flush(60);
    call.finishSpeaking(turn + 1);
  }
  const fillers = browser.json().filter((m) => m.type === "filler");
  assert.deepEqual(fillers.map((m) => m.turn), [1, 3], "turn 2 gets no filler");
  for (const filler of fillers) assert.ok(FILLER_READY.includes(filler.index));
  assert.notEqual(fillers[0].index, fillers[1].index, "lines rotate");

  const ab = harness({ env: { ...VOICE_ENV, TTS_SPEAKER: "thalia" }, llm: slow });
  ab.deps.fillerAfterMs = 5;
  const other = await connect(ab);
  ab.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: "What do you build?" }));
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(other.browser.json().some((m) => m.type === "filler"), false, "luna fillers are not played in another voice");
});

test("voice A/B: TTS_SPEAKER_AB picks luna, thalia or andromeda per chat, logged and used for every sentence", async () => {
  const { callSpeaker } = await import("../src/voice.js");
  assert.deepEqual(callSpeaker({}), { speaker: "luna", ab: false });
  assert.deepEqual(callSpeaker({ TTS_SPEAKER: "thalia" }), { speaker: "thalia", ab: false });
  assert.deepEqual(callSpeaker({ TTS_SPEAKER_AB: "luna" }, "x"), { speaker: "luna", ab: false }, "one voice is not a test");
  assert.deepEqual(callSpeaker({ TTS_SPEAKER_AB: "luna,zeus" }, "x"), { speaker: "luna", ab: false }, "only the A/B voices");
  const env = { TTS_SPEAKER_AB: "luna, thalia, andromeda" };
  const picks = new Set();
  for (let i = 0; i < 40; i += 1) {
    const pick = callSpeaker(env, `session-${i}`);
    assert.equal(pick.ab, true);
    assert.deepEqual(callSpeaker(env, `session-${i}`), pick, "stable for a chat");
    picks.add(pick.speaker);
  }
  assert.deepEqual([...picks].sort(), ["andromeda", "luna", "thalia"]);

  const logs = [];
  const original = console.log;
  console.log = (line) => logs.push(String(line));
  try {
    const h = harness({ env: { ...VOICE_ENV, TTS_SPEAKER_AB: "thalia,andromeda" } });
    const { call } = await connect(h);
    h.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: "What do you build?" }));
    await flush(60);
    const spoken = h.calls.filter((c) => c.url.includes("aura")).map((c) => c.body.speaker);
    assert.ok(spoken.length >= 1);
    assert.ok(spoken.every((name) => name === call.speaker) && ["thalia", "andromeda"].includes(call.speaker));
    assert.ok(logs.some((line) => line === `voice call: speaker=${call.speaker} (a/b)`));
    assert.equal((await storedSession(h)).voiceSpeaker, call.speaker);
  } finally {
    console.log = original;
  }
});
