import assert from "node:assert/strict";
import { SITE_KNOWLEDGE_VERSION } from "../src/site-knowledge.js";
import test from "node:test";
import { signHex } from "../src/handoff.js";
import { handleRequest, runAlarm } from "../src/http.js";
import { completeChat } from "../src/model.js";
import { postCheck } from "../src/policy.js";

const NOW = 1_700_000_000_000;
const IDLE_MS = 15 * 60 * 1000;

function harness(env = {}) {
  const sent = [];
  const deps = {
    now: () => NOW,
    limits: { messages: new Map(), sessions: new Map() },
    rooms: new Map(),
    fetchImpl: async () => {
      throw new Error("no network");
    },
    sendHandoff: async (message) => {
      sent.push(message);
    },
  };
  return { env, deps, sent };
}

function call(path, { method = "POST", origin = "https://abra-ca-dabra.app", body, cookie, ip = "203.0.113.10", env, deps } = {}) {
  return handleRequest(new Request(`https://abra-ca-dabra.app${path}`, {
    method,
    headers: {
      origin,
      "content-type": "application/json",
      "cf-connecting-ip": ip,
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined || method === "GET" ? undefined : JSON.stringify(body),
  }), env, deps);
}

async function openChat(h, ip = "203.0.113.10") {
  const response = await call("/api/chat/session", {
    ...h,
    ip,
    origin: "http://127.0.0.1:4500",
    body: { page: "/services/ai-visibility/" },
  });
  assert.equal(response.status, 200);
  const id = response.headers.get("set-cookie").match(/abra_chat=([^;]+)/)[1];
  const payload = await response.json();
  assert.equal(payload.sessionId, id);
  return { cookie: `abra_chat=${id}`, id };
}

test("config is public and foreign origins are refused", async () => {
  const h = harness({ CAL_LINK: "abracadabra/working-session", TURNSTILE_SITE_KEY: "site" });
  const config = await call("/api/chat/config", { ...h, method: "GET" });
  assert.equal(config.status, 200);
  assert.deepEqual(await config.json(), {
    calLink: "abracadabra/working-session",
    readinessCheckUrl: "https://check.abra-ca-dabra.app/check",
    turnstileSiteKey: "site",
    voiceEnabled: false,
    greeting: "Hi, I'm the Abracadabra assistant. Ask me anything about our work, or tell me the job that eats your week.",
    knowledge: SITE_KNOWLEDGE_VERSION,
  });
  const blocked = await call("/api/chat/config", { ...h, method: "GET", origin: "https://evil.example" });
  assert.equal(blocked.status, 403);
});

test("production session requires Turnstile, localhost can open without it", async () => {
  const closed = await call("/api/chat/session", { ...harness(), body: {} });
  assert.equal(closed.status, 503);

  const deniedHarness = harness({ TURNSTILE_SECRET_KEY: "secret" });
  deniedHarness.deps.fetchImpl = async () => Response.json({ success: false });
  const denied = await call("/api/chat/session", { ...deniedHarness, body: { turnstileToken: "bad" } });
  assert.equal(denied.status, 403);

  const allowedHarness = harness({ TURNSTILE_SECRET_KEY: "secret" });
  allowedHarness.deps.fetchImpl = async (url) => {
    assert.match(url, /challenges.cloudflare.com/);
    return Response.json({ success: true });
  };
  const allowed = await call("/api/chat/session", { ...allowedHarness, body: { turnstileToken: "ok" } });
  assert.equal(allowed.status, 200);
  assert.match(allowed.headers.get("set-cookie"), /HttpOnly/);
  assert.match(allowed.headers.get("set-cookie"), /Secure/);

  const local = await openChat(harness());
  assert.match(local.id, /^[0-9a-f-]{36}$/);
});

test("rate limits chats per network and questions per session", async () => {
  const h = harness();
  for (let i = 0; i < 8; i += 1) {
    const response = await call("/api/chat/session", {
      ...h,
      origin: "http://127.0.0.1:9",
      ip: "198.51.100.8",
      body: {},
    });
    assert.equal(response.status, 200);
  }
  const blocked = await call("/api/chat/session", {
    ...h,
    origin: "http://127.0.0.1:9",
    ip: "198.51.100.8",
    body: {},
  });
  assert.equal(blocked.status, 429);

  const chat = await openChat(h, "198.51.100.9");
  for (let i = 0; i < 20; i += 1) {
    const response = await call("/api/chat/message", { ...h, cookie: chat.cookie, ip: "198.51.100.9", body: { text: "Hello" } });
    assert.equal(response.status, 200);
  }
  const limited = await call("/api/chat/message", { ...h, cookie: chat.cookie, ip: "198.51.100.9", body: { text: "Hello again" } });
  assert.equal(limited.status, 429);

  const cap = harness();
  const other = await openChat(cap, "198.51.100.10");
  for (let i = 0; i < 30; i += 1) {
    const response = await call("/api/chat/message", {
      env: cap.env,
      deps: { ...cap.deps, limits: { messages: new Map(), sessions: new Map() } },
      cookie: other.cookie,
      ip: `203.0.113.${(i % 50) + 20}`,
      body: { text: "What do you build?" },
    });
    assert.equal(response.status, 200);
  }
  const full = await call("/api/chat/message", {
    ...cap,
    cookie: other.cookie,
    ip: "203.0.113.80",
    body: { text: "One more" },
  });
  assert.equal(full.status, 429);
  assert.match(await full.text(), /chat is full/);
});

test("answers stay short, plain, and on our sites", async () => {
  assert.deepEqual(postCheck("We guarantee a start on Monday."), {
    text: "I can help you think it through. A person reviews anything we send after this chat.",
    flags: ["commitment"],
  });
  const priced = postCheck("A build is $15,000. We map the work. Then we build the tool. Then we review it. Then we launch it.");
  assert.equal(priced.flags.includes("price"), true);
  assert.equal(priced.text.includes("$"), false);
  assert.match(priced.text, /job that takes the most time/);
  const long = postCheck("We map the work. Then we build the tool. Then we review it. Then we launch it. Then we run it.");
  assert.equal(long.flags.includes("length"), true);
  assert.equal(long.text.split(". ").length, 4);
  const linked = postCheck("See https://abra-ca-dabra.app/services/ and https://evil.example/phish and https://cal.com/abracadabra/working-session.");
  assert.match(linked.text, /abra-ca-dabra\.app/);
  assert.match(linked.text, /cal\.com/);
  assert.equal(linked.text.includes("evil.example"), false);
  assert.match(postCheck("We leverage synergy to unlock growth.").text, /job that takes the most time/);

  const h = harness({ AI_GATEWAY_TOKEN: "token", CF_ACCOUNT_ID: "acct", AI_GATEWAY_ID: "abracadabra-chat" });
  h.deps.fetchImpl = async (_url, init) => {
    assert.equal(init.headers["cf-aig-skip-cache"], "true");
    assert.equal(init.headers["cf-aig-collect-log"], "false");
    assert.equal(init.headers["cf-aig-collect-log-payload"], "false");
    return Response.json({ result: { response: "Our price is $40k. Visit https://evil.example/buy." } });
  };
  const chat = await openChat(h, "203.0.113.40");
  const response = await call("/api/chat/message", { ...h, cookie: chat.cookie, ip: "203.0.113.40", body: { text: "Can we book a call?" } });
  const body = await response.text();
  assert.match(body, /event: ui_action\ndata: \{"action":"open_booking"\}/);
  assert.equal(body.includes("$40k"), false);
  assert.equal(body.includes("evil.example"), false);
  const session = await h.deps.rooms.get(chat.id).get("session");
  assert.equal(session.bookingOffered, true);
  assert.equal(session.messages.at(-1).text.includes("$"), false);
  assert.equal(session.messages.at(-1).text.includes("evil.example"), false);
});

test("readiness and contact actions follow the question", async () => {
  const h = harness();
  const chat = await openChat(h, "203.0.113.41");
  const ready = await call("/api/chat/message", {
    ...h,
    cookie: chat.cookie,
    ip: "203.0.113.41",
    body: { text: "I am not sure where to start." },
  });
  assert.match(await ready.text(), /offer_readiness_check/);
  const mail = await call("/api/chat/message", {
    ...h,
    cookie: chat.cookie,
    ip: "203.0.113.42",
    body: { text: "Please email me a follow up." },
  });
  assert.match(await mail.text(), /request_contact/);
});

test("contact requires consent and the handoff goes to houdini once", async () => {
  const h = harness({ HANDOFF_HMAC_SECRET: "secret", CHAT_HANDOFF_TO: "ada@northwind.example" });
  const chat = await openChat(h, "203.0.113.50");
  const denied = await call("/api/chat/contact", {
    ...h,
    cookie: chat.cookie,
    ip: "203.0.113.50",
    body: { name: "Ada", email: "ada@northwind.example", goal: "A faster quote", consent: false },
  });
  assert.equal(denied.status, 400);
  assert.equal(h.sent.length, 0);

  const saved = await call("/api/chat/contact", {
    ...h,
    cookie: chat.cookie,
    ip: "203.0.113.51",
    body: { name: "Ada", email: "ada@northwind.example", goal: "A faster quote", windows: "Tue morning", consent: true },
  });
  assert.equal(saved.status, 200);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].to, "houdini@abra-ca-dabra.app");
  const raw = h.sent[0].text.slice(h.sent[0].text.lastIndexOf('{"schema":"abra.chat.handoff"'));
  assert.equal(h.sent[0].signature, await signHex("secret", raw));
  const envelope = JSON.parse(raw);
  assert.equal(envelope.version, "1.0");
  assert.equal(envelope.contact.email, "ada@northwind.example");
  assert.equal(envelope.contact.windows, "Tue morning");
  assert.equal(envelope.contact.consentAt.endsWith("Z"), true);
  assert.equal(envelope.page, "/services/ai-visibility/");

  const again = await call("/api/chat/contact", {
    ...h,
    cookie: chat.cookie,
    ip: "203.0.113.52",
    body: { name: "Ada", email: "ada@northwind.example", goal: "A faster quote", windows: "Tue morning", consent: true },
  });
  assert.equal((await again.json()).duplicate, true);
  assert.equal(h.sent.length, 1);
});

