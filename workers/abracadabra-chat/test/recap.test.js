import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest } from "../src/http.js";
import { buildRecap, recapFacts, recapSummary } from "../src/recap.js";

const NOW = 1_700_000_000_000;
const HQ = { HANDOFF_INTAKE_ORIGIN: "https://hq.test", PROJECT_INQUIRY_SIGNING_SECRET: "test-signing-secret" };
const GATEWAY = { AI_GATEWAY_TOKEN: "t", CF_ACCOUNT_ID: "acct" };

const session = (over = {}) => ({
  id: "s1",
  page: "/services/voice-and-realtime-agents/",
  messageCount: 3,
  messages: [
    { role: "user", text: "We run a plumbing company and miss calls after hours.", voice: true },
    { role: "assistant", text: "A voice agent can answer from your records." },
    { role: "user", text: "Could it book jobs into our CRM? We want it before spring." },
    { role: "assistant", text: "Yes, that is a custom app plus voice." },
  ],
  ...over,
});

test("facts come from the session: topics, voice, readiness, page, count", () => {
  const facts = recapFacts(session({ readiness: { done: true, band: "ready", bandLabel: "Ready", pressures: ["Answers have to wait for two or three busy experts."] } }));
  assert.deepEqual(facts, [
    "Asked about: Voice, Custom apps.",
    "Readiness Check in chat: Ready; slows down at: Answers have to wait for two or three busy experts.",
    "Spoke by voice (1 turn).",
    "Started on /services/voice-and-realtime-agents/.",
    "3 questions asked.",
  ]);
});

test("the summary uses the small model with its own prompt, and contact details are masked", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return Response.json({ result: { response: "Plumbing company missing after-hours calls; wants a voice agent that books jobs into their CRM before spring. Reach them at joe@plumb.example." } });
  };
  const text = await recapSummary(session(), GATEWAY, { fetchImpl });
  assert.match(calls[0].url, /llama-3\.1-8b-instruct-fast$/);
  assert.match(calls[0].body.messages[0].content, /internal note for a small studio's sales team/);
  assert.match(calls[0].body.messages[1].content, /Visitor: We run a plumbing company/);
  assert.equal(calls[0].body.max_tokens, 120);
  assert.match(text, /^Plumbing company missing after-hours calls/);
  assert.equal(text.includes("joe@plumb.example"), false);
  assert.match(text, /\[email\]/);
});

test("a slow or failing model leaves the facts only; AI_RECAP_MODEL=none skips the call", async () => {
  const slow = () => new Promise((resolve) => setTimeout(() => resolve(Response.json({ result: { response: "late" } })), 200));
  const recap = await buildRecap(session(), GATEWAY, { fetchImpl: slow, timeoutMs: 30 });
  assert.match(recap, /^Asked about: Voice, Custom apps\./);
  let called = false;
  await recapSummary(session(), { ...GATEWAY, AI_RECAP_MODEL: "none" }, { fetchImpl: async () => { called = true; } });
  assert.equal(called, false);
});

test("the recap rides on the HQ lead message", async () => {
  const posts = [];
  const llm = [];
  const deps = {
    now: () => NOW,
    limits: { messages: new Map(), sessions: new Map() },
    rooms: new Map(),
    sendHandoff: async () => {},
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      llm.push(body);
      if (body.messages[0].content.includes("internal note")) return Response.json({ result: { response: "Wants a voice agent for after-hours calls." } });
      return Response.json({ result: { response: "A voice agent can answer from your records." } });
    },
    hqFetch: async (url, init) => { posts.push(JSON.parse(init.body)); return new Response(null, { status: 202 }); },
  };
  const env = { ...HQ, ...GATEWAY };
  const req = (path, body, cookie) => handleRequest(new Request(`https://abra-ca-dabra.app${path}`, {
    method: "POST", headers: { origin: "http://127.0.0.1:4500", "content-type": "application/json", "cf-connecting-ip": "203.0.113.90", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
  }), env, deps);
  const opened = await req("/api/chat/session", { page: "/services/voice-and-realtime-agents/" });
  const cookie = `abra_chat=${opened.headers.get("set-cookie").match(/abra_chat=([^;]+)/)[1]}`;
  await (await req("/api/chat/message", { text: "Can you answer our phone after hours?" }, cookie)).text();
  const saved = await req("/api/chat/contact", { name: "Test Visitor", email: "test.visitor@example.invalid", goal: "After-hours calls", consent: true }, cookie);
  assert.equal((await saved.json()).hq, true);
  assert.equal(posts.length, 1);
  assert.match(posts[0].message, /\nRecap: Wants a voice agent for after-hours calls\. Asked about: Voice\. Started on \/services\/voice-and-realtime-agents\/\. 1 question asked\.\n/);
  assert.ok(posts[0].message.length <= 3800);
});
