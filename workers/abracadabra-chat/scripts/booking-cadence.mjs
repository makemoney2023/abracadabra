#!/usr/bin/env node
// Booking-cadence check: how often the chat pitches the thirty-minute working session or the
// Readiness Check. Runs whole conversations through the real chat code (typed: handleRequest;
// voice: the realtime call with fake Flux and Aura, real model) against the live models through
// the AI Gateway. Session storage is in memory; nothing reaches HQ, mail, or production.
//   AI_GATEWAY_TOKEN=... CF_ACCOUNT_ID=... node scripts/booking-cadence.mjs --src ./src --json before.json
//   node scripts/booking-cadence.mjs --compare before.json after.json --out reports/booking-cadence.md
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };

// Same test for before and after, fixed here so both runs are counted the same way.
const OFFER = /\b(working session|readiness check|book (?:a |an |the |your |some )?(?:thirty|30|time|call|session|slot|meeting|working)|book (?:it|one)\b|book(?:ed)? right here|booking (?:calendar|form|link)|pick a (?:thirty-minute |30-minute )?time|schedule a (?:call|session|time|meeting))/i;
const hasOffer = (text) => OFFER.test(String(text || ""));

// Turns marked ask: true are explicit asks (book, price, timing, start, a person): they must get the offer.
const CONVERSATIONS = [
  { name: "Law firm, documents (typed)", turns: ["Hi, what do you do?", "Can I see some examples of your work?", "We're a 5 person law firm drowning in documents.", "How would answers from our documents work for us?", "Is our client data safe with you?", "Do you connect with Clio?"] },
  { name: "Curious about the studio (typed)", turns: ["Why do you build on Cloudflare?", "What does that mean for a small business like mine?", "What is Super Funnel?", "Tell me about the pirx.ca project.", "Do you make videos for social media?", "How does AI visibility work?"] },
  { name: "Roofing company on Custom apps (typed)", page: { path: "/services/custom-apps/", title: "Custom apps | Abracadabra" }, turns: ["What is this page about?", "We run a roofing company and writing quotes takes forever.", "Could it work with our spreadsheets?", "Who on our team would use it?", "Can we change the rules later?"] },
  { name: "Integrations (typed)", turns: ["Do you integrate with QuickBooks?", "What about Google Sheets?", "Can you show me something you've built?", "What's the LLM Leverage course?", "Do you write blog posts too?", "Thanks, that's helpful."] },
  { name: "Voice agents (voice)", voice: true, page: { path: "/services/voice-and-realtime-agents/", title: "Voice and realtime agents | Abracadabra" }, turns: ["How does this work?", "Can it answer calls after hours?", "What happens when it can't answer a question?", "Does it remember what the caller said?", "Can it use our own records?"] },
  { name: "Clinic owner (voice)", voice: true, turns: ["What kind of things do you build?", "We run a small dental clinic.", "Our front desk spends hours on reminders and rescheduling.", "Would it work with the software we already use?", "What would our staff need to learn?"] },
  { name: "Interested, then asks (typed)", turns: ["What do you build?", "We are a plumbing company with six vans.", "Dispatch is all phone calls and a whiteboard.", "How much would something like that cost?", "How long would it take?", "OK, I want to book a call."], asks: [3, 4, 5] },
];
const SINGLE_ASKS = [
  { text: "I want to book a call", voice: false },
  { text: "How much does a custom app cost?", voice: false },
  { text: "How do we get started?", voice: false },
  { text: "I'm not sure where to start.", voice: false },
  { text: "Can I talk to a person?", voice: false },
  { text: "How long does a typical project take?", voice: false },
  { text: "How much is it?", voice: true, page: { path: "/services/custom-apps/", title: "Custom apps | Abracadabra" } },
  { text: "Where should we start?", voice: true },
];

if (process.argv.includes("--compare")) {
  const i = process.argv.indexOf("--compare");
  compare(JSON.parse(readFileSync(process.argv[i + 1], "utf8")), JSON.parse(readFileSync(process.argv[i + 2], "utf8")), arg("out", ""));
  process.exit(0);
}

if (!process.env.AI_GATEWAY_TOKEN || !(process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID)) {
  console.error("Set AI_GATEWAY_TOKEN and CF_ACCOUNT_ID.");
  process.exit(2);
}
const src = resolve(arg("src", new URL("../src", import.meta.url).pathname));
const { handleRequest } = await import(pathToFileURL(`${src}/http.js`).href);
const ENV = { AI_GATEWAY_TOKEN: process.env.AI_GATEWAY_TOKEN, CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID, VOICE_ENABLED: "true", AI: { run: async () => ({}) }, CAL_LINK: "abra/30min" };
let ipCounter = 10;

