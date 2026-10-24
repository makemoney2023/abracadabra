import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { auditIntent, auditLine, auditResult, checkHost, findSite, topFixes } from "../src/audit.js";
import { CLIPS, clipFor } from "../src/clips.js";
import { demoExpired, demoIntent, DEMO_ASK, DEMO_MS, DEMO_TURNS, demoOpening, demoPrompt, demoTakeaway, onDemoPage } from "../src/demo.js";
import { flag } from "../src/flags.js";
import { leadMessage } from "../src/hq.js";
import { handleRequest } from "../src/http.js";
import { recapCard, recapFacts, recapIntent } from "../src/recap.js";
import { sessionRow, statsCsv, weekSummary } from "../src/stats.js";

const NOW = 1_700_000_000_000;
const ENV = { AI_GATEWAY_TOKEN: "t", CF_ACCOUNT_ID: "acct", CHAT_AUDIT: "true", RECEPTIONIST_DEMO: "true" };

// ---------- flags ----------

test("flags: audit and demo are off unless set; recap and clips are on unless set to false", () => {
  assert.equal(flag({}, "CHAT_AUDIT"), false);
  assert.equal(flag({}, "RECEPTIONIST_DEMO"), false);
  assert.equal(flag({}, "CHAT_RECAP_CARD"), true);
  assert.equal(flag({}, "CHAT_CLIPS"), true);
  assert.equal(flag({ CHAT_AUDIT: "true" }, "CHAT_AUDIT"), true);
  assert.equal(flag({ CHAT_CLIPS: "false" }, "CHAT_CLIPS"), false);
  const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  for (const name of ["CHAT_AUDIT", "RECEPTIONIST_DEMO", "CHAT_RECAP_CARD", "CHAT_CLIPS"]) assert.match(wrangler, new RegExp(`"${name}": "true"`));
});

// ---------- mini-audit: URL guard ----------

test("audit URL guard: public hostnames only (no IPs, localhost, private names, credentials, other schemes)", () => {
  assert.deepEqual(checkHost("acme.ca"), { ok: true, host: "acme.ca" });
  assert.deepEqual(checkHost("https://www.Acme.ca/about?x=1"), { ok: true, host: "acme.ca" });
  assert.deepEqual(checkHost("http://shop.acme.co.uk:8080/"), { ok: true, host: "shop.acme.co.uk" });
  for (const bad of [
    "", "localhost", "http://localhost:3000", "foo.localhost", "127.0.0.1", "http://10.0.0.5/", "192.168.1.1", "169.254.169.254",
    "http://[::1]/", "[fd00::1]", "0x7f000001", "2130706433", "printer.local", "db.internal", "router.lan", "nas.home.arpa",
    "intranet", "acme", "ftp://acme.ca", "file:///etc/passwd", "javascript:alert(1)", "https://user:pass@acme.ca",
    "acme.123", "-bad.com", "a..b.com", "site.example", "x.test", "x.invalid", "hidden.onion", `${"a".repeat(64)}.com`,
  ]) {
    assert.equal(checkHost(bad).ok, false, `accepted ${bad}`);
  }
});

test("audit: finds a site in typed or spoken words, and only treats it as an audit when asked", () => {
  assert.equal(findSite("can you check acme.ca for me?"), "acme.ca");
  assert.equal(findSite("Scan https://www.acme.ca/services."), "https://www.acme.ca/services");
  assert.equal(findSite("our site is acme dot ca"), "acme.ca");
  assert.equal(findSite("email me at jane@acme.ca"), null);
  assert.equal(auditIntent("Can you scan acme.ca?"), "acme.ca");
  assert.equal(auditIntent("how visible is acme dot com"), "acme.com");
  assert.equal(auditIntent("acme.ca"), "acme.ca");
  assert.equal(auditIntent("our website is acme.ca"), "acme.ca");
  assert.equal(auditIntent("I read an article on nytimes.com about AI"), null);
  assert.equal(auditIntent("check abra-ca-dabra.app"), null, "our own site is not a visitor audit");
  assert.equal(auditIntent("What do you build?"), null);
});

