import { deliverHandoff, handoffEnvelope, handoffSummary, HANDOFF_FROM, mailerConfigured, signHex, studioInbox } from "./handoff.js";
import { completeChat } from "./model.js";
import {
  clientIp,
  extraOrigins,
  localOrigin,
  originAllowed,
  postCheck,
  rateGate,
  uiActionFor,
  verifyTurnstile,
} from "./policy.js";
import { applyChatEvent, blankSession, IDLE_MS, isExpired, parseContact, rememberExchange } from "./session.js";
import {
  audioKind,
  baseAudioType,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_SECONDS,
  MIN_AUDIO_BYTES,
  SPEAKS_PER_REPLY,
  speakable,
  synthesize,
  transcribe,
  VOICE_TTS_CHARS_PER_SESSION,
  VOICE_TURNS_PER_SESSION,
  voiceEnabled,
} from "./voice.js";

const WINDOW_MS = 60 * 60 * 1000;
const IP_MESSAGE_LIMIT = 20;
const IP_SESSION_LIMIT = 8;
const SESSION_MESSAGE_LIMIT = 30;
const IP_VOICE_LIMIT = 15;
const IP_SPEAK_LIMIT = 45;
const SPEAK_REPEAT_MS = 60 * 1000;
const SPEAK_REPEATS = 2;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isolateLimits = { messages: new Map(), sessions: new Map(), voice: new Map(), speak: new Map() };
const isolateRooms = new Map();

export function readCookie(header, name) {
  if (!header) return "";
  for (const part of header.split(/;\s*/)) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index) === name) return decodeURIComponent(part.slice(index + 1));
  }
  return "";
}

function json(body, status, headers) {
  const next = new Headers(headers);
  next.set("content-type", "application/json; charset=utf-8");
  next.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status, headers: next });
}

function cors(response, request, env) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("origin");
  if (origin && originAllowed(origin, extraOrigins(env))) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
    headers.set("access-control-allow-headers", "content-type");
    headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
    headers.set("vary", "Origin");
  }
  return new Response(response.body, { status: response.status, headers });
}

function allowed(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return originAllowed(origin, extraOrigins(env));
}

async function readJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 20_000) return { ok: false, status: 413, message: "That note is too long." };
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, status: 400, message: "We could not read that." };
  }
}

function limitsFor(deps) {
  const limits = deps.limits || isolateLimits;
  if (!limits.voice) limits.voice = new Map();
  if (!limits.speak) limits.speak = new Map();
  return limits;
}

function gateHit(limits, name, ip, now, limit) {
  const gate = rateGate(limits[name].get(ip) || [], now, limit, WINDOW_MS);
  limits[name].set(ip, gate.hits);
  return gate.ok;
}

/**
 * A reply can be played SPEAKS_PER_REPLY times. Media players (Safari in particular) may open
 * the same play more than once (a range probe, then the real read). A repeat of the same play
 * number inside SPEAK_REPEAT_MS is allowed up to SPEAK_REPEATS times and is not charged again.
 */
export function claimSpeak(session, replyId, play, now) {
  const id = String(replyId || "");
  const reply = UUID.test(id)
    ? session.messages.find((message) => message.role === "assistant" && message.voice && message.id === id)
    : null;
  if (!reply) return { ok: false, status: 404, message: "Nothing to read." };
  const n = Number(play);
  if (!Number.isInteger(n) || n < 1 || n > SPEAKS_PER_REPLY) {
    return { ok: false, status: 429, message: "That answer was already read." };
  }
  const text = speakable(reply.text);
  if (!text) return { ok: false, status: 404, message: "Nothing to read." };
  reply.plays = reply.plays || {};
  const seen = reply.plays[n];
  if (seen) {
    if (now - seen.at > SPEAK_REPEAT_MS || seen.repeats >= SPEAK_REPEATS) {
      return { ok: false, status: 429, message: "That answer was already read." };
    }
    seen.repeats += 1;
    return { ok: true, text, repeat: true };
  }
  if ((session.ttsChars || 0) + text.length > VOICE_TTS_CHARS_PER_SESSION) {
    return { ok: false, status: 429, message: "Spoken answers are used up for this chat. The answer is in the chat." };
  }
  reply.plays[n] = { at: now, repeats: 0 };
  reply.spoken = Object.keys(reply.plays).length;
  session.ttsChars = (session.ttsChars || 0) + text.length;
  return { ok: true, text, repeat: false };
}

