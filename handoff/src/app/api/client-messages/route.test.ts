import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const SECRET = "channel-secret";

afterEach(() => {
  delete process.env.HANDOFF_SQLITE_PATH;
  delete process.env.CLIENT_CHANNEL_SECRET;
});

function post(body: unknown, bearer = SECRET): Promise<Response> {
  return POST(
    new Request("https://hq.example/api/client-messages", {
      method: "POST",
      headers: {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/client-messages open_prospect", () => {
  it("refuses a request with no bearer", async () => {
    process.env.HANDOFF_SQLITE_PATH = ":memory:";
    process.env.CLIENT_CHANNEL_SECRET = SECRET;
    const response = await POST(
      new Request("https://hq.example/api/client-messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "open_prospect", email: "ada@northwind.example", name: "Ada North" }),
      }),
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "unauthorized" });
  });

  it("rejects an address that is not an email", async () => {
    process.env.HANDOFF_SQLITE_PATH = ":memory:";
    process.env.CLIENT_CHANNEL_SECRET = SECRET;
    const response = await post({ action: "open_prospect", email: "not-an-email", name: "Ada" });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid" });
  });

  it("opens a lead for a company address", async () => {
    process.env.HANDOFF_SQLITE_PATH = ":memory:";
    process.env.CLIENT_CHANNEL_SECRET = SECRET;
    const response = await post({
      action: "open_prospect",
      email: "Ada@Northwind.example",
      name: "Ada North",
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; value: { id: string; name: string; created: boolean } };
    expect(body.ok).toBe(true);
    expect(body.value.name).toBe("Ada North");
    expect(body.value.created).toBe(true);
    expect(body.value.id).toMatch(/^[0-9a-f-]{36}$/i);
  });
});

describe("POST /api/client-messages conversation", () => {
  it("loads the earlier mail when the reply uses a new message id", async () => {
    process.env.HANDOFF_SQLITE_PATH = path.join(mkdtempSync(path.join(tmpdir(), "mail-")), "handoff.db");
    process.env.CLIENT_CHANNEL_SECRET = SECRET;
    const opened = (await (
      await post({ action: "open_prospect", email: "ada@northwind.example", name: "Ada North" })
    ).json()) as { value: { id: string } };
    const organizationId = opened.value.id;
    const recorded = await post({
      action: "record",
      organizationId,
      channel: "email",
      threadId: "<root>",
      sender: "ada@northwind.example",
      body: "We need social media ads.",
      state: "clarifying",
      asked: true,
      replyBody: "Who are these ads for?",
      replyMessageId: "<magic-1@abra-ca-dabra.app>",
      actions: [{ title: "Social media ads" }],
      brief: "They want ads.",
    });
    expect(recorded.status).toBe(200);
    const recordedBody = (await recorded.json()) as { value: { taskIds: string[] } };
    expect(recordedBody.value.taskIds).toEqual([]);
    const byReply = (await (
      await post({
        action: "desk_context",
        organizationId,
        threadId: "<magic-1@abra-ca-dabra.app>",
        references: "",
        sender: "ada@northwind.example",
        subject: "ads",
      })
    ).json()) as { value: { messages: { body: string }[] } };
    expect(byReply.value.messages.map((row) => row.body)).toContain("Who are these ads for?");
    const desk = (await (
      await post({
        action: "desk_context",
        organizationId,
        threadId: "<reply-1>",
        references: "<root>",
        sender: "ada@northwind.example",
        subject: "Re: ads",
      })
    ).json()) as { value: { messages: { body: string }[] } };
    expect(desk.value.messages.map((row) => row.body)).toEqual([
      "We need social media ads.",
      "Who are these ads for?",
    ]);
    await post({
      action: "record",
      organizationId,
      channel: "email",
      threadId: "<reply-1>",
      references: "<root>",
      sender: "ada@northwind.example",
      subject: "Re: ads",
      body: "Local shops.",
      state: "clarifying",
      asked: true,
      replyBody: "What should a person do after they see the ad?",
      actions: [{ title: "Social media ads" }],
    });
    const thread = (await (
      await post({
        action: "thread",
        organizationId,
        threadId: "<reply-1>",
        references: "<root>",
        sender: "ada@northwind.example",
        subject: "Re: ads",
      })
    ).json()) as { value: { questionCount: number; text: string } };
    expect(thread.value.questionCount).toBe(2);
    expect(thread.value.text).toContain("Local shops.");
    expect(thread.value.text).toContain("We need social media ads.");
  });
});
