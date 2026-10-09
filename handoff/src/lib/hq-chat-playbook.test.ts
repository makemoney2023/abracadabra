import { describe, expect, it } from "vitest";
import {
  HQ_CHAT_PLAYBOOK,
  MAILBOX_INSTRUCTIONS,
  PROSPECT_INSTRUCTIONS,
  conversationTitle,
  starterPrompts,
  toolTaskStatus,
} from "./hq-chat-playbook";

describe("channel instructions", () => {
  it("tells staff chat to convert a lead and file tasks on the brief", () => {
    expect(HQ_CHAT_PLAYBOOK).toContain("stage won");
    expect(HQ_CHAT_PLAYBOOK).toContain("ask which deal");
    expect(HQ_CHAT_PLAYBOOK).toContain("set_deal_step");
    expect(HQ_CHAT_PLAYBOOK).toContain("draft_client_status");
    expect(HQ_CHAT_PLAYBOOK).toContain("file_actions");
    expect(HQ_CHAT_PLAYBOOK).toContain("## Rules");
    expect(HQ_CHAT_PLAYBOOK).toContain("Do not stop at add_note");
    expect(HQ_CHAT_PLAYBOOK).toContain("list_swarm_packs");
    expect(HQ_CHAT_PLAYBOOK).toContain("run_workflow");
    expect(HQ_CHAT_PLAYBOOK).toContain("Do not say you cannot execute the swarm from chat");
  });

  it("asks the mailbox for task titles and a brief sentence", () => {
    expect(MAILBOX_INSTRUCTIONS).toContain('"actions"');
    expect(MAILBOX_INSTRUCTIONS).toContain('"brief"');
    expect(MAILBOX_INSTRUCTIONS).toContain('"rules"');
    expect(MAILBOX_INSTRUCTIONS).toContain("Do not quote a price");
    expect(MAILBOX_INSTRUCTIONS).toContain("not a receipt");
    expect(MAILBOX_INSTRUCTIONS).toContain("answer the new message");
  });

  it("asks a new sender for the goal, the problem, and the outcome, then a time", () => {
    expect(PROSPECT_INSTRUCTIONS).toContain("what they want to accomplish");
    expect(PROSPECT_INSTRUCTIONS).toContain("problem");
    expect(PROSPECT_INSTRUCTIONS).toContain("outcome");
    expect(PROSPECT_INSTRUCTIONS).toContain("booking link");
    expect(PROSPECT_INSTRUCTIONS).toContain("not a receipt");
    expect(PROSPECT_INSTRUCTIONS).toContain("Do not quote a price");
    expect(PROSPECT_INSTRUCTIONS).toContain('"kind":"other"');
  });
});

describe("starterPrompts", () => {
  it("returns exactly three prompts, each under 80 characters", () => {
    const prompts = starterPrompts();
    expect(prompts).toHaveLength(3);
    expect(new Set(prompts).size).toBe(3);
    for (const prompt of prompts) {
      expect(prompt.trim()).toBe(prompt);
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt.length).toBeLessThan(80);
    }
  });
});

describe("conversationTitle", () => {
  it("uses the first staff message", () => {
    expect(
      conversationTitle([
        { role: "assistant", parts: [{ type: "text", text: "Hello" }] },
        { role: "user", parts: [{ type: "text", text: "What needs me today?" }] },
      ]),
    ).toBe("What needs me today?");
  });

  it("falls back to New chat when the thread is empty or blank", () => {
    expect(conversationTitle([])).toBe("New chat");
    expect(conversationTitle([{ role: "user", parts: [{ type: "text", text: "   " }] }])).toBe("New chat");
  });

  it("shortens a long first sentence", () => {
    const text = "a".repeat(80);
    expect(conversationTitle([{ role: "user", parts: [{ type: "text", text }] }])).toBe(`${"a".repeat(71)}…`);
  });
});

describe("toolTaskStatus", () => {
  it("maps a finished tool to done and a failed tool to blocked", () => {
    expect(toolTaskStatus("complete")).toBe("done");
    expect(toolTaskStatus("error")).toBe("blocked");
    expect(toolTaskStatus("denied")).toBe("blocked");
  });

  it("maps an in-flight tool to doing", () => {
    expect(toolTaskStatus("loading")).toBe("doing");
    expect(toolTaskStatus("streaming")).toBe("doing");
    expect(toolTaskStatus("waiting-approval")).toBe("doing");
    expect(toolTaskStatus("unknown")).toBe("doing");
  });
});
