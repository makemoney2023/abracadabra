import { deliverHandoff, handoffEnvelope, handoffSummary, HANDOFF_FROM, mailerConfigured, signHex, studioInbox } from "./handoff.js";
import { ChatUnavailable, replyStream } from "./model.js";
import { answerLabel, bandView, checkFetch, checkOrigin, cleanAnswer, stepView } from "./readiness.js";
import { hqConfigured, postLeadToHq } from "./hq.js";
import {
  clientIp,
  extraOrigins,
  localOrigin,
  originAllowed,
  checkedSentences,
  localReply,
  rateGate,
  uiActionFor,
  verifyTurnstile,
} from "./policy.js";
import { applyChatEvent, blankSession, IDLE_MS, isExpired, parseContact, rememberExchange } from "./session.js";
import { VoiceCall } from "./realtime.js";
import { VOICE_CALLS_PER_SESSION, VOICE_TURNS_PER_SESSION, voiceEnabled } from "./voice.js";

const HQ_RETRIES = 5;

const WINDOW_MS = 60 * 60 * 1000;
const IP_MESSAGE_LIMIT = 20;
const IP_SESSION_LIMIT = 8;
const SESSION_MESSAGE_LIMIT = 30;
const IP_CALL_LIMIT = 6;
const IP_READINESS_LIMIT = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isolateLimits = { messages: new Map(), sessions: new Map(), calls: new Map(), passes: new Map() };
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
  if (!limits.calls) limits.calls = new Map();
  if (!limits.passes) limits.passes = new Map();
  if (!limits.readiness) limits.readiness = new Map();
  return limits;
}

function gateHit(limits, name, ip, now, limit) {
  const gate = rateGate(limits[name].get(ip) || [], now, limit, WINDOW_MS);
  limits[name].set(ip, gate.hits);
  return gate.ok;
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

export const VOICE_PASS_MS = 2 * 60 * 1000;
export const RETRY_TEXT = "Sorry, that took longer than it should. Try again, or book a thirty-minute working session right here in this chat.";
export const TYPED_SENTENCES = 5;

/**
 * Streams the typed reply as server-sent events: "token" for each checked sentence as soon as it
 * passes, "final" with the whole checked answer (the widget swaps it in), "ui_action", then "done".
 * A model timeout or error sends "error" with RETRY_TEXT instead of hanging. The exchange is saved
 * only when an answer was given.
 */
function streamReply({ text, action, history, session, storage, env, deps, now }) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const emit = (event, data) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      let answer = "";
      let failure = null;
      try {
        for await (const part of checkedSentences(replyStream({ env, messages: history, fetchImpl: deps.fetchImpl, page: { path: session.page, title: session.pageTitle } }), { maxSentences: TYPED_SENTENCES })) {
          if (part.replace) {
            answer = part.replace;
            break;
          }
          emit("token", { text: answer ? ` ${part.text}` : part.text });
          answer = answer ? `${answer} ${part.text}` : part.text;
        }
      } catch (error) {
        failure = error instanceof ChatUnavailable ? error.reason : "error";
      }
      if (failure === "unconfigured") answer = localReply(text);
      if (!answer) {
        if (failure && failure !== "unconfigured") console.error(`chat reply: ${failure}`);
        emit("error", { text: RETRY_TEXT, retry: true });
        emit("done", { ok: false });
        controller.close();
        return;
      }
      if (action === "offer_booking" || action === "open_booking") session.bookingOffered = true;
      rememberExchange(session, text, answer, now);
      await save(storage, session, deps);
      emit("final", { text: answer });
      if (action) emit("ui_action", { action });
      emit("done", { ok: true });
      controller.close();
    },
  });
  return new Response(body, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" },
  });
}

const CHECK_DOWN = "The check is not answering right now. You can take it on its own page.";

