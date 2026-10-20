import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { handleRequest } from "../../../../workers/abracadabra-chat/src/http.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
};

const env = {
  CAL_LINK: "abracadabra/working-session",
  READINESS_CHECK_URL: "https://check.abra-ca-dabra.app/check",
  HANDOFF_HMAC_SECRET: "secret",
};
const deps = {
  limits: { messages: new Map(), sessions: new Map() },
  rooms: new Map(),
  async sendHandoff() {},
};

let server;
let origin;
let browser;

before(async () => {
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (url.pathname === "/api/chat" || url.pathname.startsWith("/api/chat/")) {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        const headers = new Headers();
        for (const [key, value] of Object.entries(request.headers)) {
          if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        }
        const upstream = await handleRequest(new Request(new URL(`${url.pathname}${url.search}`, origin), {
          method: request.method,
          headers,
          body: request.method === "GET" || request.method === "HEAD" ? undefined : body,
        }), env, deps);
        const bytes = Buffer.from(await upstream.arrayBuffer());
        const out = {};
        upstream.headers.forEach((value, key) => {
          if (key === "set-cookie") return;
          out[key] = value;
        });
        const cookies = typeof upstream.headers.getSetCookie === "function"
          ? upstream.headers.getSetCookie()
          : [upstream.headers.get("set-cookie")].filter(Boolean);
        response.writeHead(upstream.status, { ...out, "set-cookie": cookies });
        response.end(bytes);
        return;
      }
      if (url.pathname === "/chat-fixture") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/assets/fonts.css"><link rel="stylesheet" href="/assets/site.css"></head>
<body><main><h1>Studio</h1></main><script type="module" src="/assets/chat-widget.js"></script></body></html>`);
        return;
      }
      const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const filePath = join(root, normalize(relative).replace(/^(\.\.(\/|\\|$))+/, ""));
      const file = await readFile(filePath);
      response.writeHead(200, { "content-type": mime[extname(filePath)] || "application/octet-stream" });
      response.end(file);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve, reject) => server?.close((error) => (error ? reject(error) : resolve())));
});

async function openFixture(width = 1280, height = 800, prepare) {
  const page = await browser.newPage({ viewport: { width, height } });
  if (prepare) await prepare(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${origin}/chat-fixture`, { waitUntil: "networkidle" });
  page.errors = errors;
  return page;
}