const PAYLOAD = {
  domain: "acme.ca",
  status: "complete",
  scoreTotal: 54.4,
  findings: [
    { code: "MISSING_FAQ_SCHEMA", severity: "info", passed: false, message: "No FAQ schema" },
    { code: "NO_ORG_SCHEMA", severity: "warn", passed: false, message: "Missing Organization/LocalBusiness schema" },
    { code: "SITEMAP_MISSING", severity: "warn", passed: false, message: "No sitemap" },
    { code: "MISSING_LLMS_TXT", severity: "critical", passed: false, message: "No llms.txt" },
    { code: "NO_JSON_LD_HOME", severity: "critical", passed: true, message: "ok" },
  ],
};

test("audit: two fixes in plain words, biggest first, from the scanner's own findings", () => {
  const fixes = topFixes(PAYLOAD.findings);
  assert.deepEqual(fixes.map((f) => f.code), ["MISSING_LLMS_TXT", "NO_ORG_SCHEMA"]);
  assert.match(fixes[0].text, /llms\.txt file/);
  assert.deepEqual(topFixes([{ code: "NEW_CODE", severity: "warn", passed: false, message: "Something  new\nhere" }]), [{ code: "NEW_CODE", text: "Something new here" }]);
  const result = auditResult({}, "tok123", PAYLOAD);
  assert.equal(result.score, 54);
  assert.equal(result.reportUrl, "https://schema.abra-ca-dabra.app/scan/tok123");
  assert.match(auditLine(result), /^acme\.ca scored 54 out of 100 for AI search visibility\. The two biggest fixes: Add an llms\.txt/);
  assert.match(auditLine(auditResult({}, "t", { domain: "ok.ca", scoreTotal: 100, findings: [] })), /found nothing big to fix/);
});

// ---------- mini-audit: through the chat ----------

function fakeScanner({ finishAfter = 2, start = 201, fail = false } = {}) {
  const calls = [];
  let reads = 0;
  const handler = async (request) => {
    const url = new URL(request.url);
    const body = request.method === "POST" ? await request.json() : null;
    calls.push({ method: request.method, path: url.pathname, host: url.host, body });
    if (request.method === "POST" && url.pathname === "/api/scans") {
      if (start !== 201) return Response.json({ error: "Rate limit exceeded" }, { status: start });
      return Response.json({ token: `scan${calls.length}`, id: "id", status: "queued" }, { status: 201 });
    }
    const match = url.pathname.match(/^\/api\/scans\/([^/]+)$/);
    if (!match) return Response.json({ error: "Not found" }, { status: 404 });
    reads += 1;
    if (fail) return Response.json({ ...PAYLOAD, status: "failed", findings: [] });
    if (reads < finishAfter) return Response.json({ domain: "acme.ca", status: "running", progress: { pagesScanned: 3 } });
    return Response.json(PAYLOAD);
  };
  return { calls, handler };
}

function sse(text) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(c) {
      c.enqueue(encoder.encode(`data: ${JSON.stringify({ response: text })}\n\n`));
      c.enqueue(encoder.encode("data: [DONE]\n\n"));
      c.close();
    },
  }), { headers: { "content-type": "text/event-stream" } });
}

function harness({ env = ENV, scanner = fakeScanner(), reply = "We build software around your work.", hq } = {}) {
  const llm = [];
  const h = {
    env: { ...env },
    scanner,
    llm,
    deps: {
      now: () => NOW,
      limits: { messages: new Map(), sessions: new Map() },
      rooms: new Map(),
      sendHandoff: async () => {},
      readinessFetch: scanner.handler,
      auditTimeoutMs: 200,
      fetchImpl: async (url, init) => {
        llm.push(JSON.parse(init.body));
        return sse(typeof reply === "function" ? reply(llm.length) : reply);
      },
      hqFetch: hq,
    },
  };
  return h;
}

async function open(h, ip = "203.0.113.90", page = "/services/ai-visibility/") {
  const opened = await handleRequest(new Request("https://abra-ca-dabra.app/api/chat/session", {
    method: "POST", headers: { origin: "http://127.0.0.1:4500", "content-type": "application/json", "cf-connecting-ip": ip }, body: JSON.stringify({ page }),
  }), h.env, h.deps);
  return `abra_chat=${opened.headers.get("set-cookie").match(/abra_chat=([^;]+)/)[1]}`;
}

