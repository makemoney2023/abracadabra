import { describe, expect, it } from "vitest";
import { HQ_CHAT_PLAYBOOK } from "./hq-chat-playbook";
import { CHAT_WRITE_TOOLS, HQ_TOOL_HELP, READ_HQ_TOOLS } from "./hq-tool-names";

const chatTools = new Set<string>([...READ_HQ_TOOLS, ...CHAT_WRITE_TOOLS]);

describe("chat tool list", () => {
  it("gives the chat model every tool that has help text", () => {
    const missing = Object.keys(HQ_TOOL_HELP).filter((name) => !chatTools.has(name));
    expect(missing).toEqual([]);
  });

  it("gives the chat model every tool the playbook names", () => {
    const named = Object.keys(HQ_TOOL_HELP).filter((name) => HQ_CHAT_PLAYBOOK.includes(name));
    expect(named).toEqual(expect.arrayContaining(["abandon_pipeline", "accept_workflow", "run_workflow", "answer_question"]));
    expect(named.filter((name) => !chatTools.has(name))).toEqual([]);
  });
});
