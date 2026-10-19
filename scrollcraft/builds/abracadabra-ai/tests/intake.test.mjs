import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { forwardToHq, handleIntake, inquiryBody, resetIntakeRateLimit } from "../worker/intake.js";

function request(body, { json = true, ip = "203.0.113.8" } = {}) {
  return new Request("https://abra-ca-dabra.app/api/intake", {
    method: "POST",
    headers: {
      "content-type": json ? "application/json" : "application/x-www-form-urlencoded",
      "x-intake": json ? "fetch" : "",
      "cf-connecting-ip": ip,
    },
    body: json ? JSON.stringify(body) : new URLSearchParams(body),
  });
}

const valid = {
  name: "Ada",
  email: "ada@example.com",
  company: "Example",
  need: "Website",
  budget: "Under $15k",
  timeline: "This month",
  message: "A site that books the work.",
  company_website: "",
};

const hqOk = async () => true;
const hqDown = async () => { throw new Error("HQ intake 503"); };
const noMail = async () => { throw new Error("should not send"); };

test("intake form validates, queues to HQ and confirms", async (t) => {
  t.after(() => resetIntakeRateLimit());
  const forwarded = [];
  const ok = await handleIntake(request(valid), {}, {
    forward: async (_env, payload, meta) => { forwarded.push({ payload, meta }); return true; },
    send: noMail,
    id: () => "sub-1",
    now: () => 1_700_000_000_000,
  });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, sent: true });
  assert.equal(forwarded[0].payload.email, "ada@example.com");
  assert.deepEqual(forwarded[0].meta, { externalId: "sub-1", now: 1_700_000_000_000 });

  const missing = await handleIntake(request({ ...valid, email: "not-an-email" }), {}, { forward: hqOk });
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).field, "email");

  const honey = await handleIntake(request({ ...valid, company_website: "https://spam.test" }), {}, {
    forward: async () => { throw new Error("should not forward"); },
    send: noMail,
  });
  assert.equal(honey.status, 200);
  assert.deepEqual(await honey.json(), { ok: true, sent: false });

  for (let i = 0; i < 5; i += 1) {
    assert.equal((await handleIntake(request(valid, { ip: "203.0.113.9" }), {}, { forward: hqOk })).status, 200);
  }
  const blocked = await handleIntake(request(valid, { ip: "203.0.113.9" }), {}, { forward: hqOk });
  assert.equal(blocked.status, 429);

  const html = await handleIntake(request(valid, { json: false, ip: "203.0.113.11" }), {}, { forward: hqOk });
  assert.equal(html.status, 303);
  assert.match(html.headers.get("location"), /\/start\/thanks\/$/);
});

test("email is an optional copy and never fails the visitor once HQ has it", async (t) => {
  t.after(() => resetIntakeRateLimit());
  const sent = [];
  const both = await handleIntake(request(valid, { ip: "198.51.100.1" }), { RESEND_API_KEY: "k" }, {
    forward: hqOk,
    send: async (_env, payload) => { sent.push(payload.email); },
  });
  assert.equal(both.status, 200);
  assert.deepEqual(sent, ["ada@example.com"]);

  const mailDown = await handleIntake(request(valid, { ip: "198.51.100.2" }), { RESEND_API_KEY: "k" }, {
    forward: hqOk,
    send: async () => { throw new Error("email provider 503"); },
  });
  assert.equal(mailDown.status, 200);

  const noKey = await handleIntake(request(valid, { ip: "198.51.100.3" }), {}, { forward: hqOk, send: noMail });
  assert.equal(noKey.status, 200);

  const mailOnly = await handleIntake(request(valid, { ip: "198.51.100.4" }), { RESEND_API_KEY: "k" }, {
    forward: hqDown,
    send: async () => {},
  });
  assert.equal(mailOnly.status, 200);

  const nothing = await handleIntake(request(valid, { ip: "198.51.100.5" }), {}, { forward: hqDown, send: noMail });
  assert.equal(nothing.status, 502);
  const nothingHtml = await handleIntake(request(valid, { json: false, ip: "198.51.100.6" }), {}, { forward: hqDown });
  assert.equal(nothingHtml.status, 502);
});

test("forwardToHq signs the body the way HQ verifies it", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return new Response(null, { status: 202 }); };
  const env = { HANDOFF_INTAKE_ORIGIN: "https://handoff.example/", PROJECT_INQUIRY_SIGNING_SECRET: "form-secret" };
  const now = 1_700_000_000_000;
  assert.equal(await forwardToHq(env, valid, { externalId: "sub-9", now, fetchImpl }), true);
  const [{ url, init }] = calls;
  assert.equal(url, "https://handoff.example/api/intake/project-inquiry");
  assert.equal(init.headers["x-intake-timestamp"], String(now));
  assert.equal(init.headers["x-intake-signature"], createHmac("sha256", "form-secret").update(init.body).digest("hex"));
  const body = JSON.parse(init.body);
  assert.deepEqual(body, inquiryBody(valid, "sub-9", now));
  assert.equal(body.page, "/start/");
  assert.equal("company_website" in body, false);

  await assert.rejects(forwardToHq({}, valid, { externalId: "x", now, fetchImpl }), /not configured/);
  await assert.rejects(
    forwardToHq(env, valid, { externalId: "x", now, fetchImpl: async () => new Response(null, { status: 401 }) }),
    /HQ intake 401/,
  );
});
