import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, RETRY_TEXT } from "../src/http.js";
import { chatModel, DEFAULT_MODEL, streamChat } from "../src/model.js";

const NOW = 1_700_000_000_000;
const ENV = { AI_GATEWAY_TOKEN: "t", CF_ACCOUNT_ID: "acct" };

function sse(parts) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(`data: ${JSON.stringify(part)}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  }), { headers: { "content-type": "text/event-stream" } });
}

function harness(llm) {
  const calls = [];
  const deps = {
    now: () => NOW,
    limits: { messages: new Map(), sessions: new Map() },
    rooms: new Map(),
    sendHandoff: async () => {},
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return llm(init);
    },
  };
  return { deps, calls };
}

async function ask(h, text, env = ENV) {
  const opened = await handleRequest(new Request("https://abra-ca-dabra.app/api/chat/session", {
    method: "POST", headers: { origin: "http://127.0.0.1:4500", "content-type": "application/json", "cf-connecting-ip": "203.0.113.90" }, body: "{}",
  }), env, h.deps);
  const cookie = `abra_chat=${opened.headers.get("set-cookie").match(/abra_chat=([^;]+)/)[1]}`;
  const response = await handleRequest(new Request("https://abra-ca-dabra.app/api/chat/message", {
    method: "POST", headers: { origin: "https://abra-ca-dabra.app", "content-type": "application/json", "cf-connecting-ip": "203.0.113.90", cookie }, body: JSON.stringify({ text }),
  }), env, h.deps);
  const raw = await response.text();
  const events = [...raw.matchAll(/event: (\w+)\ndata: (.*)\n\n/g)].map(([, event, data]) => ({ event, data: JSON.parse(data) }));
  return { response, events, room: [...h.deps.rooms.values()][0] };
}

test("70B is the default for typed and voice, and each can be set by env", () => {
  assert.equal(DEFAULT_MODEL, "@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  assert.equal(chatModel({}), DEFAULT_MODEL);
  assert.equal(chatModel({}, true), DEFAULT_MODEL);
  assert.equal(chatModel({ AI_MODEL: "@cf/meta/llama-3.1-8b-instruct-fast" }, true), "@cf/meta/llama-3.1-8b-instruct-fast");
  assert.equal(chatModel({ AI_MODEL: "a", AI_VOICE_MODEL: "b" }, true), "b");
  assert.equal(chatModel({ AI_MODEL: "a", AI_VOICE_MODEL: "b" }, false), "a");
});

test("typed replies stream checked sentences, then the final answer", async () => {
  const h = harness(() => sse([
    { response: "We built the StrongFoam CRM. " },
    { choices: [{ delta: { content: "See https://abra-ca-dabra.app/portfolio/strongfoam-crm/ for it. " } }] },
    { response: "Or https://abra-ca-dabra.app/made-up/ too." },
  ]));
  const { events, room } = await ask(h, "what work have you done");
  assert.match(h.calls[0].url, /llama-3\.3-70b-instruct-fp8-fast$/);
  assert.equal(h.calls[0].body.stream, true);
  const tokens = events.filter((e) => e.event === "token").map((e) => e.data.text);
  assert.deepEqual(tokens, ["We built the StrongFoam CRM.", " See https://abra-ca-dabra.app/portfolio/strongfoam-crm/ for it.", " Or https://abra-ca-dabra.app/ too."]);
  const final = events.find((e) => e.event === "final").data.text;
  assert.equal(final, tokens.join(""));
  assert.equal(events.at(-1).event, "done");
  const session = await room.get("session");
  assert.equal(session.messages.at(-1).text, final);
});

test("a price mid-stream replaces the whole answer in the final event", async () => {
  const h = harness(() => sse([{ response: "We build apps. It costs $9,000 to start. More." }]));
  const { events } = await ask(h, "how much");
  const final = events.find((e) => e.event === "final").data.text;
  assert.equal(final.includes("$"), false);
  assert.equal(events.filter((e) => e.event === "token").some((e) => e.data.text.includes("$")), false);
});

test("model error or timeout sends a retry message instead of hanging, and saves nothing", async () => {
  const h = harness(() => new Response("busy", { status: 503 }));
  const { events, room } = await ask(h, "what do you build");
  assert.deepEqual(events.map((e) => e.event), ["error", "done"]);
  assert.equal(events[0].data.text, RETRY_TEXT);
  assert.equal(events[0].data.retry, true);
  assert.equal((await room.get("session")).messages.length, 0);

  const slow = (_url, init) => new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
  const gen = streamChat({ env: ENV, messages: [{ role: "user", text: "hi" }], fetchImpl: slow, timeoutMs: 20 });
  await assert.rejects(gen.next(), (error) => error.reason === "timeout");
});

test("no gateway configured answers from the studio script", async () => {
  const h = harness(() => { throw new Error("should not call"); });
  const { events } = await ask(h, "book a call", {});
  assert.match(events.find((e) => e.event === "final").data.text, /thirty-minute working session/);
  assert.ok(events.some((e) => e.event === "ui_action" && e.data.action === "open_booking"));
});

test("a garbled 70B stream never reaches the visitor; the 8B fallback answers", async () => {
  const h = harness((init) => {
    const body = JSON.parse(init.body);
    return body.messages ? null : null;
  });
  h.deps.fetchImpl = async (url) => {
    h.calls.push({ url: String(url) });
    if (String(url).includes("70b")) return sse([{ response: "!!!!!!!!" }, { response: "!!!!!!!!!!!!!!!!!!!!!!!!" }]);
    return sse([{ response: "We build custom apps around your work. " }, { response: "See the Work page." }]);
  };
  const { events } = await ask(h, "what work have you done");
  assert.equal(h.calls.length, 2);
  assert.match(h.calls[1].url, /llama-3\.1-8b-instruct-fast$/);
  assert.equal(events.some((e) => JSON.stringify(e.data).includes("!!")), false);
  assert.equal(events.find((e) => e.event === "final").data.text, "We build custom apps around your work. See the Work page.");
});

test("AI_FALLBACK_MODEL=none turns the fallback off", async () => {
  const h = harness(() => new Response("busy", { status: 503 }));
  const { events } = await ask(h, "hi", { ...ENV, AI_FALLBACK_MODEL: "none" });
  assert.equal(h.calls.length, 1);
  assert.equal(events[0].event, "error");
});