class FakeSocket {
  constructor() { this.sent = []; this.listeners = {}; this.closed = false; }
  accept() {}
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  emit(type, data) { for (const fn of this.listeners[type] || []) fn({ data }); }
  send(data) { if (!this.closed) this.sent.push(data); }
  close() { this.closed = true; }
  json() { return this.sent.filter((d) => typeof d === "string").map((d) => JSON.parse(d)); }
}

function deps(sockets) {
  return {
    limits: { messages: new Map(), sessions: new Map(), calls: new Map(), passes: new Map() },
    rooms: new Map(),
    async sendHandoff() {},
    tickMs: 0,
    fillerAfterMs: 60_000,
    fetchImpl: async (url, init) => {
      if (String(url).includes("aura")) return new Response(new Uint8Array([1, 0, 2, 0]), { headers: { "content-type": "audio/mpeg" } });
      return fetch(url, init);
    },
    webSocketPair: () => { const pair = { 0: new FakeSocket(), 1: new FakeSocket() }; sockets.push(pair); return pair; },
    upgrade: () => new Response("upgraded", { status: 200 }),
    openFlux: async () => sockets.flux,
  };
}

async function openSession(d, ip, page) {
  const res = await handleRequest(new Request("https://abra-ca-dabra.app/api/chat/session", {
    method: "POST", headers: { origin: "http://127.0.0.1:4500", "content-type": "application/json", "cf-connecting-ip": ip }, body: JSON.stringify(page ? { page: page.path, title: page.title } : {}),
  }), ENV, d);
  return `abra_chat=${res.headers.get("set-cookie").match(/abra_chat=([^;]+)/)[1]}`;
}

