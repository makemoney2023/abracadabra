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

async function openFixture(width = 1280, height = 800) {
  const page = await browser.newPage({ viewport: { width, height } });
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

const TONE = await readFile(new URL("./fixtures/voice-tone.mp3", import.meta.url));

async function voiceRun(auraBody) {
  env.CAL_LINK = "abracadabra/working-session";
  Object.assign(env, { VOICE_ENABLED: "true", AI_GATEWAY_TOKEN: "test-token", CF_ACCOUNT_ID: "acct" });
  const gateway = [];
  deps.fetchImpl = async (url, init = {}) => {
    gateway.push(String(url));
    if (String(url).includes("whisper")) {
      const body = JSON.parse(init.body);
      assert.ok(body.audio.length > 100);
      return Response.json({ success: true, result: { text: "What does Abracadabra build?", transcription_info: { duration: 2 } } });
    }
    if (String(url).includes("aura")) return new Response(auraBody, { headers: { "content-type": "audio/mpeg" } });
    return Response.json({ success: true, result: { response: "We build software around the work you already do." } });
  };
  const page = await openFixture(390, 844);
  const speaks = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/chat/speak") {
      speaks.push({ method: request.method(), id: url.searchParams.get("id"), p: url.searchParams.get("p"), body: request.method() === "POST" ? request.postDataJSON() : null });
    }
  });
  await page.getByRole("button", { name: "Ask Abracadabra" }).click();
  const mic = page.getByRole("button", { name: "Speak your question" });
  await mic.waitFor();
  await page.getByText("Audio isn't stored.").waitFor();
  await page.getByRole("textbox", { name: "Message" }).fill("What do you build?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByText("We build software around the work you already do.").first().waitFor();
  assert.equal(speaks.length, 0, "typed questions stay silent");
  await mic.click();
  await page.getByRole("button", { name: "Stop and send" }).waitFor();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Stop and send" }).click();
  const timings = await page.locator("abra-chat").evaluate((node) => new Promise((resolve) => {
    const started = Date.now();
    const check = () => (node.voiceTimings?.playing || Date.now() - started > 8000
      ? resolve({ ...node.voiceTimings, mode: node.voiceMode })
      : setTimeout(check, 25));
    check();
  }));
  const users = await page.locator("abra-chat").evaluate((node) => [...node.shadowRoot.querySelectorAll(".bubble.user")].map((b) => b.textContent));
  assert.equal(users.at(-1), "What does Abracadabra build?");
  assert.ok(gateway.some((url) => url.includes("whisper-large-v3-turbo")));
  assert.ok(gateway.some((url) => url.includes("aura-2-en")));
  return { page, speaks, timings };
}

function clearVoiceEnv() {
  delete env.VOICE_ENABLED;
  delete env.AI_GATEWAY_TOKEN;
  delete env.CF_ACCOUNT_ID;
  delete deps.fetchImpl;
}

test("push-to-talk streams the spoken answer into the audio element", async () => {
  try {
    const { page, speaks, timings } = await voiceRun(TONE);
    assert.equal(timings.mode, "stream");
    assert.ok(timings.playing > timings.reply, "audio played after the text reply");
    assert.equal(speaks.length >= 1, true);
    assert.ok(speaks.every((s) => s.method === "GET" && s.p === "1"), JSON.stringify(speaks));
    assert.match(speaks[0].id, /^[0-9a-f-]{36}$/);
    assert.equal(page.errors.length, 0);
    await page.close();
  } finally {
    clearVoiceEnv();
  }
});

test("a stream the browser cannot play falls back to one full download", async () => {
  try {
    const { page, speaks } = await voiceRun(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    await page.waitForFunction(() => document.querySelector("abra-chat").voiceMode === "buffered");
    const post = speaks.find((s) => s.method === "POST");
    assert.ok(post, JSON.stringify(speaks));
    assert.equal(post.body.play, 1);
    assert.equal(post.body.replyId, speaks[0].id);
    assert.equal(page.errors.length, 0);
    await page.close();
  } finally {
    clearVoiceEnv();
  }
});
