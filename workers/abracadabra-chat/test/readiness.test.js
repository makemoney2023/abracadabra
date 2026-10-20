import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest } from "../src/http.js";
import { READINESS } from "../src/readiness-questions.js";
import { stepView } from "../src/readiness.js";

// A stand-in for check.abra-ca-dabra.app that follows the check's own step order
// (readiness-check/src/lib/assessment/steps.ts): pressure, a severity per pressure, scored questions, G04, about.
function fakeCheck() {
  const rows = new Map();
  const calls = [];
  const order = (answers) => {
    const steps = ["pressure", ...(answers.pressure || []).map((c) => `severity:${c}`)];
    for (const [id, q] of Object.entries(READINESS.questions)) if (id !== "pressure" && id !== "G04" && !id.startsWith("Q") && q) steps.push(id);
    steps.push("G04", "Q01", "Q02", "Q03", "Q04");
    return steps;
  };
  const handler = async (request) => {
    const url = new URL(request.url);
    const body = request.method === "GET" ? null : await request.json().catch(() => null);
    calls.push({ method: request.method, path: url.pathname, body, ip: request.headers.get("x-forwarded-for"), host: url.host });
    if (request.method === "POST" && url.pathname === "/api/assessments") {
      const token = `tok${rows.size + 1}xxxxxxxxxxxxxxxxxxxx`;
      rows.set(token, { answers: {}, status: "in_progress" });
      return Response.json({ token, configVersion: "v1", firstStep: "pressure" }, { status: 201 });
    }
    const match = url.pathname.match(/^\/api\/assessments\/([^/]+)(\/complete)?$/);
    const row = match && rows.get(match[1]);
    if (!row) return Response.json({ error: "Check not found" }, { status: 404 });
    if (match[2]) {
      row.status = "completed";
      return Response.json({ ok: true, band: "forming" });
    }
    if (body.stepId === "G04" && !/\./.test(body.answer)) return Response.json({ error: "Invalid answer", details: "Enter a full domain like example.com" }, { status: 400 });
    row.answers[body.stepId] = body.answer;
    const steps = order(row.answers);
    return Response.json({ ok: true, nextStep: steps[steps.indexOf(body.stepId) + 1] || "gate" });
  };
  return { rows, calls, handler };
}

function harness(check) {
  return {
    env: {},
    deps: { limits: { messages: new Map(), sessions: new Map() }, rooms: new Map(), async sendHandoff() {}, readinessFetch: check.handler },
  };
}

async function openChat(h, ip = "203.0.113.70") {
  const response = await handleRequest(new Request("https://abra-ca-dabra.app/api/chat/session", {
    method: "POST", headers: { origin: "http://127.0.0.1:4500", "content-type": "application/json", "cf-connecting-ip": ip }, body: "{}",
  }), h.env, h.deps);
  return `abra_chat=${response.headers.get("set-cookie").match(/abra_chat=([^;]+)/)[1]}`;
}

const post = (h, cookie, body, ip = "203.0.113.70") => handleRequest(new Request("https://abra-ca-dabra.app/api/chat/readiness", {
  method: "POST", headers: { origin: "https://abra-ca-dabra.app", "content-type": "application/json", "cf-connecting-ip": ip, cookie }, body: JSON.stringify(body),
}), h.env, h.deps).then(async (r) => ({ status: r.status, body: await r.json() }));

function pick(step) {
  if (step.kind === "multi_select") return ["P02", "P05"];
  if (step.kind === "severity") return 2;
  if (step.kind === "single_select") return step.options[1].value;
  if (step.kind === "url") return "northwind.example";
  return step.id === "Q03" ? "Trades" : "";
}

test("the whole check runs in the chat against the check's API and ends with a real report link", async () => {
  const check = fakeCheck();
  const h = harness(check);
  const cookie = await openChat(h);
  let res = await post(h, cookie, { op: "start" });
  assert.equal(res.status, 200);
  assert.equal(res.body.step.id, "pressure");
  assert.equal(res.body.step.prompt, "Where does the work slow down?");
  assert.equal(res.body.step.options.length, 12);
  assert.deepEqual(check.calls[0].body.utm, { utm_source: "chat", utm_medium: "website-chat", chat_session_id: check.calls[0].body.utm.chat_session_id });
  assert.equal(check.calls[0].host, "check.abra-ca-dabra.app");
  assert.equal(check.calls[0].ip, "203.0.113.70");
  const seen = [];
  while (res.body.step) {
    seen.push(res.body.step.id);
    res = await post(h, cookie, { op: "answer", stepId: res.body.step.id, answer: pick(res.body.step) });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  }
  assert.deepEqual(seen.slice(0, 4), ["pressure", "severity:P02", "severity:P05", "R01"]);
  assert.equal(seen.length, 19);
  assert.equal(res.body.done, true);
  assert.equal(res.body.band.label, "Forming");
  assert.equal(res.body.reportUrl, "https://check.abra-ca-dabra.app/check/tok1xxxxxxxxxxxxxxxxxxxx");
  assert.ok(check.calls.some((c) => c.path.endsWith("/complete")));
  // Starting again shows the finished result instead of a new check.
  const again = await post(h, cookie, { op: "start" });
  assert.equal(again.body.done, true);
  assert.equal(check.rows.size, 1);
});

