import assert from "node:assert/strict";
import test from "node:test";
import { flowNodeToPayload, templateNodeToFlowData } from "./workflow-payload.mjs";

test("keeps an empty tool allowlist on template load and save", () => {
  const data = templateNodeToFlowData({
    id: "wh-1",
    type: "writer",
    name: "Direction",
    instructions: "Follow skill.",
    position: { x: 1, y: 2 },
    mcpToolNames: [],
  });
  assert.deepEqual(data.mcpToolNames, []);

  const payload = flowNodeToPayload({
    id: "node-1",
    position: { x: 1, y: 2 },
    data,
  });
  assert.deepEqual(payload.mcpToolNames, []);
});

test("omits the allowlist when the template node does not set one", () => {
  const data = templateNodeToFlowData({
    id: "t1",
    type: "writer",
    name: "Writer",
    instructions: "Write.",
    position: { x: 0, y: 0 },
  });
  assert.equal("mcpToolNames" in data, false);

  const payload = flowNodeToPayload({
    id: "node-2",
    position: { x: 0, y: 0 },
    data,
  });
  assert.equal("mcpToolNames" in payload, false);
});
