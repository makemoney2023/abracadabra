import assert from "node:assert/strict";
import test from "node:test";
import { signHex } from "../src/handoff.js";
import { handleRequest, runAlarm } from "../src/http.js";
import { hqLeadBody, postLeadToHq } from "../src/hq.js";

const NOW = 1_700_000_000_000;
const IDLE_MS = 15 * 60 * 1000;
const HQ = { HANDOFF_INTAKE_ORIGIN: "https://hq.test/", PROJECT_INQUIRY_SIGNING_SECRET: "test-signing-secret" };

function harness(env = {}) {
  const posts = [];
  let status = 202;
  const deps = {
    now: () => NOW,
    limits: { messages: new Map(), sessions: new Map() },
    rooms: new Map(),
    fetchImpl: async () => { throw new Error("no network"); },
    sendHandoff: async () => {},
    hqFetch: async (url, init) => {
      posts.push({ url, init });
      return new Response(null, { status });
    },
  };
  return { env, deps, posts, setStatus: (next) => { status = next; } };
}

function call(path, { body, cookie, ip = "203.0.113.10", env, deps, origin = "https://abra-ca-dabra.app" }) {
  return handleRequest(new Request(`https://abra-ca-dabra.app${path}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", "cf-connecting-ip": ip, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }), env, deps);
}

async function openChat(h, ip) {
  const response = await call("/api/chat/session", { ...h, ip, origin: "http://127.0.0.1:4500", body: { page: "/services/voice-and-realtime-agents/" } });
  const id = response.headers.get("set-cookie").match(/abra_chat=([^;]+)/)[1];
  return { cookie: `abra_chat=${id}`, id };
}

test("a consented chat note becomes one signed project-inquiry lead on HQ", async () => {
  const h = harness({ ...HQ });
  const chat = await openChat(h, "203.0.113.80");
  const saved = await call("/api/chat/contact", {
    ...h, cookie: chat.cookie, ip: "203.0.113.80",
    body: { name: "Test Visitor", email: "test.visitor@example.invalid", goal: "A voice agent for after-hours calls", windows: "Tue pm", consent: true },
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).hq, true);
  assert.equal(h.posts.length, 1);
  const { url, init } = h.posts[0];
  assert.equal(url, "https://hq.test/api/intake/project-inquiry");
  assert.equal(init.headers["x-intake-timestamp"], String(NOW));
  assert.equal(init.headers["x-intake-signature"], await signHex(HQ.PROJECT_INQUIRY_SIGNING_SECRET, init.body));
  const body = JSON.parse(init.body);
  assert.equal(body.external_id, `chat_${chat.id}`);
  assert.equal(body.email, "test.visitor@example.invalid");
  assert.equal(body.name, "Test Visitor");
  assert.equal(body.need, "Website chat");
  assert.equal(body.page, "/services/voice-and-realtime-agents/");
  assert.match(body.message, /^From the website chat/);
  assert.match(body.message, /What they need: A voice agent/);
  assert.match(body.message, /Times that work: Tue pm/);

  // Saving the note again does not post a second lead.
  await call("/api/chat/contact", { ...h, cookie: chat.cookie, ip: "203.0.113.81", body: { name: "Test Visitor", email: "test.visitor@example.invalid", goal: "Changed", consent: true } });
  assert.equal(h.posts.length, 1);
});

test("no consent, no lead; no config, no post", async () => {
  const h = harness({ ...HQ });
  const chat = await openChat(h, "203.0.113.82");
  const refused = await call("/api/chat/contact", { ...h, cookie: chat.cookie, ip: "203.0.113.82", body: { name: "A", email: "a@example.invalid", consent: false } });
  assert.equal(refused.status, 400);
  assert.equal(h.posts.length, 0);

  const bare = harness({});
  const other = await openChat(bare, "203.0.113.83");
  const saved = await call("/api/chat/contact", { ...bare, cookie: other.cookie, ip: "203.0.113.83", body: { name: "A", email: "a@example.invalid", consent: true } });
  assert.equal((await saved.json()).hq, false);
  assert.equal(bare.posts.length, 0);
});

test("HQ down: the idle alarm retries, then stops after a success", async () => {
  const h = harness({ ...HQ });
  h.setStatus(503);
  const chat = await openChat(h, "203.0.113.84");
  const saved = await call("/api/chat/contact", { ...h, cookie: chat.cookie, ip: "203.0.113.84", body: { name: "A", email: "a@example.invalid", consent: true } });
  assert.equal((await saved.json()).hq, false);
  h.setStatus(202);
  const room = h.deps.rooms.get(chat.id);
  const retried = await runAlarm(room, h.env, h.deps, NOW + IDLE_MS);
  assert.equal(retried.hq, true);
  assert.equal(h.posts.length, 2);
  assert.equal(JSON.parse(h.posts[0].init.body).external_id, JSON.parse(h.posts[1].init.body).external_id);
  await runAlarm(room, h.env, h.deps, NOW + 3 * IDLE_MS);
  assert.equal(h.posts.length, 2);
});

test("lead message stays under HQ's 4000-char limit and keeps the latest turns", () => {
  const messages = Array.from({ length: 40 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", text: `turn ${index} ${"x".repeat(200)}` }));
  const body = hqLeadBody({ id: "s1", contact: { name: "A", email: "a@example.invalid" }, messages, page: "/" }, NOW);
  assert.ok(body.message.length <= 4000);
  assert.match(body.message, /turn 39/);
  assert.doesNotMatch(body.message, /turn 0 /);
});

test("postLeadToHq never throws on a network error", async () => {
  const session = { id: "s2", contact: { email: "a@example.invalid" }, messages: [] };
  const result = await postLeadToHq(session, HQ, { now: NOW, fetchImpl: async () => { throw new TypeError("down"); } });
  assert.deepEqual(result, { posted: false, reason: "network" });
  assert.equal(session.hqLeadSent, undefined);
});
