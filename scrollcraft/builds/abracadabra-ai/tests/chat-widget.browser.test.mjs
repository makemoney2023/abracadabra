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
        const upstream = await handleRequest(new Request(new URL(url.pathname, origin), {
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