test("the chat books in place, offers the check, and takes a consented note", async () => {
  env.CAL_LINK = "abracadabra/working-session";
  const page = await openFixture();
  await page.getByRole("button", { name: "Ask Abracadabra" }).click();
  await page.getByText("Ask a plain question. A person reviews anything we follow up on.").waitFor();
  await page.getByRole("button", { name: "Book a 30-min working session" }).click();
  const src = await page.locator("iframe").getAttribute("src");
  const cal = new URL(src);
  assert.equal(cal.pathname, "/abracadabra/working-session");
  assert.equal(cal.searchParams.get("theme"), "dark");
  assert.equal(cal.searchParams.get("metadata[source]"), "abracadabra-chat");
  assert.match(cal.searchParams.get("metadata[chat_session_id]") || "", /^[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Back to chat" }).click();
  await page.getByRole("button", { name: "Take the 3-min AI Readiness Check" }).click();
  const check = await page.getByRole("link", { name: "Start the check" }).getAttribute("href");
  assert.match(check, /utm_source=chat/);
  await page.getByRole("textbox", { name: "Message" }).fill("Please email me a follow up.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Send to the studio" }).waitFor();
  await page.getByLabel("Name").fill("Ada North");
  await page.getByLabel("Email").fill("ada@northwind.example");
  await page.getByLabel("What you need").fill("A faster quote");
  await page.getByRole("button", { name: "Send to the studio" }).click();
  await page.getByText("Tick the box so a person can write back.").waitFor();
  await page.getByRole("checkbox", { name: "A person may write back about this note." }).check();
  await page.getByRole("button", { name: "Send to the studio" }).click();
  await page.getByRole("heading", { name: "Got it." }).waitFor();
  await page.locator("abra-chat").evaluate((node) => node.completeBooking({
    externalId: "bk_1",
    startsAt: "2026-11-02T15:00:00.000Z",
    endsAt: "2026-11-02T15:30:00.000Z",
    email: "ada@northwind.example",
    name: "Ada North",
  }));
  await page.getByText(/Booked for/).waitFor();
  await page.getByRole("textbox", { name: "Message" }).fill("<img src=x onerror=alert(1)>");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const markup = await page.locator("abra-chat").evaluate((node) => {
    const bubbles = node.shadowRoot.querySelectorAll(".bubble.user");
    return bubbles[bubbles.length - 1].innerHTML;
  });
  assert.equal(markup.includes("<img"), false);
  assert.equal(page.errors.length, 0);
  await page.close();
});

test("typed replies turn our page links into safe anchors", async () => {
  env.CAL_LINK = "abracadabra/working-session";
  Object.assign(env, { AI_GATEWAY_TOKEN: "test-token", CF_ACCOUNT_ID: "acct" });
  deps.fetchImpl = async () => Response.json({ result: { response: "See the pirx.ca case study at https://abra-ca-dabra.app/portfolio/pirx/. Or https://evil.example/x <b>hi</b>. Take the check at https://check.abra-ca-dabra.app/." } });
  try {
    const page = await openFixture();
    await page.getByRole("button", { name: "Ask Abracadabra" }).click();
    await page.getByRole("textbox", { name: "Message" }).fill("what work have you done");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const pirx = page.getByRole("link", { name: "abra-ca-dabra.app/portfolio/pirx/" });
    await pirx.waitFor();
    assert.equal(await pirx.getAttribute("href"), "/portfolio/pirx/");
    assert.equal(await pirx.getAttribute("target"), null);
    const check = page.getByRole("link", { name: "check.abra-ca-dabra.app" });
    assert.equal(await check.getAttribute("target"), "_blank");
    assert.equal(await check.getAttribute("rel"), "noopener noreferrer");
    const markup = await page.locator("abra-chat").evaluate((node) => {
      const bubbles = node.shadowRoot.querySelectorAll(".bubble.assistant");
      return bubbles[bubbles.length - 1].innerHTML;
    });
    assert.equal(markup.includes("evil.example"), false);
    assert.equal(markup.includes("<b>"), false);
    assert.equal(page.errors.length, 0);
    await page.close();
  } finally {
    delete env.AI_GATEWAY_TOKEN;
    delete env.CF_ACCOUNT_ID;
    delete deps.fetchImpl;
  }
});

test("an empty Cal.com link asks for two times inside the chat", async () => {
  env.CAL_LINK = "";
  const page = await openFixture(390, 800);
  await page.getByRole("button", { name: "Ask Abracadabra" }).click();
  await page.getByRole("button", { name: "Book a call" }).click();
  await page.getByRole("heading", { name: "Pick two times that work." }).waitFor();
  await page.getByLabel("Name").fill("Ada North");
  await page.getByLabel("Email").fill("ada@northwind.example");
  await page.getByRole("button", { name: "Send times" }).click();
  await page.getByText("Tick the box so a person can write back.").waitFor();
  assert.equal(await page.locator("iframe").count(), 0);
  const box = await page.locator("abra-chat").evaluate((node) => {
    const panel = node.shadowRoot.querySelector(".panel");
    return panel.getBoundingClientRect().width;
  });
  assert.ok(box >= 380);
  await page.evaluate(() => document.body.classList.add("intake-lock"));
  await page.waitForFunction(() => document.querySelector("abra-chat").shadowRoot.querySelector(".launcher").hidden);
  assert.equal(page.errors.length, 0);
  await page.close();
});

// The page's WebSocket is routed into the real chat worker: handleRequest checks the session
// cookie and limits, then VoiceCall runs with a fake Flux (driven by mic bytes) and fake Aura PCM.
class BridgeSocket {
  constructor(route) {
    this.route = route;
    this.listeners = {};
  }
  accept() {}
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  emit(type, data) {
    for (const fn of this.listeners[type] || []) fn({ data });
  }
  send(data) {
    this.route.send(typeof data === "string" ? data : Buffer.from(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength));
  }
  close() {
    try { this.route.close(); } catch { /* gone */ }
  }
}

class FakeFlux {
  constructor(script) {
    this.script = script;
    this.listeners = {};
    this.bytes = 0;
    this.fired = new Set();
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  emit(payload) {
    for (const fn of this.listeners.message || []) fn({ data: JSON.stringify(payload) });
  }
  send(data) {
    if (typeof data === "string") return;
    this.bytes += data.byteLength;
    // 32,000 bytes is one second of 16 kHz mic audio.
    for (const step of this.script) {
      if (!this.fired.has(step) && this.bytes >= step.at) {
        this.fired.add(step);
        this.emit(step.event);
      }
    }
  }
  close() {}
}

function tone(seconds, rate = 24000) {
  const samples = new Int16Array(Math.round(seconds * rate));
  for (let i = 0; i < samples.length; i += 1) samples[i] = Math.round(Math.sin((i / rate) * 2 * Math.PI * 330) * 6000);
  return new Uint8Array(samples.buffer);
}

async function callRun({ script, ttsSeconds = 0.6, llmDelayMs = 0 }) {
  env.CAL_LINK = "abracadabra/working-session";
  Object.assign(env, { VOICE_ENABLED: "true", AI_GATEWAY_TOKEN: "test-token", CF_ACCOUNT_ID: "acct", AI: { run() {} } });
  const gateway = [];
  const flux = new FakeFlux(script);
  deps.openFlux = async () => flux;
  deps.tickMs = 0;
  deps.fetchImpl = async (url, init = {}) => {
    gateway.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    if (String(url).includes("aura")) {
      const pcm = tone(ttsSeconds);
      const stream = new ReadableStream({
        async start(controller) {
          for (let i = 0; i < pcm.length; i += 4801) {
            controller.enqueue(pcm.slice(i, i + 4801));
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          controller.close();
        },
      });
      return new Response(stream, { headers: { "content-type": "audio/mpeg" } });
    }
    if (llmDelayMs) await new Promise((resolve) => setTimeout(resolve, llmDelayMs));
    return Response.json({ success: true, result: { response: "We build software around the work you already do." } });
  };
  const state = { calls: [], flux };
  let page;
  const prepare = (target) => target.routeWebSocket(/\/api\/chat\/realtime/, async (route) => {
    const server = new BridgeSocket(route);
    const client = new BridgeSocket(route);
    const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
    deps.webSocketPair = () => ({ 0: client, 1: server });
    deps.upgrade = (_socket, call) => {
      state.calls.push(call);
      return new Response(null, { status: 200, headers: { "x-upgraded": "1" } });
    };
    const response = await handleRequest(new Request(`${origin}/api/chat/realtime`, {
      headers: { origin, cookie: cookies, upgrade: "websocket", "cf-connecting-ip": "127.0.0.1" },
    }), env, deps);
    if (response.headers.get("x-upgraded") !== "1") {
      state.refused = response.status;
      route.close({ code: 4000 + (response.status % 1000), reason: "refused" });
      return;
    }
    route.onMessage((message) => {
      server.emit("message", typeof message === "string" ? message : new Uint8Array(message).buffer);
    });
    route.onClose(() => server.emit("close"));
  });
  page = await openFixture(390, 844, prepare);
  if (process.env.VOICE_DEBUG) page.on("console", (m) => console.log("[page]", m.text()));
  await page.getByRole("button", { name: "Ask Abracadabra" }).click();
  const mic = page.getByRole("button", { name: "Start voice chat" });
  await mic.waitFor();
  await page.getByText("Audio isn't stored.").waitFor();
  return { page, state, gateway, mic };
}

function clearVoiceEnv() {
  for (const key of ["VOICE_ENABLED", "AI_GATEWAY_TOKEN", "CF_ACCOUNT_ID", "AI"]) delete env[key];
  for (const key of ["fetchImpl", "openFlux", "tickMs", "webSocketPair", "upgrade", "activeCall", "fillerAfterMs"]) delete deps[key];
}

const widgetState = (page) => page.locator("abra-chat").evaluate((node) => ({
  ui: node.callState_,
  label: node.shadowRoot.querySelector("[data-call-state]").textContent,
  users: [...node.shadowRoot.querySelectorAll(".bubble.user")].map((b) => b.textContent),
  assistants: [...node.shadowRoot.querySelectorAll(".bubble.assistant")].map((b) => b.textContent),
  timings: node.voiceTimings || {},
  sources: node.call?.sources.size ?? 0,
}));

test("one tap starts a hands-free call: mic streams, Flux ends the turn, Aura PCM plays", async () => {
  try {
    const { page, state, gateway, mic } = await callRun({
      script: [
        { at: 16000, event: { event: "StartOfTurn", transcript: "What does" } },
        { at: 32000, event: { event: "EndOfTurn", transcript: "What does Abracadabra build?" } },
      ],
    });
    await mic.click();
    await page.getByRole("button", { name: "End voice chat" }).waitFor();
    if (process.env.VOICE_DEBUG) {
      await page.waitForTimeout(3000);
      console.log(JSON.stringify(await widgetState(page)), state.refused, state.calls.length, state.flux.bytes, page.errors);
    }
    await page.getByText("We build software around the work you already do.").last().waitFor({ timeout: 8000 });
    await page.waitForFunction(() => document.querySelector("abra-chat").voiceTimings?.playing, null, { timeout: 8000 });
    const during = await widgetState(page);
    assert.equal(during.users.at(-1), "What does Abracadabra build?");
    assert.ok(during.timings.playing >= during.timings.heard);
    // Playback finishes, the browser reports it, and the call listens again.
    await page.waitForFunction(() => document.querySelector("abra-chat").callState_ === "listening", null, { timeout: 8000 });
    assert.equal(state.calls[0].state, "listening");
    assert.ok(state.flux.bytes >= 32000, "the mic kept streaming 16 kHz PCM");
    const tts = gateway.find((g) => g.url.includes("aura-2-en"));
    assert.equal(tts.body.encoding, "linear16");
    assert.equal(tts.body.sample_rate, 24000);
    await page.getByRole("button", { name: "End", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("abra-chat").callState_ === "idle");
    await page.waitForTimeout(100);
    assert.equal(state.calls[0].closed, true);
    assert.equal(page.errors.length, 0, page.errors.join("\n"));
    await page.close();
  } finally {
    clearVoiceEnv();
  }
});

test("talking over the reply stops playback at once (barge-in)", async () => {
  try {
    const { page, state, mic } = await callRun({
      ttsSeconds: 4,
      script: [
        { at: 16000, event: { event: "EndOfTurn", transcript: "What does Abracadabra build?" } },
        // About 1.5 s later the visitor starts talking again while the reply plays.
        { at: 64000, event: { event: "StartOfTurn", transcript: "Wait how much" } },
        { at: 72000, event: { event: "Update", transcript: "Wait how much does it cost" } },
      ],
    });
    await mic.click();
    if (process.env.VOICE_DEBUG) {
      for (let i = 0; i < 10; i += 1) {
        await page.waitForTimeout(400);
        console.log(JSON.stringify(await widgetState(page)), state.calls[0]?.state, state.flux.bytes);
      }
    }
    await page.waitForFunction(() => document.querySelector("abra-chat").callState_ === "speaking", null, { timeout: 8000 });
    await page.waitForFunction(() => {
      const node = document.querySelector("abra-chat");
      return node.callState_ === "listening" && node.call && node.call.sources.size === 0;
    }, null, { timeout: 8000 });
    assert.equal(state.calls[0].state, "listening");
    assert.equal(state.calls[0].controller, null);
    // Tapping the mic again ends the call.
    await page.getByRole("button", { name: "End voice chat" }).click();
    await page.waitForFunction(() => document.querySelector("abra-chat").callState_ === "idle");
    assert.equal(page.errors.length, 0, page.errors.join("\n"));
    await page.close();
  } finally {
    clearVoiceEnv();
  }
});

test("voice stays hidden when the switch is off", async () => {
  const page = await openFixture(390, 844);
  await page.getByRole("button", { name: "Ask Abracadabra" }).click();
  await page.getByText("Ask a plain question. A person reviews anything we follow up on.").waitFor();
  assert.equal(await page.getByRole("button", { name: "Start voice chat" }).count(), 0);
  await page.close();
});

test("a slow voice answer shows contextual thinking text and plays a cached filler first", async () => {
  try {
    deps.fillerAfterMs = 300;
    const { page, state, gateway, mic } = await callRun({
      llmDelayMs: 1500,
      script: [
        { at: 16000, event: { event: "StartOfTurn", transcript: "What work" } },
        { at: 32000, event: { event: "EndOfTurn", transcript: "What work have you done?" } },
      ],
    });
    await mic.click();
    await page.getByText("Looking through our work…").waitFor({ timeout: 8000 });
    assert.equal((await widgetState(page)).label, "Thinking…");
    await page.waitForFunction(() => document.querySelector("abra-chat").voiceTimings?.filler, null, { timeout: 8000 });
    await page.getByText("Let me check.").waitFor();
    await page.waitForFunction(() => document.querySelector("abra-chat").voiceTimings?.playing, null, { timeout: 8000 });
    const t = (await widgetState(page)).timings;
    assert.ok(t.playing > t.filler, "the answer comes after the filler");
    assert.ok(t.audibleAt >= t.fillerAudibleAt + 400, "the answer queues after the filler line");
    assert.equal(gateway.filter((g) => g.url.includes("aura")).length, 1, "the filler is not synthesized");
    assert.equal(state.calls.length, 1);
    await page.getByRole("button", { name: "End voice chat" }).click();
    assert.equal(page.errors.length, 0);
    await page.close();
  } finally {
    clearVoiceEnv();
  }
});

test("typed chat shows a working indicator that changes over time, then a retry on failure", async () => {
  Object.assign(env, { AI_GATEWAY_TOKEN: "test-token", CF_ACCOUNT_ID: "acct" });
  let mode = "slow";
  deps.fetchImpl = async () => {
    if (mode === "fail") return new Response("busy", { status: 503 });
    await new Promise((resolve) => setTimeout(resolve, 2600));
    return Response.json({ result: { response: "We build custom apps. See https://abra-ca-dabra.app/services/custom-apps/." } });
  };
  try {
    const page = await openFixture();
    await page.getByRole("button", { name: "Ask Abracadabra" }).click();
    await page.getByRole("textbox", { name: "Message" }).fill("what services do you offer");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.locator("abra-chat").locator(".thinking-text").getByText("Thinking…").waitFor({ timeout: 1000 });
    const status = () => page.locator("abra-chat").evaluate((node) => node.shadowRoot.querySelector("[role=status]").textContent);
    assert.equal(await status(), "Thinking…");
    await page.locator("abra-chat").locator(".thinking-text").getByText("Looking through our services…").waitFor({ timeout: 3000 });
    assert.equal(await status(), "Looking through our services…");
    await page.getByRole("link", { name: "abra-ca-dabra.app/services/custom-apps/" }).waitFor({ timeout: 4000 });
    assert.equal(await page.locator("abra-chat").locator(".thinking").count(), 0);

    mode = "fail";
    await page.getByRole("textbox", { name: "Message" }).fill("and the cost?");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.getByText(/took longer than it should/).waitFor({ timeout: 4000 });
    mode = "fast";
    deps.fetchImpl = async () => Response.json({ result: { response: "We price each project to the job." } });
    await page.getByRole("button", { name: "Try again" }).click();
    await page.getByText("We price each project to the job.").waitFor({ timeout: 4000 });
    const users = await page.locator("abra-chat").evaluate((node) => node.shadowRoot.querySelectorAll(".bubble.user").length);
    assert.equal(users, 2, "a retry does not repeat the question bubble");
    assert.equal(page.errors.length, 0);
    await page.close();
  } finally {
    delete env.AI_GATEWAY_TOKEN;
    delete env.CF_ACCOUNT_ID;
    delete deps.fetchImpl;
  }
});
