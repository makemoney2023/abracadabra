import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker/intake.js";

test("chat routes proxy to the chat worker and say so when it is not bound", async () => {
  const missing = await worker.fetch(new Request("https://abra-ca-dabra.app/api/chat/config"), { ASSETS: { fetch: () => new Response("page") } });
  assert.equal(missing.status, 503);
  assert.match(await missing.text(), /not configured/);

  const proxied = await worker.fetch(new Request("https://abra-ca-dabra.app/api/chat/config"), {
    ASSETS: { fetch: () => new Response("page") },
    CHAT: { fetch: () => Response.json({ calLink: "abracadabra/working-session" }) },
  });
  assert.equal(proxied.status, 200);
  assert.equal((await proxied.json()).calLink, "abracadabra/working-session");
});
