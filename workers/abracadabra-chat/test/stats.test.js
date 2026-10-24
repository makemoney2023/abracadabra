import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, runAlarm } from "../src/http.js";
import { ChatStatsDO, recentWeeks, sessionRow, statsCsv, weekOf, weekSummary } from "../src/stats.js";

const NOW = Date.parse("2026-10-19T14:00:00Z"); // Monday, 10:00 in Toronto
const IDLE_MS = 15 * 60 * 1000;
const TOKEN = "t".repeat(40);

function harness(env = {}) {
  let alarms = 0;
  const deps = {
    now: () => NOW,
    limits: { messages: new Map(), sessions: new Map() },
    rooms: new Map(),
    fetchImpl: async () => { throw new Error("no network"); },
    sendHandoff: async () => {},
    hqFetch: async () => new Response(null, { status: 202 }),
    setAlarm: () => { alarms += 1; },
  };
  return { env: { CHAT_STATS_TOKEN: TOKEN, ...env }, deps, alarms: () => alarms };
}

function post(h, path, body, cookie, ip = "203.0.113.120") {
  return handleRequest(new Request(`https://abra-ca-dabra.app${path}`, {
    method: "POST",
    headers: { origin: "http://127.0.0.1:4500", "content-type": "application/json", "cf-connecting-ip": ip, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }), h.env, h.deps);
}

function stats(h, query = "", auth = `Bearer ${TOKEN}`, ip = "198.51.100.7") {
  return handleRequest(new Request(`https://abra-ca-dabra.app/api/chat/stats${query}`, {
    headers: { "cf-connecting-ip": ip, ...(auth ? { authorization: auth } : {}) },
  }), h.env, h.deps);
}

async function chat(h, page, questions, ip) {
  const opened = await post(h, "/api/chat/session", { page }, null, ip);
  const id = opened.headers.get("set-cookie").match(/abra_chat=([^;]+)/)[1];
  const cookie = `abra_chat=${id}`;
  for (const text of questions) await (await post(h, "/api/chat/message", { text, page }, cookie, ip)).text();
  return { id, cookie };
}

test("weeks are ISO weeks in Toronto time", () => {
  assert.equal(weekOf(NOW), "2026-W43");
  assert.equal(weekOf(Date.parse("2026-10-19T03:30:00Z")), "2026-W42"); // Sunday 23:30 in Toronto
  assert.equal(weekOf(Date.parse("2027-01-01T12:00:00Z")), "2026-W53");
  assert.deepEqual(recentWeeks(NOW, 3), ["2026-W41", "2026-W42", "2026-W43"]);
});

test("a session row keeps counts and flags only", () => {
  const row = sessionRow({
    id: "secret-session-id", ip: "203.0.113.9", createdAt: NOW, messageCount: 3, voiceCalls: 1, startPage: "/pricing-for-acme-corp/?ref=x",
    contact: { name: "Jane Doe", email: "jane@example.invalid", goal: "Secret plan" },
    bookingOffered: true, bookingCompleted: { externalId: "cal_1" },
    readiness: { token: "rtok", done: true, band: "forming" }, replyFailures: 1,
    messages: [
      { role: "user", text: "How much would a voice agent for our phones cost? jane@example.invalid", voice: true },
      { role: "assistant", text: "We quote after a session." },
      { role: "user", text: "Can it connect to ServiceTitan?" },
      { role: "user", text: "I finished the Readiness Check here in the chat." },
    ],
  });
  assert.deepEqual(row, {
    week: "2026-W43", questions: 3, voiceCalls: 1, voiceTurns: 1,
    topics: { Voice: 1, "AI assistants": 1 }, intents: { pricing: 1, integrations: 1 }, startPage: "other",
    bookingOffered: true, bookingOpened: false, booked: true, contact: true,
    readinessClicked: false, readinessStarted: true, readinessDone: true, readinessBand: "forming", replyFailures: 1,
    voiceSpeaker: "", auditsStarted: 0, auditsDone: 0, demos: 0, recapCards: 0, clips: 0,
  });
  const text = JSON.stringify(row);
  for (const secret of ["jane", "Jane", "Secret", "203.0.113", "secret-session-id", "rtok", "cal_1", "ServiceTitan", "acme"]) {
    assert.ok(!text.includes(secret), `row leaks ${secret}`);
  }
});

test("idle chats become one anonymous row each; the export needs the token", async () => {
  const h = harness();
  const a = await chat(h, "/services/voice-and-realtime-agents/", ["Can you answer our phone calls after hours?", "What does it cost?"], "203.0.113.121");
  await chat(h, "/", [], "203.0.113.122");
  const alarmsBefore = h.alarms();
  for (const room of h.deps.rooms.values()) await runAlarm(room, h.env, h.deps, NOW + IDLE_MS);
  assert.equal(h.alarms(), alarmsBefore, "recording stats must not re-arm the past-due alarm");
  assert.equal(h.deps.statsRows.size, 2);

  // The visitor comes back: the same row is rewritten, not added.
  await (await post(h, "/api/chat/message", { text: "Do you connect to HubSpot?" }, a.cookie, "203.0.113.121")).text();
  await runAlarm(h.deps.rooms.get(a.id), h.env, h.deps, NOW + 2 * IDLE_MS);
  assert.equal(h.deps.statsRows.size, 2);

  assert.equal((await stats(h, "", "")).status, 401);
  assert.equal((await stats(h, "", `Bearer ${"x".repeat(40)}`)).status, 401);
  assert.equal((await stats(h, `?token=${TOKEN}`, "")).status, 401, "never from the query string");
  const ok = await stats(h, "?weeks=2");
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.equal(ok.headers.get("access-control-allow-origin"), null);
  const body = await ok.json();
  assert.deepEqual(body.weeks.map((w) => w.week), ["2026-W42", "2026-W43"]);
  const week = body.weeks[1];
  assert.equal(week.chats, 2);
  assert.equal(week.chatsWithQuestions, 1);
  assert.equal(week.questions, 3);
  assert.deepEqual(week.topics, [{ name: "Voice", count: 1 }]);
  assert.deepEqual(week.intents, [{ name: "integrations", count: 1 }, { name: "pricing", count: 1 }]);
  assert.deepEqual(week.startPages, [{ name: "/", count: 1 }, { name: "/services/voice-and-realtime-agents/", count: 1 }]);
  assert.doesNotMatch(JSON.stringify(body), /HubSpot|phones|203\.0\.113/);

  const csv = await (await stats(h, "?week=2026-W43&format=csv")).text();
  assert.match(csv, /^week,chats,chatsWithQuestions,questions,/);
  assert.match(csv.split("\n")[1], /^2026-W43,2,1,3,/);
  assert.equal((await stats(h, "?week=last")).status, 400);
});

test("no token configured means no stats route; wrong guesses are rate limited", async () => {
  const off = harness({ CHAT_STATS_TOKEN: "" });
  assert.equal((await stats(off)).status, 404);
  const h = harness();
  let last;
  for (let i = 0; i < 31; i += 1) last = await stats(h, "", "Bearer nope", "198.51.100.9");
  assert.equal(last.status, 429);
});

test("CHAT_STATS_ENABLED=false records nothing", async () => {
  const h = harness({ CHAT_STATS_ENABLED: "false" });
  await chat(h, "/", ["Hi"], "203.0.113.123");
  for (const room of h.deps.rooms.values()) await runAlarm(room, h.env, h.deps, NOW + IDLE_MS);
  assert.equal(h.deps.statsRows?.size || 0, 0);
});

test("the stats Durable Object upserts, filters by week and prunes old rows", async () => {
  const { DatabaseSync } = await import("node:sqlite").catch(() => ({}));
  if (!DatabaseSync) return;
  const db = new DatabaseSync(":memory:");
  const sql = { exec: (query, ...args) => {
    const stmt = db.prepare(query);
    if (/^\s*select/i.test(query)) { const rows = stmt.all(...args); return { toArray: () => rows }; }
    stmt.run(...args);
    return { toArray: () => [] };
  } };
  const object = new ChatStatsDO({ storage: { sql } });
  const put = (id, week, now) => object.fetch(new Request("https://stats/put", { method: "POST", body: JSON.stringify({ id, now, row: { week, questions: 1 } }) }));
  await put("a", "2026-W43", NOW);
  await put("a", "2026-W43", NOW);
  await put("b", "2026-W42", NOW);
  const weeks = async (list) => (await object.fetch(new Request("https://stats/weeks", { method: "POST", body: JSON.stringify({ weeks: list }) }))).json();
  assert.equal((await weeks(["2026-W43"])).length, 1);
  assert.equal((await weeks(["2026-W42", "2026-W43"])).length, 2);
  await put("c", "2027-W30", NOW + 27 * 7 * 86400000);
  assert.equal((await weeks(["2026-W42", "2026-W43"])).length, 0);
});

test("summary and CSV for an empty week", () => {
  const empty = weekSummary("2026-W40", []);
  assert.equal(empty.chats, 0);
  assert.equal(empty.rates.bookedPct, 0);
  assert.match(statsCsv([empty]), /\n2026-W40,0,0,0,/);
});
