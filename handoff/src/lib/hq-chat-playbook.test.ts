import { describe, expect, it } from "vitest";
import { HQ_CHAT_PLAYBOOK, MAILBOX_INSTRUCTIONS } from "./hq-chat-playbook";

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
});
