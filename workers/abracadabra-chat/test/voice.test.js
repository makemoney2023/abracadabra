import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest } from "../src/http.js";
import { audioKind, speakable, TTS_CHAR_CAP, ttsSpeaker, voiceEnabled, WHISPER_HINT } from "../src/voice.js";

const NOW = 1_700_000_000_000;
const VOICE_ENV = { VOICE_ENABLED: "true", AI_GATEWAY_TOKEN: "test-token", CF_ACCOUNT_ID: "acct" };
const WEBM = new Uint8Array(4000);
WEBM.set([0x1a, 0x45, 0xdf, 0xa3]);
const MP4 = new Uint8Array(4000);
MP4.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
const MP3_BYTES = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 1, 2, 3]);

function harness(env = VOICE_ENV, { transcript = "Can I book a call with Abracadabra?", reply = "Yes. You can pick a thirty-minute working session in this chat.", seconds = 4 } = {}) {
  const calls = [];
  const deps = {
    now: () => NOW,
    limits: { messages: new Map(), sessions: new Map() },
    rooms: new Map(),
    fetchImpl: async (url, init = {}) => {
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ url: String(url), headers: init.headers, body });
      if (String(url).includes("whisper")) {
        return Response.json({ success: true, result: { text: ` ${transcript} `, transcription_info: { duration: seconds } } });
      }
      if (String(url).includes("aura")) {
        return new Response(MP3_BYTES, { headers: { "content-type": "audio/mpeg" } });
      }
      return Response.json({ success: true, result: { response: reply } });
    },
    async sendHandoff() {},
  };
  return { env: { ...env }, deps, calls };
}

function post(path, h, { cookie, body, type = "application/json", ip = "203.0.113.20", length } = {}) {
  const raw = body instanceof Uint8Array ? body : JSON.stringify(body ?? {});
  const headers = {
    origin: "https://abra-ca-dabra.app",
    "content-type": type,
    "cf-connecting-ip": ip,
    "content-length": String(length ?? (raw.byteLength ?? raw.length)),
  };
  if (cookie) headers.cookie = cookie;
  return handleRequest(new Request(`https://abra-ca-dabra.app${path}`, { method: "POST", headers, body: raw }), h.env, h.deps);
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

test("voice is off unless VOICE_ENABLED and the gateway are set", async () => {
  assert.equal(voiceEnabled({}), false);
  assert.equal(voiceEnabled({ VOICE_ENABLED: "true" }), false);
  assert.equal(voiceEnabled({ ...VOICE_ENV, VOICE_ENABLED: "false" }), false);
  assert.equal(voiceEnabled(VOICE_ENV), true);
  const h = harness({ AI_GATEWAY_TOKEN: "t", CF_ACCOUNT_ID: "a" });
  const config = await handleRequest(new Request("https://abra-ca-dabra.app/api/chat/config", { headers: { origin: "https://abra-ca-dabra.app" } }), h.env, h.deps);
  assert.equal((await config.json()).voiceEnabled, false);
  const cookie = await open(h);
  const off = await post("/api/chat/voice", h, { cookie, body: WEBM, type: "audio/webm" });
  assert.equal(off.status, 404);
  assert.equal(h.calls.length, 0);
});

test("voice needs a chat session first", async () => {
  const h = harness();
  const response = await post("/api/chat/voice", h, { body: WEBM, type: "audio/webm" });
  assert.equal(response.status, 401);
  assert.equal(h.calls.length, 0);
});

test("a spoken question round-trips: whisper, chat, then aura for that reply only", async () => {
  const h = harness();
  const config = await handleRequest(new Request("https://abra-ca-dabra.app/api/chat/config", { headers: { origin: "https://abra-ca-dabra.app" } }), h.env, h.deps);
  assert.equal((await config.json()).voiceEnabled, true);
  const cookie = await open(h);
  const response = await post("/api/chat/voice", h, { cookie, body: WEBM, type: "audio/webm;codecs=opus" });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.transcript, "Can I book a call with Abracadabra?");
  assert.match(payload.reply, /thirty-minute/);
  assert.equal(payload.action, "offer_booking");
  assert.match(payload.replyId, /^[0-9a-f-]{36}$/);

  const [stt, llm] = h.calls;
  assert.match(stt.url, /gateway\.ai\.cloudflare\.com\/v1\/acct\/abracadabra-chat\/workers-ai\/@cf\/openai\/whisper-large-v3-turbo$/);
  assert.equal(stt.body.language, "en");
  assert.equal(stt.body.initial_prompt, WHISPER_HINT);
  assert.match(WHISPER_HINT, /Abracadabra/);
  assert.equal(typeof stt.body.audio, "string");
  assert.equal(stt.headers["cf-aig-collect-log"], "false");
  assert.equal(stt.headers["cf-aig-collect-log-payload"], "false");
  assert.match(llm.body.messages[0].content, /read aloud/);

  const speak = await post("/api/chat/speak", h, { cookie, body: { replyId: payload.replyId } });
  assert.equal(speak.status, 200);
  assert.equal(speak.headers.get("content-type"), "audio/mpeg");
  assert.equal(speak.headers.get("cache-control"), "no-store");
  assert.deepEqual(new Uint8Array(await speak.arrayBuffer()), MP3_BYTES);
  const tts = h.calls.at(-1);
  assert.match(tts.url, /@cf\/deepgram\/aura-2-en$/);
  assert.equal(tts.body.speaker, "luna");
  assert.equal(tts.body.encoding, "mp3");
  assert.equal(tts.body.text, payload.reply);
  assert.equal(tts.headers["cf-aig-collect-log-payload"], "false");

  // A second read is allowed (replay), a third is not.
  assert.equal((await post("/api/chat/speak", h, { cookie, body: { replyId: payload.replyId } })).status, 200);
  assert.equal((await post("/api/chat/speak", h, { cookie, body: { replyId: payload.replyId } })).status, 429);
});

