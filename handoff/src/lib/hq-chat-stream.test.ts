import { describe, expect, it } from "vitest";
import { closeDanglingStreamParts, rechunkSse } from "./hq-chat-stream";

type Part = { type: string; text?: string; state?: string; toolCallId?: string };

describe("closeDanglingStreamParts", () => {
  it("marks an open text part done so the next continuation can send text-start", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          { type: "text", text: "Waiting", state: "streaming" },
          { type: "tool-publish_deliverable", state: "approval-requested", toolCallId: "call-1" },
        ] as Part[],
      },
    ];
    closeDanglingStreamParts(messages);
    expect(messages[0]?.parts[0]).toMatchObject({ type: "text", state: "done" });
    expect(messages[0]?.parts[1]).toMatchObject({ state: "approval-requested" });
  });

  it("leaves a finished text part and a user message alone", () => {
    const messages = [
      { role: "user", parts: [{ type: "text", text: "Publish it", state: "streaming" }] },
      { role: "assistant", parts: [{ type: "text", text: "Done", state: "done" }, { type: "reasoning", text: "Think", state: "streaming" }] },
    ];
    closeDanglingStreamParts(messages);
    expect(messages[0]?.parts[0]).toMatchObject({ state: "streaming" });
    expect(messages[1]?.parts[0]).toMatchObject({ state: "done" });
    expect(messages[1]?.parts[1]).toMatchObject({ type: "reasoning", state: "done" });
  });
});

/** The chat agent splits each read on newlines and swallows a line that is not valid JSON. */
function agentChunkTypes(chunks: Uint8Array[]): string[] {
  const decoder = new TextDecoder();
  const types: string[] = [];
  for (const chunk of chunks) {
    for (const line of decoder.decode(chunk).split("\n")) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      try {
        const data = JSON.parse(line.slice(6)) as { type?: string };
        if (data.type) types.push(data.type);
      } catch {
        // The agent drops a partial line the same way.
      }
    }
  }
  return types;
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array[]> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    if (value) chunks.push(value);
  }
}

describe("rechunkSse", () => {
  it("rejoins a text-start line that was split before the following text-delta", async () => {
    const start = 'data: {"type":"text-start","id":"FdDp3cRbTjIThnRB"}\n';
    const delta = 'data: {"type":"text-delta","id":"FdDp3cRbTjIThnRB","delta":"Hello"}\n';
    const splitAt = start.indexOf('"id"');
    const raw = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(start.slice(0, splitAt)));
        controller.enqueue(encoder.encode(start.slice(splitAt) + delta));
        controller.close();
      },
    });
    const broken = await collect(raw);
    expect(agentChunkTypes(broken)).toEqual(["text-delta"]);

    const whole = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(start.slice(0, splitAt)));
        controller.enqueue(encoder.encode(start.slice(splitAt) + delta));
        controller.close();
      },
    });
    const repaired = await collect(rechunkSse(whole));
    expect(agentChunkTypes(repaired)).toEqual(["text-start", "text-delta"]);
  });
});
