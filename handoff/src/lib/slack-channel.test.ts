import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { handleSlackEvent, verifySlackSignature } from "./slack-channel";

const NOW = 1_700_000_000_000;
const SECRET = "slack-secret";
const ENV = {
  SLACK_SIGNING_SECRET: SECRET,
  HQ_ORIGIN: "https://hq.example",
  CLIENT_CHANNEL_SECRET: "channel",
  SLACK_BOT_TOKEN: "xoxb-test",
};

function signed(raw: string, now = NOW): Request {
  const timestamp = String(Math.floor(now / 1000));
  const signature = `v0=${createHmac("sha256", SECRET).update(`v0:${timestamp}:${raw}`).digest("hex")}`;
  return new Request("https://agent.example/channels/slack", {
    method: "POST",
    headers: {
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": signature,
      "content-type": "application/json",
    },
    body: raw,
  });
}

function event(fields: Record<string, unknown>): string {
  return JSON.stringify({ type: "event_callback", event: { type: "message", user: "U1", channel: "C1", ...fields } });
}

function fakeHq(replies = 0) {
  const bodies: Record<string, unknown>[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    bodies.push({ url: String(input), ...body });
    if (body.action === "slack_org") return Response.json({ ok: true, value: "org-1" });
    if (body.action === "thread") return Response.json({ ok: true, value: { replies, questionCount: 0, text: "" } });
    return Response.json({ ok: true });
  };
  return { bodies, fetchImpl };
}

async function run(raw: string, hq: ReturnType<typeof fakeHq>, env: Record<string, string> = ENV) {
  const pending: Promise<unknown>[] = [];
  const response = await handleSlackEvent(signed(raw), env, NOW, hq.fetchImpl, (work) => pending.push(work));
  const recordedBeforeResponse = hq.bodies.some((body) => body.action === "record");
  await Promise.all(pending);
  return { response, recordedBeforeResponse };
}

describe("slack channel", () => {
  it("rejects a bad signature or an old timestamp and answers a url challenge", async () => {
    expect(await verifySlackSignature(SECRET, "1", "{}", "v0=nope", NOW)).toBe(false);
    const old = await handleSlackEvent(signed("{}", NOW - 10 * 60 * 1000), { SLACK_SIGNING_SECRET: SECRET }, NOW);
    expect(old.status).toBe(401);
    const raw = JSON.stringify({ type: "url_verification", challenge: "abc" });
    const response = await handleSlackEvent(signed(raw), { SLACK_SIGNING_SECRET: SECRET }, NOW);
    await expect(response.json()).resolves.toEqual({ challenge: "abc" });
    const bad = await handleSlackEvent(signed("not-json"), { SLACK_SIGNING_SECRET: SECRET }, NOW);
    expect(bad.status).toBe(401);
  });

  it("answers 200 without waiting on HQ, then records and replies in the thread", async () => {
    const hq = fakeHq();
    const { response, recordedBeforeResponse } = await run(event({ text: "Please add a page", ts: "1.2" }), hq);
    expect(response.status).toBe(200);
    expect(recordedBeforeResponse).toBe(false);
    const record = hq.bodies.find((body) => body.action === "record");
    expect(record).toMatchObject({ organizationId: "org-1", threadId: "1.2", channel: "slack", asked: true });
    const posted = hq.bodies.find((body) => String(body.url).includes("chat.postMessage"));
    expect(posted).toMatchObject({ channel: "C1", thread_ts: "1.2" });
  });

  it("keeps a thread reply in its parent conversation", async () => {
    const hq = fakeHq();
    await run(event({ text: "So that buyers compare, by Friday", ts: "1.9", thread_ts: "1.2" }), hq);
    expect(hq.bodies.find((body) => body.action === "record")).toMatchObject({ threadId: "1.2" });
    expect(hq.bodies.find((body) => String(body.url).includes("chat.postMessage"))).toMatchObject({ thread_ts: "1.2" });
  });

  it("ignores edits, mentions, and bots, and logs staff without answering", async () => {
    for (const raw of [
      event({ subtype: "message_changed", ts: "1.3" }),
      JSON.stringify({ type: "event_callback", event: { type: "app_mention", user: "U1", channel: "C1", text: "hi", ts: "1.4" } }),
      event({ bot_id: "B1", ts: "1.5" }),
    ]) {
      const hq = fakeHq();
      const { response } = await run(raw, hq, { ...ENV, SLACK_STAFF_USER_IDS: "USTAFF" });
      expect(response.status).toBe(200);
      expect(hq.bodies).toHaveLength(0);
    }
    const hq = fakeHq();
    await run(event({ user: "USTAFF", text: "internal", ts: "1.6" }), hq, { ...ENV, SLACK_STAFF_USER_IDS: "USTAFF" });
    expect(hq.bodies.some((body) => body.action === "staff_log")).toBe(true);
    expect(hq.bodies.some((body) => String(body.url).includes("chat.postMessage"))).toBe(false);
  });

  it("keeps recording a busy thread but stops replying", async () => {
    const hq = fakeHq(11);
    await run(event({ text: "Please add a page", ts: "1.2" }), hq);
    expect(hq.bodies.find((body) => body.action === "record")).toMatchObject({ replyBody: "" });
    expect(hq.bodies.some((body) => String(body.url).includes("chat.postMessage"))).toBe(false);
  });
});
