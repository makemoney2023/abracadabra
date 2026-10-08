import { getAgentByName } from "agents";
import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { signWake } from "../lib/agent-wake";
import { parseSkillIndex, toolNamesFrom, type ClientAgent } from "./worker";

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