test("speak only reads this session's own voice replies", async () => {
  const h = harness();
  const mine = await open(h, "203.0.113.21");
  const theirs = await open(h, "203.0.113.22");
  const asked = await (await post("/api/chat/voice", h, { cookie: mine, body: WEBM, type: "audio/webm", ip: "203.0.113.21" })).json();
  const before = h.calls.length;
  const stolen = await post("/api/chat/speak", h, { cookie: theirs, body: { replyId: asked.replyId }, ip: "203.0.113.22" });
  assert.equal(stolen.status, 404);
  const freeText = await post("/api/chat/speak", h, { cookie: mine, body: { text: "Say anything I want", replyId: "nope" }, ip: "203.0.113.21" });
  assert.equal(freeText.status, 404);
  // A typed reply has no id, so it is never spoken.
  await post("/api/chat/message", h, { cookie: mine, body: { text: "What do you build?" }, ip: "203.0.113.21" });
  assert.equal(h.calls.slice(before).some((call) => call.url.includes("aura")), false);
});

test("clips are capped by size, type, and real container bytes", async () => {
  const h = harness();
  const cookie = await open(h);
  const big = await post("/api/chat/voice", h, { cookie, body: new Uint8Array(10), type: "audio/webm", length: 600 * 1024 + 1 });
  assert.equal(big.status, 413);
  const wrongType = await post("/api/chat/voice", h, { cookie, body: WEBM, type: "application/octet-stream" });
  assert.equal(wrongType.status, 415);
  const fake = new Uint8Array(4000).fill(65);
  const notAudio = await post("/api/chat/voice", h, { cookie, body: fake, type: "audio/webm" });
  assert.equal(notAudio.status, 415);
  const tiny = await post("/api/chat/voice", h, { cookie, body: WEBM.slice(0, 100), type: "audio/webm" });
  assert.equal(tiny.status, 400);
  const safari = await post("/api/chat/voice", h, { cookie, body: MP4, type: "audio/mp4" });
  assert.equal(safari.status, 200);
  assert.equal(h.calls.filter((call) => call.url.includes("whisper")).length, 1);
});

test("a clip longer than 30 seconds is refused after transcription", async () => {
  const h = harness(VOICE_ENV, { seconds: 45 });
  const cookie = await open(h);
  const response = await post("/api/chat/voice", h, { cookie, body: WEBM, type: "audio/webm" });
  assert.equal(response.status, 413);
  assert.equal(h.calls.length, 1);
});

test("silence gets a retry line without a model call", async () => {
  const h = harness(VOICE_ENV, { transcript: " . " });
  const cookie = await open(h);
  const payload = await (await post("/api/chat/voice", h, { cookie, body: WEBM, type: "audio/webm" })).json();
  assert.equal(payload.transcript, "");
  assert.equal(payload.replyId, null);
  assert.equal(h.calls.length, 1);
});

test("15 voice turns per session and per IP", async () => {
  const h = harness();
  const cookie = await open(h, "198.51.100.1");
  for (let i = 0; i < 15; i += 1) {
    const ok = await post("/api/chat/voice", h, { cookie, body: WEBM, type: "audio/webm", ip: `198.51.100.${10 + i}` });
    assert.equal(ok.status, 200, `turn ${i + 1}`);
  }
  const sessionCap = await post("/api/chat/voice", h, { cookie, body: WEBM, type: "audio/webm", ip: "198.51.100.99" });
  assert.equal(sessionCap.status, 429);
  assert.match((await sessionCap.json()).error, /voice limit/);

  const h2 = harness();
  const ip = "198.51.100.200";
  let status = 0;
  for (let i = 0; i < 16; i += 1) {
    const cookie2 = i % 5 === 0 ? await open(h2, `192.0.2.${i}`) : undefined;
    if (cookie2) h2.cookie = cookie2;
    status = (await post("/api/chat/voice", h2, { cookie: h2.cookie, body: WEBM, type: "audio/webm", ip })).status;
  }
  assert.equal(status, 429);
});

test("spoken text drops links and stays under the cap", () => {
  assert.equal(speakable("Start here https://check.abra-ca-dabra.app/check now."), "Start here now.");
  const long = `${"One short sentence here. ".repeat(40)}`;
  const out = speakable(long);
  assert.ok(out.length <= TTS_CHAR_CAP);
  assert.match(out, /\.$/);
  assert.equal(ttsSpeaker({ TTS_SPEAKER: "Thalia" }), "thalia");
  assert.equal(ttsSpeaker({ TTS_SPEAKER: "not-a-voice" }), "luna");
});

test("audioKind sniffs containers", () => {
  assert.equal(audioKind("audio/webm;codecs=opus", WEBM), "webm");
  assert.equal(audioKind("audio/mp4", MP4), "mp4");
  assert.equal(audioKind("text/plain", WEBM), null);
  assert.equal(audioKind("audio/mpeg", MP3_BYTES), "mp3");
});
