import assert from "node:assert/strict";
import test from "node:test";
import { handleIntake, resetIntakeRateLimit } from "../worker/intake.js";

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

test("intake form validates, submits and confirms", async (t) => {
  t.after(() => resetIntakeRateLimit());
  const sent = [];
  const ok = await handleIntake(request(valid), {}, { send: async (_env, payload) => { sent.push(payload); } });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, sent: true });
  assert.equal(sent[0].email, "ada@example.com");

  const missing = await handleIntake(request({ ...valid, email: "not-an-email" }), {}, { send: async () => {} });
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).field, "email");

  const honey = await handleIntake(request({ ...valid, company_website: "https://spam.test" }), {}, { send: async () => { throw new Error("should not send"); } });
  assert.equal(honey.status, 200);
  assert.deepEqual(await honey.json(), { ok: true, sent: false });

  const limited = await handleIntake(request(valid, { ip: "203.0.113.9" }), {}, { send: async () => {} });
  assert.equal(limited.status, 200);
  for (let i = 0; i < 4; i += 1) {
    assert.equal((await handleIntake(request(valid, { ip: "203.0.113.9" }), {}, { send: async () => {} })).status, 200);
  }
  const blocked = await handleIntake(request(valid, { ip: "203.0.113.9" }), {}, { send: async () => {} });
  assert.equal(blocked.status, 429);

  const failed = await handleIntake(request({ ...valid, name: "Bea" }, { ip: "203.0.113.10" }), {}, {
    send: async () => { throw new Error("email provider 503"); },
  });
  assert.equal(failed.status, 502);

  const html = await handleIntake(request(valid, { json: false, ip: "203.0.113.11" }), {}, { send: async () => {} });
  assert.equal(html.status, 303);
  assert.match(html.headers.get("location"), /\/start\/thanks\/$/);
});