/** One step of the Readiness Check in the chat: start (or resume), or answer the current step. */
async function readinessStep(body, session, storage, env, deps, now, ip) {
  const state = session.readiness || null;
  const fallbackUrl = `${checkOrigin(env)}/check?utm_source=chat`;
  const reportUrl = (token) => `${checkOrigin(env)}/check/${encodeURIComponent(token)}`;
  const headers = { "content-type": "application/json", "x-forwarded-for": ip };
  const finished = () => json({ done: true, band: bandView(session.readiness.band), reportUrl: reportUrl(session.readiness.token) }, 200);
  try {
    if (body.op === "start") {
      if (state?.done) return finished();
      if (state?.token) return json({ step: stepView(state.step, state.answered), resumed: true }, 200);
      const response = await checkFetch(env, "/api/assessments", {
        method: "POST",
        headers,
        body: JSON.stringify({ utm: { utm_source: "chat", utm_medium: "website-chat", chat_session_id: session.id } }),
      }, deps);
      if (!response.ok) {
        const limited = response.status === 429;
        return json({ error: limited ? "That is the check limit for today on this network." : CHECK_DOWN, fallbackUrl }, limited ? 429 : 502);
      }
      const created = await response.json();
      const step = stepView(String(created.firstStep || ""), 0);
      if (!created.token || !step) return json({ error: CHECK_DOWN, fallbackUrl }, 502);
      session.readiness = { token: String(created.token), step: step.id, answered: 0, startedAt: now, pressures: [] };
      session.updatedAt = now;
      await save(storage, session, deps);
      return json({ step }, 200);
    }
    if (body.op !== "answer") return json({ error: "Unknown step." }, 400);
    if (!state?.token) return json({ error: "Start the check first." }, 409);
    if (state.done) return finished();
    const stepId = String(body.stepId || "");
    if (stepId !== state.step) return json({ error: "That question was already answered.", step: stepView(state.step, state.answered) }, 409);
    const answer = cleanAnswer(stepId, body.answer);
    if (answer === undefined) return json({ error: "Choose one of the options.", step: stepView(stepId, state.answered) }, 400);
    const patched = await checkFetch(env, `/api/assessments/${encodeURIComponent(state.token)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ stepId, answer }),
    }, deps);
    const data = await patched.json().catch(() => ({}));
    if (patched.status === 400) {
      return json({ error: String(data.details || data.error || "Check that answer.").slice(0, 200), step: stepView(stepId, state.answered) }, 400);
    }
    if (!patched.ok) return json({ error: CHECK_DOWN, fallbackUrl: reportUrl(state.token) }, 502);
    state.answered += 1;
    if (stepId === "pressure") state.pressures = answer.map((value) => answerLabel("pressure", [value])).slice(0, 5);
    if (data.nextStep === "gate") {
      const scored = await checkFetch(env, `/api/assessments/${encodeURIComponent(state.token)}/complete`, { method: "POST", headers }, deps);
      const result = await scored.json().catch(() => ({}));
      state.step = "gate";
      if (!scored.ok || !result.band) {
        await save(storage, session, deps);
        return json({ error: CHECK_DOWN, fallbackUrl: reportUrl(state.token) }, 502);
      }
      state.done = true;
      state.band = String(result.band);
      state.completedAt = now;
      const band = bandView(state.band);
      // The model sees the outcome in the history, so follow-up questions make sense.
      rememberExchange(session, "I finished the Readiness Check here in the chat.", `Your Readiness Check came out ${band.label}. ${band.sentence}`.trim(), now);
      await save(storage, session, deps);
      return finished();
    }
    const next = stepView(String(data.nextStep || ""), state.answered);
    if (!next) return json({ error: CHECK_DOWN, fallbackUrl: reportUrl(state.token) }, 502);
    state.step = next.id;
    session.updatedAt = now;
    await save(storage, session, deps);
    return json({ step: next }, 200);
  } catch (error) {
    console.error(`readiness: ${error?.message || error}`);
    return json({ error: CHECK_DOWN, fallbackUrl: state?.token ? reportUrl(state.token) : fallbackUrl }, 502);
  }
}

/** The page the visitor is on right now (path and title), for page-aware answers. */
function rememberPage(session, value) {
  if (value?.page) session.page = String(value.page).slice(0, 300);
  if (typeof value?.title === "string") session.pageTitle = value.title.slice(0, 160);
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

  if (op === "voice-pass") {
    const parsed = await readJson(request);
    if (parsed.ok) rememberPage(session, parsed.value);
    if ((session.voiceCalls || 0) >= VOICE_CALLS_PER_SESSION || (session.voiceTurns || 0) >= VOICE_TURNS_PER_SESSION) {
      return json({ error: "That is the voice limit for this chat. You can keep typing." }, 429);
    }
    session.voicePass = { id: crypto.randomUUID(), expiresAt: now + VOICE_PASS_MS };
    await save(storage, session, deps);
    return json({ pass: session.voicePass.id }, 200);
  }

  if (url.pathname === "/api/chat/readiness") {
    const parsed = await readJson(request);
    if (!parsed.ok) return json({ error: parsed.message }, parsed.status);
    return readinessStep(parsed.value || {}, session, storage, env, deps, now, clientIp(request));
  }

  if (url.pathname === "/api/chat/message") {
    if (session.messageCount >= SESSION_MESSAGE_LIMIT) {
      return json({ error: "This chat is full. Email houdini@abra-ca-dabra.app." }, 429);
    }
    const parsed = await readJson(request);
    if (!parsed.ok) return json({ error: parsed.message }, parsed.status);
    const text = String(parsed.value?.text || "").trim();
    if (!text || text.length > 2000) return json({ error: "Add a short question." }, 400);
    rememberPage(session, parsed.value);
    const action = uiActionFor(text);
    const history = [...session.messages, { role: "user", text }];
    return streamReply({ text, action, history, session, storage, env, deps, now });
  }

  if (url.pathname === "/api/chat/realtime") {
    if (!voiceEnabled(env)) return json({ error: "Voice is off right now. Type your question." }, 404);
    if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket") {
      return json({ error: "Open the voice call from the chat." }, 426);
    }
    if ((session.voiceCalls || 0) >= VOICE_CALLS_PER_SESSION || (session.voiceTurns || 0) >= VOICE_TURNS_PER_SESSION) {
      return json({ error: "That is the voice limit for this chat. You can keep typing." }, 429);
    }
    const slot = deps.callSlot || deps;
    if (slot.activeCall && !slot.activeCall.closed) {
      return json({ error: "A voice call is already open in this chat." }, 409);
    }
    // One fresh Turnstile pass per call, used once.
    const pass = url.searchParams.get("pass") || "";
    const held = session.voicePass;
    if (!pass || !held || held.id !== pass || now > held.expiresAt) {
      return json({ error: "The voice check expired. Tap the mic again." }, 403);
    }
    delete session.voicePass;
    session.voiceCalls = (session.voiceCalls || 0) + 1;
    session.updatedAt = now;
    await save(storage, session, deps);
    const pair = deps.webSocketPair ? deps.webSocketPair() : new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const call = new VoiceCall({
      client: server,
      env,
      deps,
      loadSession: () => load(storage, deps.now ? deps.now() : Date.now()),
      saveSession: (next) => save(storage, next, deps),
    });
    slot.activeCall = call;
    void call.start();
    return deps.upgrade ? deps.upgrade(client, call) : new Response(null, { status: 101, webSocket: client });
  }

  if (url.pathname === "/api/chat/contact") {
    const parsed = await readJson(request);
    if (!parsed.ok) return json({ error: parsed.message }, parsed.status);
    const contact = parseContact(parsed.value);
    if (!contact.ok) return json({ field: contact.field, error: contact.message }, 400);
    session.contact = { ...contact.value, consentAt: new Date(now).toISOString() };
    session.updatedAt = now;
    const handoff = await emitHandoff(session, env, deps, now);
    session.hqAttempts = (session.hqAttempts || 0) + 1;
    const hq = await postLeadToHq(session, env, { now, fetchImpl: deps.hqFetch || deps.fetchImpl || fetch });
    await save(storage, session, deps);
    return json({ ok: true, mailed: handoff.mailed, duplicate: handoff.duplicate, hq: hq.posted || Boolean(session.hqLeadSent) }, 200);
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
  if (!session || now < session.alarmAt) return { sent: false };
  let hq = false;
  let changed = false;
  // A lead HQ did not take on the first try is retried here (up to HQ_RETRIES). HQ dedupes on external_id.
  if (session.contact && !session.hqLeadSent && hqConfigured(env) && (session.hqAttempts || 0) < HQ_RETRIES) {
    session.hqAttempts = (session.hqAttempts || 0) + 1;
    hq = (await postLeadToHq(session, env, { now, fetchImpl: deps.hqFetch || deps.fetchImpl || fetch })).posted;
    if (!hq) session.alarmAt = now + IDLE_MS;
    changed = true;
  }
  if (session.handoffSent || (!session.contact && !session.bookingCompleted)) {
    if (changed) await save(storage, session, deps);
    return { sent: false, hq };
  }
  const result = await emitHandoff(session, env, deps, now);
  if (!result.sent) session.alarmAt = now + IDLE_MS;
  await save(storage, session, deps);
  return { ...result, hq };
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

  const realtime = url.pathname === "/api/chat/realtime" && request.method === "GET";
  if (request.method !== "POST" && !realtime) return cors(json({ error: "Method not allowed." }, 405), request, env);

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

  if (url.pathname === "/api/chat/voice-pass") {
    // Each voice call needs its own fresh Turnstile pass, not just the one that opened the chat.
    if (!voiceEnabled(env)) return cors(json({ error: "Voice is off right now. Type your question." }, 404), request, env);
    if (!gateHit(limits, "passes", ip, now, IP_CALL_LIMIT * 2)) {
      return cors(json({ error: "Too many voice calls from this network. You can still type." }, 429), request, env);
    }
    const id = readCookie(request.headers.get("cookie"), "abra_chat");
    if (!UUID.test(id)) return cors(json({ error: "Open the chat again." }, 401), request, env);
    const parsed = await readJson(request);
    if (!parsed.ok) return cors(json({ error: parsed.message }, parsed.status), request, env);
    const turnstile = await verifyTurnstile({
      secret: String(env.TURNSTILE_SECRET_KEY || "").trim(),
      token: String(parsed.value?.turnstileToken || ""),
      ip,
      fetchImpl: deps.fetchImpl || fetch,
      allowMissingSecret: localOrigin(request.headers.get("origin")),
    });
    if (!turnstile.ok && turnstile.reason === "unconfigured") {
      return cors(json({ error: "Chat verification is not configured." }, 503), request, env);
    }
    if (!turnstile.ok) return cors(json({ error: "The check failed. Try the voice call again." }, 403), request, env);
    const pass = new Request(request.url, {
      method: "POST",
      headers: { "x-abra-session": id, "x-abra-op": "voice-pass", "cf-connecting-ip": ip, "content-type": "application/json" },
      body: JSON.stringify({ page: parsed.value?.page || "", title: parsed.value?.title || "" }),
    });
    return cors(await openSession(id, pass, env, deps), request, env);
  }

  if (url.pathname === "/api/chat/realtime") {
    if (!voiceEnabled(env)) return cors(json({ error: "Voice is off right now. Type your question." }, 404), request, env);
    if (!gateHit(limits, "calls", ip, now, IP_CALL_LIMIT)) {
      return cors(json({ error: "Too many voice calls from this network. You can still type." }, 429), request, env);
    }
  } else if (url.pathname === "/api/chat/readiness") {
    // About twenty answers per check; they get their own allowance so typing is not used up.
    if (!gateHit(limits, "readiness", ip, now, IP_READINESS_LIMIT)) {
      return cors(json({ error: "Too many answers from this network. Try again later." }, 429), request, env);
    }
  } else if (!gateHit(limits, "messages", ip, now, IP_MESSAGE_LIMIT)) {
    return cors(json({ error: "Too many notes from this network. Try again later." }, 429), request, env);
  }
  const id = readCookie(request.headers.get("cookie"), "abra_chat");
  if (!UUID.test(id)) return cors(json({ error: "Open the chat again." }, 401), request, env);
  const answer = await openSession(id, forward(request, id), env, deps);
  // A 101 carries the WebSocket and must be returned as is.
  if (realtime && answer.status === 101) return answer;
  if (realtime && answer.webSocket) return answer;
  return cors(answer, request, env);
}