async function typedConversation(turns, page) {
  const d = deps([]);
  const ip = `203.0.113.${ipCounter++}`;
  const cookie = await openSession(d, ip, page);
  const out = [];
  for (const text of turns) {
    const res = await handleRequest(new Request("https://abra-ca-dabra.app/api/chat/message", {
      method: "POST", headers: { origin: "https://abra-ca-dabra.app", "content-type": "application/json", "cf-connecting-ip": ip, cookie }, body: JSON.stringify({ text, ...(page ? { page: page.path, title: page.title } : {}) }),
    }), ENV, d);
    const raw = await res.text();
    const events = [...raw.matchAll(/event: (\w+)\ndata: (.*)\n\n/g)].map(([, event, data]) => ({ event, data: JSON.parse(data) }));
    const final = events.find((e) => e.event === "final")?.data.text || events.find((e) => e.event === "error")?.data.text || "";
    out.push({ user: text, reply: final, action: events.find((e) => e.event === "ui_action")?.data.action || null, error: !events.some((e) => e.event === "final") });
  }
  return out;
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function voiceConversation(turns, page) {
  const sockets = [];
  sockets.flux = new FakeSocket();
  const d = deps(sockets);
  const ip = `203.0.113.${ipCounter++}`;
  const cookie = await openSession(d, ip, page);
  const passRes = await handleRequest(new Request("https://abra-ca-dabra.app/api/chat/voice-pass", {
    method: "POST", headers: { origin: "http://127.0.0.1:4500", "content-type": "application/json", "cf-connecting-ip": ip, cookie }, body: JSON.stringify(page ? { page: page.path, title: page.title } : {}),
  }), ENV, d);
  const { pass } = await passRes.json();
  await handleRequest(new Request(`https://abra-ca-dabra.app/api/chat/realtime?pass=${pass}`, { headers: { origin: "https://abra-ca-dabra.app", "cf-connecting-ip": ip, upgrade: "websocket", cookie } }), ENV, d);
  await pause(50);
  const browser = sockets.at(-1)[1];
  const out = [];
  for (const text of turns) {
    const before = browser.json().filter((m) => m.type === "assistant").length;
    sockets.flux.emit("message", JSON.stringify({ event: "EndOfTurn", transcript: text }));
    const started = Date.now();
    let reply = null;
    while (Date.now() - started < 30_000) {
      const answers = browser.json().filter((m) => m.type === "assistant");
      if (answers.length > before) { reply = answers.at(-1); break; }
      await pause(50);
    }
    const opened = browser.json().some((m) => m.type === "ui_action" && m.action === "open_booking" && m.turn === reply?.turn);
    out.push({ user: text, reply: reply?.text || "", action: opened ? "open_booking" : reply?.action || null, error: !reply });
    await pause(300);
  }
  return out;
}

const run = { label: arg("label", "run"), src, at: new Date().toISOString(), conversations: [], asks: [] };
for (const convo of CONVERSATIONS) {
  const turns = convo.voice ? await voiceConversation(convo.turns, convo.page) : await typedConversation(convo.turns, convo.page);
  turns.forEach((t, i) => { t.ask = (convo.asks || []).includes(i); t.offer = hasOffer(t.reply); });
  run.conversations.push({ name: convo.name, voice: Boolean(convo.voice), turns });
  process.stdout.write(".");
}
for (const ask of SINGLE_ASKS) {
  const [t] = ask.voice ? await voiceConversation([ask.text], ask.page) : await typedConversation([ask.text], ask.page);
  t.ask = true;
  t.voice = Boolean(ask.voice);
  t.offer = hasOffer(t.reply) || t.action === "open_booking";
  run.asks.push(t);
  process.stdout.write(".");
}
process.stdout.write("\n");
const json = arg("json", "");
if (json) writeFileSync(json, JSON.stringify(run, null, 2));
console.log(summary(run));
setTimeout(() => process.exit(0), 100);

function summary(r) {
  // Count with this script's offer test, so saved runs are always scored the same way.
  for (const c of r.conversations) for (const t of c.turns) t.offer = hasOffer(t.reply);
  for (const t of r.asks) t.offer = hasOffer(t.reply) || t.action === "open_booking";
  const plain = r.conversations.flatMap((c) => c.turns.filter((t) => !t.ask));
  const offers = plain.filter((t) => t.offer).length;
  let backToBack = 0;
  for (const c of r.conversations) for (let i = 1; i < c.turns.length; i += 1) if (!c.turns[i].ask && c.turns[i].offer && c.turns[i - 1].offer) backToBack += 1;
  const askTurns = [...r.asks, ...r.conversations.flatMap((c) => c.turns.filter((t) => t.ask))];
  const askOffers = askTurns.filter((t) => t.offer || t.action === "open_booking").length;
  const errors = [...r.conversations.flatMap((c) => c.turns), ...r.asks].filter((t) => t.error).length;
  return { plainTurns: plain.length, offers, pct: Math.round((100 * offers) / Math.max(1, plain.length)), backToBack, askTurns: askTurns.length, askOffers, errors };
}

function compare(before, after, outPath) {
  const b = summary(before);
  const a = summary(after);
  const lines = [
    "# Booking cadence check, 2026-10-20",
    "",
    `Before: main 2fc54fd5 (run ${before.at}). After: feat/chat-booking-cadence (run ${after.at}).`,
    "Live 70B model (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) through the `abracadabra-chat` AI Gateway, run locally through the real chat code: typed turns through `handleRequest`, voice turns through the realtime call (Flux and Aura faked, model real). Sessions in memory only; nothing went to HQ, mail, or production.",
    "",
    "An offer is a reply that mentions the working session, the Readiness Check, booking a time, or the booking calendar. Explicit asks are questions about booking, cost, timing, getting started, where to start, or talking to a person.",
    "",
    "| Measure | Before | After | Target |",
    "| --- | --- | --- | --- |",
    `| Replies with an offer, in conversations that did not ask (${b.plainTurns} / ${a.plainTurns} replies) | ${b.offers} (${b.pct}%) | ${a.offers} (${a.pct}%) | about 25% or fewer |`,
    `| Back-to-back offers (two replies in a row, second one not asked for) | ${b.backToBack} | ${a.backToBack} | 0 |`,
    `| Explicit asks that got the offer (or opened the calendar) | ${b.askOffers}/${b.askTurns} | ${a.askOffers}/${a.askTurns} | 100% |`,
    `| Turns that errored | ${b.errors} | ${a.errors} | 0 |`,
    "",
    "Model output varies run to run; these are single runs.",
    "",
  ];
  const mark = (t) => `${t.offer ? "**[offer]** " : ""}${t.ask ? "_(ask)_ " : ""}`;
  for (const [label, r] of [["Before", before], ["After", after]]) {
    lines.push(`## ${label}: conversations`, "");
    for (const c of r.conversations) {
      lines.push(`### ${c.name}`, "");
      for (const t of c.turns) lines.push(`- **Visitor:** ${t.user}`, `  - **Chat:** ${mark(t)}${t.reply.replace(/\n+/g, " ")}`);
      lines.push("");
    }
    lines.push(`## ${label}: explicit asks`, "");
    for (const t of r.asks) lines.push(`- **Visitor${t.voice ? " (voice)" : ""}:** ${t.user}`, `  - **Chat:** ${t.offer ? "**[offer]** " : "**[NO OFFER]** "}${t.action ? `_(ui: ${t.action})_ ` : ""}${t.reply.replace(/\n+/g, " ")}`);
    lines.push("");
  }
  const report = lines.join("\n");
  if (outPath) writeFileSync(outPath, report);
  console.log(lines.slice(0, 14).join("\n"));
}