test("a booking in the chat is stored and a later contact still reaches houdini", async () => {
  const h = harness({ HANDOFF_HMAC_SECRET: "secret" });
  const chat = await openChat(h, "203.0.113.60");
  const booked = await call("/api/chat/events", {
    ...h,
    cookie: chat.cookie,
    ip: "203.0.113.60",
    body: {
      kind: "booking_completed",
      externalId: "bk_1",
      startsAt: "2026-11-02T15:00:00.000Z",
      endsAt: "2026-11-02T15:30:00.000Z",
      email: "ada@northwind.example",
      name: "Ada",
    },
  });
  assert.equal(booked.status, 200);
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0].text, /bk_1/);

  const opened = await call("/api/chat/events", {
    ...h,
    cookie: chat.cookie,
    ip: "203.0.113.61",
    body: { kind: "booking_opened" },
  });
  assert.equal(opened.status, 200);
  const session = await h.deps.rooms.get(chat.id).get("session");
  assert.equal(session.bookingOpened, true);
  assert.equal(session.bookingCompleted.externalId, "bk_1");

  await call("/api/chat/contact", {
    ...h,
    cookie: chat.cookie,
    ip: "203.0.113.62",
    body: { name: "Ada", email: "ada@northwind.example", goal: "Look at quoting", consent: true },
  });
  assert.equal(h.sent.length, 2);
  assert.match(h.sent[1].text, /Look at quoting/);
  assert.match(h.sent[1].text, /bk_1/);
});

