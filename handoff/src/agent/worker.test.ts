import { getAgentByName } from "agents";
import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { signWake } from "../lib/agent-wake";
import { emailLogPayload, mailboxAutoReply, parseSkillIndex, toolNamesFrom, type ClientAgent, type HqChat } from "./worker";

const SECRET = "test-wake-secret";

function wakeRequest(body: string, secret = SECRET): Request {
  return new Request("https://agent.example/wake", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-handoff-signature": signWake(secret, body),
    },
    body,
  });
}

describe("skill index", () => {
  it("reads names and drops a broken file", () => {
    expect(
      parseSkillIndex(
        JSON.stringify({
          skills: [
            { name: "brief-writing", description: "Write the brief" },
            { description: "no name" },
            { name: "" },
          ],
        }),
      ),
    ).toEqual(["brief-writing"]);
    expect(parseSkillIndex("not json")).toEqual([]);
    expect(parseSkillIndex("{}")).toEqual([]);
  });
});

describe("handoff agent", () => {
  it("refuses a bad signature", async () => {
    const body = JSON.stringify({ organizationId: "org-1", reason: "work", sentAt: Date.now() });
    const response = await exports.default.fetch(wakeRequest(body, "other-secret"));
    expect(response.status).toBe(401);
  });

  it("returns 202 when the same reason is already in flight", async () => {
    const body = JSON.stringify({ organizationId: "org-busy", reason: "work", sentAt: Date.now() });
    const stub = await getAgentByName(env.ClientAgent, "org-busy");
    await runInDurableObject(stub, async (instance: ClientAgent) => {
      instance.seedOpenWake("work");
    });
    const response = await exports.default.fetch(wakeRequest(body));
    expect(response.status).toBe(202);
    const payload = (await response.json()) as { outcome: string };
    expect(payload.outcome).toBe("busy");
  });

  it("starts a new wake when the open one was abandoned long ago", async () => {
    const stub = await getAgentByName(env.ClientAgent, "org-stale");
    const result = await runInDurableObject(stub, async (instance: ClientAgent) => {
      instance.seedOpenWake("due", Date.now() - 20 * 60_000);
      const outcome = await instance.acceptWake("due");
      return { outcome, wakes: instance.wakeLog("due") };
    });
    expect(result.outcome).toBe("started");
    expect(result.wakes).toHaveLength(2);
    expect(result.wakes[0]?.outcome).toBe("abandoned");
    expect(result.wakes[1]?.finished).toBe(true);
  });

  it("reads the skill index from the skills bucket", async () => {
    await env.SKILLS.put(
      "skills/index.json",
      JSON.stringify({
        skills: [{ name: "brief-writing", description: "Write the brief", path: "brief-writing/SKILL.md" }],
      }),
    );
    const stub = await getAgentByName(env.ClientAgent, "org-skills");
    const names = await runInDurableObject(stub, (instance: ClientAgent) => instance.skillNames());
    expect(names).toEqual(["brief-writing"]);
  });

  it("stamps the durable object name onto handoff calls", async () => {
    const stub = await getAgentByName(env.ClientAgent, "org-stamp");
    const args = await runInDurableObject(stub, (instance: ClientAgent) =>
      instance.handoffArguments({ organizationId: "other", title: "Home" }),
    );
    expect(args).toEqual({ organizationId: "org-stamp", title: "Home" });
  });

  it("stores a signed HQ notice and rejects an unsigned one", async () => {
    const unsigned = await exports.default.fetch(
      new Request("https://agent.example/hq-notice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "user-notice", text: "Stage 1 is ready.", sentAt: Date.now() }),
      }),
    );
    expect(unsigned.status).toBe(401);
    const body = JSON.stringify({ userId: "user-notice", text: "Stage 1 is ready.", sentAt: Date.now() });
    const signed = await exports.default.fetch(
      new Request("https://agent.example/hq-notice", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-handoff-signature": signWake(SECRET, body),
        },
        body,
      }),
    );
    expect(signed.status).toBe(200);
    const stub = await getAgentByName(env.HQ_CHAT, "user-notice");
    const texts = await runInDurableObject(stub, (instance: HqChat) =>
      instance.messages.flatMap((message) =>
        message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])),
      ),
    );
    expect(texts).toContain("Stage 1 is ready.");
  });

  it("lets the HQ site read chat history", async () => {
    const response = await exports.default.fetch(
      new Request("https://agent.example/agents/hq-chat/user-cors/get-messages"),
    );
    expect(response.headers.get("access-control-allow-origin")).toBe("https://hq.example.invalid");
  });

  it("names tools from the portal list, including one this worker does not catalog", () => {
    expect(
      toolNamesFrom([{ name: "client_context" }, { name: "extra_tool" }, {}], undefined),
    ).toEqual(["client_context", "extra_tool"]);
    expect(toolNamesFrom([], { client_context: {}, extra_tool: {} })).toEqual([
      "client_context",
      "extra_tool",
    ]);
    expect(toolNamesFrom([], undefined)).toEqual([]);
  });
});

describe("log-only mailbox", () => {
  const parsed = {
    from: "Cursor <news@mail.cursor.com>",
    to: "hq@mail.abra-ca-dabra.app",
    subject: "Your environment is almost ready",
    text: "Just one thing needs your input.",
    messageId: "<m1@cursor.com>",
    threadId: "<m1@cursor.com>",
    references: "",
    authenticationResults: "dmarc=pass",
    autoSubmitted: "",
    precedence: "bulk",
    listUnsubscribe: "<https://cursor.com/unsub>",
    listId: "",
    bytes: 100,
    attachments: [],
  };

  it("is log-only unless MAILBOX_AUTO_REPLY is on", () => {
    expect(mailboxAutoReply({})).toBe(false);
    expect(mailboxAutoReply({ MAILBOX_AUTO_REPLY: "off" })).toBe(false);
    expect(mailboxAutoReply({ MAILBOX_AUTO_REPLY: " ON " })).toBe(true);
    expect(mailboxAutoReply(env as { MAILBOX_AUTO_REPLY?: unknown })).toBe(false);
  });

  it("posts the headers HQ needs to spot bulk mail, and drops our own mail", () => {
    expect(emailLogPayload(parsed, ["hq@mail.abra-ca-dabra.app"])).toMatchObject({
      action: "log_email",
      sender: "news@mail.cursor.com",
      name: "Cursor",
      subject: "Your environment is almost ready",
      listUnsubscribe: "<https://cursor.com/unsub>",
      precedence: "bulk",
      attachments: 0,
    });
    expect(emailLogPayload({ ...parsed, from: "HQ <hq@mail.abra-ca-dabra.app>" }, ["hq@mail.abra-ca-dabra.app"])).toBeNull();
  });
});