async function say(h, cookie, text, ip = "203.0.113.90", page) {
  const response = await handleRequest(new Request("https://abra-ca-dabra.app/api/chat/message", {
    method: "POST", headers: { origin: "https://abra-ca-dabra.app", "content-type": "application/json", "cf-connecting-ip": ip, cookie }, body: JSON.stringify({ text, ...(page ? { page } : {}) }),
  }), h.env, h.deps);
  const raw = await response.text();
  return [...raw.matchAll(/event: (\w+)\ndata: (.*)\n\n/g)].map(([, event, data]) => ({ event, data: JSON.parse(data) }));
}

const audit = (h, cookie, body, ip = "203.0.113.90") => handleRequest(new Request("https://abra-ca-dabra.app/api/chat/audit", {
  method: "POST", headers: { origin: "https://abra-ca-dabra.app", "content-type": "application/json", "cf-connecting-ip": ip, cookie }, body: JSON.stringify(body),
}), h.env, h.deps).then(async (r) => ({ status: r.status, body: await r.json() }));

const session = (h) => [...h.deps.rooms.values()][0].get("session");

const finalText = (events) => events.find((e) => e.event === "final")?.data.text;
const cards = (events) => events.filter((e) => e.event === "card").map((e) => e.data);

test("mini-audit: a named site gets an offer card (no scan yet); the tap starts it; polls end in two fixes and the report link", async () => {
  const h = harness();
  const cookie = await open(h);
  const events = await say(h, cookie, "Can you check acme.ca for me?");
  assert.match(finalText(events), /I can scan acme\.ca with our Schema scanner/);
  assert.deepEqual(cards(events), [{ kind: "audit_offer", host: "acme.ca" }]);
  assert.equal(h.llm.length, 0, "a fixed line, no model call");
  assert.equal(h.scanner.calls.length, 0, "nothing runs before the visitor taps");

  const started = await audit(h, cookie, { op: "start", host: "acme.ca" });
  assert.equal(started.status, 200);
  assert.equal(started.body.host, "acme.ca");
  assert.deepEqual(h.scanner.calls[0], { method: "POST", path: "/api/scans", host: "check.abra-ca-dabra.app", body: { url: "acme.ca", source: "public" } });

  const first = await audit(h, cookie, { op: "status", token: started.body.token });
  assert.equal(first.body.status, "running");
  const done = await audit(h, cookie, { op: "status", token: started.body.token });
  assert.equal(done.body.status, "complete");
  assert.equal(done.body.result.score, 54);
  assert.equal(done.body.result.fixes.length, 2);
  assert.equal(done.body.result.reportUrl, `https://schema.abra-ca-dabra.app/scan/${started.body.token}`);
  // The model sees the outcome on the next turn, and the HQ recap carries it.
  const s = await session(h);
  assert.match(s.messages.at(-1).text, /^acme\.ca scored 54 out of 100/);
  assert.ok(recapFacts(s).some((line) => /^Mini-audit in chat: acme\.ca scored 54/.test(line)));
  // A repeat poll reads the stored result; the scanner is not asked again.
  const reads = h.scanner.calls.length;
  assert.equal((await audit(h, cookie, { op: "status", token: started.body.token })).body.result.score, 54);
  assert.equal(h.scanner.calls.length, reads);
});