test("a bad answer is explained and the same question stays; stale or unknown answers are refused", async () => {
  const check = fakeCheck();
  const h = harness(check);
  const cookie = await openChat(h);
  await post(h, cookie, { op: "start" });
  assert.equal((await post(h, cookie, { op: "answer", stepId: "R01", answer: "1" })).status, 409);
  assert.equal((await post(h, cookie, { op: "answer", stepId: "pressure", answer: "P02" })).status, 400);
  let res = await post(h, cookie, { op: "answer", stepId: "pressure", answer: [] });
  assert.equal(res.body.step.id, "R01");
  for (const id of ["R01", "R02", "R03", "R04", "R05", "R06", "R07", "R08", "G01", "G02", "G03"]) {
    res = await post(h, cookie, { op: "answer", stepId: id, answer: "0" });
  }
  assert.equal(res.body.step.id, "G04");
  res = await post(h, cookie, { op: "answer", stepId: "G04", answer: "nodot" });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /full domain/);
  assert.equal(res.body.step.id, "G04");
});

test("resume keeps the same check; the check being down offers its own page", async () => {
  const check = fakeCheck();
  const h = harness(check);
  const cookie = await openChat(h);
  await post(h, cookie, { op: "start" });
  await post(h, cookie, { op: "answer", stepId: "pressure", answer: ["P01"] });
  const resumed = await post(h, cookie, { op: "start" });
  assert.equal(resumed.body.resumed, true);
  assert.equal(resumed.body.step.id, "severity:P01");
  assert.match(resumed.body.step.detail, /off-the-shelf/);
  h.deps.readinessFetch = async () => new Response("down", { status: 503 });
  const down = await post(h, cookie, { op: "answer", stepId: "severity:P01", answer: 3 });
  assert.equal(down.status, 502);
  assert.match(down.body.fallbackUrl, /^https:\/\/check\.abra-ca-dabra\.app\/check\/tok1/);
  const fresh = await openChat(h, "203.0.113.71");
  const failed = await post(h, fresh, { op: "start" }, "203.0.113.71");
  assert.equal(failed.status, 502);
  assert.equal(failed.body.fallbackUrl, "https://check.abra-ca-dabra.app/check?utm_source=chat");
});

test("the service binding is used when present", async () => {
  const check = fakeCheck();
  const h = harness(check);
  let bound = 0;
  h.env.READINESS = { fetch: (request) => { bound += 1; return check.handler(request); } };
  delete h.deps.readinessFetch;
  const cookie = await openChat(h);
  assert.equal((await post(h, cookie, { op: "start" })).status, 200);
  assert.equal(bound, 1);
});

test("readiness answers have their own per-network allowance", async () => {
  const check = fakeCheck();
  const h = harness(check);
  const cookie = await openChat(h);
  await post(h, cookie, { op: "start" });
  for (let i = 0; i < 25; i += 1) await post(h, cookie, { op: "answer", stepId: "nope", answer: 1 });
  const message = await handleRequest(new Request("https://abra-ca-dabra.app/api/chat/event", {
    method: "POST", headers: { origin: "https://abra-ca-dabra.app", "content-type": "application/json", "cf-connecting-ip": "203.0.113.70", cookie }, body: JSON.stringify({ kind: "readiness_check_clicked" }),
  }), h.env, h.deps);
  assert.notEqual(message.status, 429);
});

test("severity steps quote the symptom and use the check's three levels", () => {
  const view = stepView("severity:P05", 1);
  assert.equal(view.kind, "severity");
  assert.deepEqual(view.options.map((o) => o.value), [1, 2, 3]);
  assert.equal(stepView("severity:P99"), null);
  assert.equal(stepView("Q03").suggestions.includes("Trades"), true);
});