async function readAudio(request) {
  const declared = request.headers.get("content-length");
  const length = Number(declared);
  if (!declared || !Number.isFinite(length)) return { ok: false, status: 411, message: "Send the clip again." };
  if (length > MAX_AUDIO_BYTES) return { ok: false, status: 413, message: "Keep it under 30 seconds." };
  let bytes;
  try {
    bytes = new Uint8Array(await request.arrayBuffer());
  } catch {
    return { ok: false, status: 400, message: "We could not read that clip." };
  }
  if (bytes.byteLength > MAX_AUDIO_BYTES) return { ok: false, status: 413, message: "Keep it under 30 seconds." };
  if (bytes.byteLength < MIN_AUDIO_BYTES) return { ok: false, status: 400, message: "That was too short. Hold the mic a little longer." };
  if (!audioKind(request.headers.get("content-type"), bytes)) {
    return { ok: false, status: 415, message: "That audio type is not supported. You can type instead." };
  }
  return { ok: true, bytes, type: baseAudioType(request.headers.get("content-type")) };
}

function roomsFor(deps) {
  return deps.rooms || isolateRooms;
}

function memoryStorage() {
  const data = new Map();
  return {
    async get(key) { return data.get(key); },
    async put(key, value) { data.set(key, structuredClone(value)); },
    async delete(key) { data.delete(key); },
  };
}

function cookie(id, request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `abra_chat=${id}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000${secure}`;
}

function publicConfig(env) {
  return {
    calLink: String(env.CAL_LINK || env.BOOKING_URL || "").trim(),
    readinessCheckUrl: String(env.READINESS_CHECK_URL || "https://check.abra-ca-dabra.app/check").trim(),
    turnstileSiteKey: String(env.TURNSTILE_SITE_KEY || "").trim(),
    voiceEnabled: voiceEnabled(env),
    greeting: "Ask a plain question. A person reviews anything we follow up on.",
  };
}

async function load(storage, now) {
  const session = await storage.get("session");
  if (isExpired(session, now)) {
    if (session) await storage.delete("session");
    return null;
  }
  return session;
}

async function save(storage, session, deps) {
  if (!session.alarmAt || session.alarmAt < session.updatedAt + IDLE_MS) {
    session.alarmAt = session.updatedAt + IDLE_MS;
  }
  await storage.put("session", session);
  if (typeof deps.setAlarm === "function") await deps.setAlarm(session.alarmAt);
}

function handoffStamp(session) {
  return JSON.stringify({
    email: session.contact?.email || "",
    goal: session.contact?.goal || "",
    windows: session.contact?.windows || "",
    booking: session.bookingCompleted?.externalId || "",
    starts: session.bookingCompleted?.startsAt || "",
  });
}

export async function emitHandoff(session, env, deps, now) {
  if (!session.contact && !session.bookingCompleted) return { sent: false, duplicate: false, mailed: false };
  const stamp = handoffStamp(session);
  if (session.handoffSent && session.handoffStamp === stamp) {
    return { sent: false, duplicate: true, mailed: Boolean(session.handoffMailed) };
  }
  const envelope = handoffEnvelope(session, now);
  const raw = JSON.stringify(envelope);
  const secret = String(env.HANDOFF_HMAC_SECRET || "").trim();
  const signature = secret ? await signHex(secret, raw) : "";
  const to = studioInbox(env);
  const from = String(env.CHAT_HANDOFF_FROM || HANDOFF_FROM).trim();
  const message = {
    to,
    from,
    subject: `Chat handoff from ${session.contact?.name || session.bookingCompleted?.name || "a visitor"}`,
    text: `${handoffSummary(envelope)}\n\n${raw}`,
    signature,
  };
  session.handoff = envelope;
  let mailed = false;
  try {
    mailed = await deliverHandoff(env, deps, message);
  } catch (error) {
    console.error(`chat handoff: ${error instanceof Error ? error.message : "mail failed"}`);
    return { sent: false, duplicate: false, mailed: false };
  }
  session.handoffMailed = mailed;
  if (mailed || !mailerConfigured(env, deps)) {
    session.handoffSent = true;
    session.handoffStamp = stamp;
  }
  return { sent: session.handoffSent, duplicate: false, mailed };
}

