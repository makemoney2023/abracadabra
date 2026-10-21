import { describe, expect, it } from "vitest";
import { readTextCapped } from "@/lib/read-capped";

function streamed(parts: string[]) {
  let cancelled = false;
  let pulled = 0;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled >= parts.length) return controller.close();
      controller.enqueue(encoder.encode(parts[pulled++]!));
    },
    cancel() {
      cancelled = true;
    },
  });
  return { response: new Response(body), state: () => ({ cancelled, pulled }) };
}

describe("readTextCapped", () => {
  it("returns the whole body when it is under the cap", async () => {
    expect(await readTextCapped(new Response("hello"), 100)).toBe("hello");
    expect(await readTextCapped(new Response(null), 100)).toBe("");
  });

  it("stops at the cap and cancels the rest of a huge body", async () => {
    const parts = Array.from({ length: 1000 }, () => "x".repeat(1000));
    const { response, state } = streamed(parts);
    const text = await readTextCapped(response, 5_500);
    expect(text).toHaveLength(5_500);
    expect(state().cancelled).toBe(true);
    expect(state().pulled).toBeLessThan(10);
  });

  it("does not split a multi-byte character into garbage beyond one replacement", async () => {
    const text = await readTextCapped(new Response("ééé"), 3);
    expect(text.startsWith("é")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(2);
  });
});