test("a failed handoff mail is retried by the idle alarm and not sent twice", async () => {
  const h = harness();
  let down = true;
  h.deps.sendHandoff = async (message) => {
    if (down) throw new Error("mail down");
    h.sent.push(message);
  };
  const chat = await openChat(h, "203.0.113.70");
  const saved = await call("/api/chat/contact", {
    ...h,
    cookie: chat.cookie,
    ip: "203.0.113.70",
    body: { name: "Ada", email: "ada@northwind.example", goal: "Quotes", consent: true },
  });
  assert.equal((await saved.json()).mailed, false);
  assert.equal(h.sent.length, 0);
  down = false;
  const early = await runAlarm(h.deps.rooms.get(chat.id), h.env, h.deps, NOW + 1000);
  assert.equal(early.sent, false);
  const sent = await runAlarm(h.deps.rooms.get(chat.id), h.env, h.deps, NOW + IDLE_MS);
  assert.equal(sent.sent, true);
  assert.equal(h.sent.length, 1);
  const repeat = await runAlarm(h.deps.rooms.get(chat.id), h.env, h.deps, NOW + IDLE_MS + 1);
  assert.equal(repeat.sent, false);
  assert.equal(h.sent.length, 1);
});

test("gateway failure still answers from the studio script", async () => {
  const text = await completeChat({
    env: { AI_GATEWAY_TOKEN: "token", CF_ACCOUNT_ID: "acct" },
    messages: [{ role: "user", text: "What would you automate first?" }],
    fetchImpl: async () => {
      throw new Error("down");
    },
  });
  assert.match(text, /most time/);
});