test("mini-audit: refuses private hosts, caps scans per chat and per network, and fails gracefully", async () => {
  const h = harness();
  const cookie = await open(h);
  assert.match(finalText(await say(h, cookie, "scan localhost.localhost please")), /only scan a public website/);
  assert.equal((await audit(h, cookie, { op: "start", host: "http://169.254.169.254/latest" })).status, 400);
  assert.equal((await audit(h, cookie, { op: "start", host: "127.0.0.1" })).status, 400);
  assert.equal((await audit(h, cookie, { op: "start", host: "one.ca" })).status, 200);
  assert.equal((await audit(h, cookie, { op: "start", host: "one.ca" })).body.resumed, true, "same site resumes, not a new scan");
  assert.equal((await audit(h, cookie, { op: "start", host: "two.ca" })).status, 200);
  const third = await audit(h, cookie, { op: "start", host: "three.ca" });
  assert.equal(third.status, 429);
  assert.match(third.body.fallbackUrl, /^https:\/\/schema\.abra-ca-dabra\.app/);
  assert.match(finalText(await say(h, cookie, "and scan four.ca")), /That's the 2 scans this chat can run/);
  assert.equal(h.scanner.calls.filter((c) => c.method === "POST").length, 2);

  // Six starts per network per hour, across chats.
  const h2 = harness();
  let last = 0;
  for (let i = 0; i < 7; i += 1) {
    const c = await open(h2, `192.0.2.${i}`);
    last = (await audit(h2, c, { op: "start", host: `site${i}.ca` }, "198.51.100.77")).status;
  }
  assert.equal(last, 429);

  // The scanner's own per-domain limit, a scanner that is down, and a scan that failed.
  const limited = harness({ scanner: fakeScanner({ start: 429 }) });
  const c1 = await open(limited);
  const r1 = await audit(limited, c1, { op: "start", host: "acme.ca" });
  assert.equal(r1.status, 429);
  assert.match(r1.body.error, /three scans for today/);
  const down = harness({ scanner: { calls: [], handler: () => new Promise(() => {}) } });
  const c2 = await open(down);
  const r2 = await audit(down, c2, { op: "start", host: "acme.ca" });
  assert.equal(r2.status, 502, "a hung scanner times out");
  assert.match(r2.body.error, /not answering/);
  const failed = harness({ scanner: fakeScanner({ fail: true }) });
  const c3 = await open(failed);
  const t = (await audit(failed, c3, { op: "start", host: "acme.ca" })).body.token;
  const r3 = await audit(failed, c3, { op: "status", token: t });
  assert.equal(r3.body.status, "failed");
  assert.match(r3.body.reportUrl, /\/scan\//);
  assert.equal((await audit(failed, c3, { op: "status", token: "someone-elses-token" })).status, 404, "only this chat's scans");
});

test("mini-audit: off by flag, the chat answers normally and the route is closed", async () => {
  const h = harness({ env: { ...ENV, CHAT_AUDIT: "false" } });
  const cookie = await open(h);
  const events = await say(h, cookie, "Can you check acme.ca for me?");
  assert.equal(cards(events).filter((c) => c.kind === "audit_offer").length, 0);
  assert.equal(h.llm.length, 1);
  assert.equal((await audit(h, cookie, { op: "start", host: "acme.ca" })).status, 404);
  assert.equal(h.scanner.calls.length, 0);
});

// ---------- receptionist demo (units; the call itself is in voice.test.js) ----------

test("demo: intents, page, time box, and the role's rules", () => {
  assert.equal(demoIntent("Sure, start the demo"), "start");
  assert.equal(demoIntent("can you be my receptionist?"), "start");
  assert.equal(demoIntent("Yes please, the demo"), "start");
  assert.equal(demoIntent("stop demo"), "stop");
  assert.equal(demoIntent("Stop."), "stop");
  assert.equal(demoIntent("OK end the role play"), "stop");
  assert.equal(demoIntent("What does a voice agent cost?"), null);
  assert.equal(onDemoPage("/services/voice-and-realtime-agents/"), true);
  assert.equal(onDemoPage("/services/voice-and-realtime-agents?utm=x"), true);
  assert.equal(onDemoPage("/services/custom-apps/"), false);
  assert.equal(demoExpired({ active: true, startedAt: NOW, turns: 0 }, NOW + DEMO_MS - 1), false);
  assert.equal(demoExpired({ active: true, startedAt: NOW, turns: 0 }, NOW + DEMO_MS), true);
  assert.equal(demoExpired({ active: true, startedAt: NOW, turns: DEMO_TURNS }, NOW), true);
  assert.match(demoOpening({ industry: "dental clinic" }), /^Okay, demo mode: for two minutes I'm the receptionist at a dental clinic\. Please don't share real personal details, and say stop demo/);
  assert.match(demoOpening({}), /a local business/);
  assert.match(demoTakeaway({ industry: "law firm" }), /^That's the end of the demo\. For a law firm, the real receptionist would answer from your own records/);
  const prompt = demoPrompt({ industry: "dental clinic" });
  assert.match(prompt, /Never take a real booking or payment/);
  assert.match(prompt, /health card, insurance, symptoms, medical history or card numbers/);
  for (const ask of ["Can I get your date of birth?", "What's your health card number?", "What symptoms are you having?", "I'll take a payment now.", "I've booked you in for Tuesday.", "Can I get your phone number?", "Which insurance provider do you have?", "I've put you down for 9 am tomorrow.", "Let me pencil you in for Friday.", "You're all booked for Tuesday."]) {
    assert.ok(DEMO_ASK.test(ask), `not dropped: ${ask}`);
  }
  for (const fine of ["We have openings most weekdays.", "In the real system I'd book that into your calendar.", "Happy to help with that."]) {
    assert.ok(!DEMO_ASK.test(fine), `dropped: ${fine}`);
  }
});

// ---------- recap card ----------

test("recap card: what the visitor told us plus a suggested first build from the site's own lines", () => {
  const s = {
    visitor: { industry: "dental clinic", size: "6-person", role: "office manager", tools: ["Dentrix"], pain: "we miss calls at lunch and after hours" },
    messages: [{ role: "user", text: "we miss calls at lunch and after hours" }],
    audits: [{ line: "acme.ca scored 54 out of 100 for AI search visibility." }],
  };
  const card = recapCard(s);
  assert.equal(card.kind, "recap");
  assert.deepEqual(card.heard, [
    "You work at a dental clinic (6-person), as an office manager.",
    "You use Dentrix.",
    "The problem: \"we miss calls at lunch and after hours\"",
    "Mini-audit: acme.ca scored 54 out of 100 for AI search visibility.",
  ]);
  assert.match(card.build, /^Voice\. Callers hear an answer from your records/);
  assert.equal(card.buildPath, "/services/voice-and-realtime-agents/");
  assert.ok(card.notes.length <= 500);
  assert.match(card.notes, /^Recap from the website chat\. Heard: .* Suggested first build: Voice\.$/);
  assert.equal(recapCard({ visitor: {}, messages: [{ role: "user", text: "hi" }] }), null, "nothing known, no card");
  assert.equal(recapIntent("can you recap?"), true);
  assert.equal(recapIntent("What have you got so far? sum it up"), true);
  assert.equal(recapIntent("What does it cost?"), false);
  // Demo turns are role-play: they never feed the recap.
  assert.equal(recapCard({ visitor: {}, messages: [{ role: "user", text: "I need a crm", demo: true }] }), null);
});

test("recap card: shown at goodbye and on request, with the visitor record in the HQ recap and no contact details", async () => {
  const h = harness({ env: { ...ENV, CHAT_AUDIT: "false" } });
  const cookie = await open(h);
  await say(h, cookie, "We're a 6-person dental clinic and we use Dentrix. Honestly we miss calls at lunch, call it jane@acme.ca or 416-555-0100.");
  const asked = await say(h, cookie, "Can you recap what you heard?");
  assert.match(finalText(asked), /^Here's what I heard so far, in the card below/);
  const card = cards(asked).find((c) => c.kind === "recap");
  assert.ok(card);
  assert.match(card.heard.join(" "), /dental clinic/);
  assert.ok(!/jane@|416-555/.test(JSON.stringify(card)), "no contact details in the card");
  const bye = await say(h, cookie, "Thanks, bye");
  assert.ok(cards(bye).some((c) => c.kind === "recap"), "goodbye shows it");
  const again = await say(h, cookie, "bye for real");
  assert.ok(!cards(again).some((c) => c.kind === "recap"), "goodbye shows it once");
  const s = await session(h);
  const lead = leadMessage(s, recapFacts(s).join(" "));
  assert.match(lead, /Visitor: works in dental clinic \(6-person\); uses Dentrix; said: /);

  const off = harness({ env: { ...ENV, CHAT_RECAP_CARD: "false" } });
  const c2 = await open(off);
  await say(off, c2, "We're a dental clinic and we miss calls at lunch.");
  assert.ok(!cards(await say(off, c2, "thanks, bye")).some((c) => c.kind === "recap"));
});

// ---------- case-study film cards ----------

test("clips: only films that exist on the Films page, each with its caption, thumbnail and case-study page", () => {
  const films = readFileSync(new URL("../../../scrollcraft/builds/abracadabra-ai/films.html", import.meta.url), "utf8");
  for (const clip of CLIPS) {
    assert.ok(films.includes(`assets/films/${clip.id}.mp4`), `${clip.id} video on /films.html`);
    assert.ok(films.includes(`assets/films/thumbs/${clip.id}.jpg`), `${clip.id} thumbnail on /films.html`);
    assert.ok(films.includes(clip.caption), `${clip.id} caption is the Films page's own`);
    const page = readFileSync(new URL(`../../../scrollcraft/builds/abracadabra-ai${clip.page}index.html`, import.meta.url), "utf8");
    assert.ok(page.length > 0);
  }
  const card = clipFor("We built the StrongFoam CRM for a spray foam contractor. See https://abra-ca-dabra.app/portfolio/strongfoam-crm/.");
  assert.deepEqual(card, {
    kind: "clip", id: "strongfoam-erp-demo", title: "StrongFoam CRM/ERP: lead to closeout",
    caption: "One job from inbound email to estimate, schedule, field notes, and closeout, in 3 minutes.",
    poster: "/assets/films/thumbs/strongfoam-erp-demo.jpg", src: "/assets/films/strongfoam-erp-demo.mp4",
    page: "/portfolio/strongfoam-crm/", films: "/films.html",
  });
  assert.equal(clipFor("We built the StrongFoam CRM.", ["strongfoam-erp-demo"]), null, "once per chat");
  assert.equal(clipFor("We build custom apps."), null);
  assert.equal(clipFor("Super Funnel is our sales app.").id, "superfunnel-getting-started");
});

test("clips: a reply that cites a case study gets one film card, once per chat; off by flag", async () => {
  const h = harness({ reply: "We built the StrongFoam CRM, which runs a job from lead to closeout." });
  const cookie = await open(h);
  const first = await say(h, cookie, "Show me something you built");
  assert.deepEqual(cards(first).map((c) => c.id), ["strongfoam-erp-demo"]);
  const second = await say(h, cookie, "Tell me more about it");
  assert.equal(cards(second).length, 0);
  const off = harness({ env: { ...ENV, CHAT_CLIPS: "false" }, reply: "We built the StrongFoam CRM." });
  const c2 = await open(off);
  assert.equal(cards(await say(off, c2, "Show me something")).length, 0);
});

// ---------- stats ----------

test("stats: the voice used, audits, demos, recap cards and film cards are counted, never the words", () => {
  const base = { createdAt: NOW, messageCount: 2, voiceCalls: 1, messages: [] };
  const a = sessionRow({ ...base, voiceSpeaker: "thalia", audits: [{ host: "secret-client.ca", token: "tok", result: {} }], demo: { runs: 1 }, recapShown: 1, clipsShown: ["schema-home-scan"] });
  assert.equal(a.voiceSpeaker, "thalia");
  assert.equal(a.auditsStarted, 1);
  assert.equal(a.auditsDone, 1);
  assert.equal(a.demos, 1);
  assert.equal(a.recapCards, 1);
  assert.equal(a.clips, 1);
  assert.ok(!JSON.stringify(a).includes("secret-client"));
  assert.equal(sessionRow({ ...base, voiceSpeaker: "<script>" }).voiceSpeaker, "");
  const b = sessionRow({ ...base, voiceSpeaker: "luna" });
  const week = weekSummary(a.week, [a, b, sessionRow({ ...base, voiceCalls: 0 })]);
  assert.deepEqual(week.voiceSpeakers, [{ name: "luna", count: 1 }, { name: "thalia", count: 1 }]);
  assert.equal(week.auditsStarted, 1);
  assert.equal(week.demos, 1);
  const csv = statsCsv([week]);
  assert.match(csv.split("\n")[0], /auditsStarted,auditsDone,demos,recapCards,clips,.*voiceSpeakers$/);
  assert.match(csv.split("\n")[1], /"luna:1; thalia:1"$/);
});