function sse(text, action) {
  const chunks = text.match(/\S+\s*/g) || [text];
  let body = chunks.map((chunk) => `event: token\ndata: ${JSON.stringify({ text: chunk })}\n\n`).join("");
  if (action) body += `event: ui_action\ndata: ${JSON.stringify({ action })}\n\n`;
  body += `event: done\ndata: ${JSON.stringify({ ok: true })}\n\n`;
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function handleSession(request, storage, env, deps) {
  const now = deps.now ? deps.now() : Date.now();
  const url = new URL(request.url);
  const id = request.headers.get("x-abra-session") || "";
  if (!UUID.test(id)) return json({ error: "Open the chat again." }, 401);
  const op = request.headers.get("x-abra-op") || "";

  if (op === "init") {
    const existing = await load(storage, now);
    if (!existing) {
      const parsed = await readJson(request);
      const page = parsed.ok ? parsed.value?.page : "";
      await save(storage, blankSession({ id, now, ip: clientIp(request), page }), deps);
    }
    const session = await load(storage, now);
    return json({ ok: true, sessionId: session.id }, 200);
  }

  const session = await load(storage, now);
  if (!session || session.id !== id) return json({ error: "Open the chat again." }, 401);

  if (url.pathname === "/api/chat/message") {
    if (session.messageCount >= SESSION_MESSAGE_LIMIT) {
      return json({ error: "This chat is full. Email houdini@abra-ca-dabra.app." }, 429);
    }
    const parsed = await readJson(request);
    if (!parsed.ok) return json({ error: parsed.message }, parsed.status);
    const text = String(parsed.value?.text || "").trim();
    if (!text || text.length > 2000) return json({ error: "Add a short question." }, 400);
    if (parsed.value?.page) session.page = String(parsed.value.page).slice(0, 300);
    const draft = await completeChat({
      env,
      messages: [...session.messages, { role: "user", text }],
      fetchImpl: deps.fetchImpl,
    });
    const checked = postCheck(draft);
    const action = uiActionFor(text);
    if (action === "offer_booking") session.bookingOffered = true;
    rememberExchange(session, text, checked.text, now);
    await save(storage, session, deps);
    return sse(checked.text, action);
  }

  if (url.pathname === "/api/chat/voice") {
    if (!voiceEnabled(env)) return json({ error: "Voice is off right now. Type your question." }, 404);
    if (session.messageCount >= SESSION_MESSAGE_LIMIT) {
      return json({ error: "This chat is full. Email houdini@abra-ca-dabra.app." }, 429);
    }
    if ((session.voiceTurns || 0) >= VOICE_TURNS_PER_SESSION) {
      return json({ error: "That is the voice limit for this chat. You can keep typing." }, 429);
    }
    const audio = await readAudio(request);
    if (!audio.ok) return json({ error: audio.message }, audio.status);
    session.voiceTurns = (session.voiceTurns || 0) + 1;
    session.updatedAt = now;
    const heard = await transcribe({ env, bytes: audio.bytes, fetchImpl: deps.fetchImpl });
    audio.bytes = null;
    if (!heard.ok) {
      await save(storage, session, deps);
      return json({ error: "I could not hear that. Try again, or type your question." }, 502);
    }
    if (heard.seconds && heard.seconds > MAX_AUDIO_SECONDS) {
      await save(storage, session, deps);
      return json({ error: "Keep it under 30 seconds." }, 413);
    }
    const text = heard.text;
    if (text.replace(/[^a-z0-9]/gi, "").length < 2) {
      await save(storage, session, deps);
      return json({ ok: true, transcript: "", reply: "I did not catch that. Tap the mic and try again.", action: null, replyId: null }, 200);
    }
    const draft = await completeChat({
      env,
      messages: [...session.messages, { role: "user", text }],
      fetchImpl: deps.fetchImpl,
      voice: true,
    });
    const checked = postCheck(draft);
    const action = uiActionFor(text);
    if (action === "offer_booking") session.bookingOffered = true;
    const replyId = crypto.randomUUID();
    rememberExchange(session, text, checked.text, now, { voice: true, replyId });
    await save(storage, session, deps);
    return json({ ok: true, transcript: text, reply: checked.text, action, replyId }, 200);
  }

  if (url.pathname === "/api/chat/speak") {
    if (!voiceEnabled(env)) return json({ error: "Voice is off right now." }, 404);
    // GET ?id=<replyId>&p=<play> lets an <audio> element stream the MP3 as it arrives.
    // POST {replyId, play} is the full-download fallback. Both share the same checks.
    let replyId = "";
    let play = 1;
    if (request.method === "GET") {
      replyId = url.searchParams.get("id") || "";
      play = Number(url.searchParams.get("p") || 1);
    } else {
      const parsed = await readJson(request);
      if (!parsed.ok) return json({ error: parsed.message }, parsed.status);
      replyId = String(parsed.value?.replyId || "");
      play = Number(parsed.value?.play || 1);
    }
    const ticket = claimSpeak(session, replyId, play, now);
    if (!ticket.ok) return json({ error: ticket.message }, ticket.status);
    session.updatedAt = now;
    await save(storage, session, deps);
    const audio = await synthesize({ env, text: ticket.text, fetchImpl: deps.fetchImpl });
    if (!audio) return json({ error: "The voice is quiet right now. The answer is in the chat." }, 502);
    // Pass the gateway stream straight through: no buffering, no Content-Length.
    return new Response(audio.body, {
      status: 200,
      headers: {
        "content-type": audio.headers.get("content-type") || "audio/mpeg",
        "cache-control": "no-store",
        "accept-ranges": "none",
        "x-content-type-options": "nosniff",
      },
    });
  }

  if (url.pathname === "/api/chat/contact") {
    const parsed = await readJson(request);
    if (!parsed.ok) return json({ error: parsed.message }, parsed.status);
    const contact = parseContact(parsed.value);
    if (!contact.ok) return json({ field: contact.field, error: contact.message }, 400);
    session.contact = { ...contact.value, consentAt: new Date(now).toISOString() };
    session.updatedAt = now;
    const handoff = await emitHandoff(session, env, deps, now);
    await save(storage, session, deps);
    return json({ ok: true, mailed: handoff.mailed, duplicate: handoff.duplicate }, 200);
  }

  if (url.pathname === "/api/chat/events") {
    const parsed = await readJson(request);
    if (!parsed.ok) return json({ error: parsed.message }, parsed.status);
    const applied = applyChatEvent(session, parsed.value, now);
    if (!applied.ok) return json({ error: applied.message }, 400);
    let handoff = { mailed: false, duplicate: false };
    if (parsed.value?.kind === "booking_completed") handoff = await emitHandoff(session, env, deps, now);
    await save(storage, session, deps);
    return json({ ok: true, mailed: handoff.mailed, duplicate: handoff.duplicate }, 200);
  }

  return json({ error: "Not found." }, 404);
}

async function openSession(id, request, env, deps) {
  if (env.CHAT_SESSION) {
    const namespace = env.CHAT_SESSION;
    return namespace.get(namespace.idFromName(id)).fetch(request);
  }
  const rooms = roomsFor(deps);
  if (!rooms.has(id)) rooms.set(id, memoryStorage());
  return handleSession(request, rooms.get(id), env, deps);
}

function forward(request, id) {
  const headers = new Headers(request.headers);
  headers.set("x-abra-session", id);
  headers.delete("x-abra-op");
  return new Request(request, { headers });
}

export async function runAlarm(storage, env, deps, now) {
  const session = await load(storage, now);
  if (!session || session.handoffSent) return { sent: false };
  if (now < session.alarmAt) return { sent: false };
  if (!session.contact && !session.bookingCompleted) return { sent: false };
  const result = await emitHandoff(session, env, deps, now);
  if (!result.sent) session.alarmAt = now + IDLE_MS;
  await save(storage, session, deps);
  return result;
}

export async function handleRequest(request, env = {}, deps = {}) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/chat" && !url.pathname.startsWith("/api/chat/")) {
    return json({ error: "Not found." }, 404);
  }
  if (!allowed(request, env)) return cors(json({ error: "This chat is only on abra-ca-dabra.app." }, 403), request, env);
  if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }), request, env);
  const now = deps.now ? deps.now() : Date.now();

  if (url.pathname === "/api/chat/config" && request.method === "GET") {
    return cors(json(publicConfig(env), 200), request, env);
  }

  const streamSpeak = url.pathname === "/api/chat/speak" && request.method === "GET";
  if (request.method !== "POST" && !streamSpeak) return cors(json({ error: "Method not allowed." }, 405), request, env);

  const ip = clientIp(request);
  const limits = limitsFor(deps);

  if (url.pathname === "/api/chat/session") {
    const gate = rateGate(limits.sessions.get(ip) || [], now, IP_SESSION_LIMIT, WINDOW_MS);
    limits.sessions.set(ip, gate.hits);
    if (!gate.ok) return cors(json({ error: "Too many chats from this network. Try again later." }, 429), request, env);
    const parsed = await readJson(request);
    if (!parsed.ok) return cors(json({ error: parsed.message }, parsed.status), request, env);
    const secret = String(env.TURNSTILE_SECRET_KEY || "").trim();
    const turnstile = await verifyTurnstile({
      secret,
      token: String(parsed.value?.turnstileToken || ""),
      ip,
      fetchImpl: deps.fetchImpl || fetch,
      allowMissingSecret: localOrigin(request.headers.get("origin")),
    });
    if (!turnstile.ok && turnstile.reason === "unconfigured") {
      return cors(json({ error: "Chat verification is not configured." }, 503), request, env);
    }
    if (!turnstile.ok) return cors(json({ error: "The check failed. Reload the chat and try again." }, 403), request, env);
    const id = crypto.randomUUID();
    const init = new Request(request.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-abra-session": id,
        "x-abra-op": "init",
        "cf-connecting-ip": ip,
      },
      body: JSON.stringify({ page: parsed.value?.page || "" }),
    });
    const created = await openSession(id, init, env, deps);
    const headers = new Headers(created.headers);
    headers.append("set-cookie", cookie(id, request));
    return cors(new Response(created.body, { status: created.status, headers }), request, env);
  }

  if (url.pathname === "/api/chat/voice" || url.pathname === "/api/chat/speak") {
    if (!voiceEnabled(env)) return cors(json({ error: "Voice is off right now. Type your question." }, 404), request, env);
    if (url.pathname === "/api/chat/voice") {
      const length = Number(request.headers.get("content-length") || 0);
      if (length > MAX_AUDIO_BYTES) return cors(json({ error: "Keep it under 30 seconds." }, 413), request, env);
      if (!gateHit(limits, "voice", ip, now, IP_VOICE_LIMIT)) {
        return cors(json({ error: "Too many voice notes from this network. You can still type." }, 429), request, env);
      }
      if (!gateHit(limits, "messages", ip, now, IP_MESSAGE_LIMIT)) {
        return cors(json({ error: "Too many notes from this network. Try again later." }, 429), request, env);
      }
    } else if (!gateHit(limits, "speak", ip, now, IP_SPEAK_LIMIT)) {
      return cors(json({ error: "Too many spoken answers from this network." }, 429), request, env);
    }
  } else if (!gateHit(limits, "messages", ip, now, IP_MESSAGE_LIMIT)) {
    return cors(json({ error: "Too many notes from this network. Try again later." }, 429), request, env);
  }
  const id = readCookie(request.headers.get("cookie"), "abra_chat");
  if (!UUID.test(id)) return cors(json({ error: "Open the chat again." }, 401), request, env);
  return cors(await openSession(id, forward(request, id), env, deps), request, env);
}
