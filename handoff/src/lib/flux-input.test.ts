import { describe, expect, it } from "vitest";
import { fluxInput } from "./flux-input";

describe("fluxInput", () => {
  it("sends the prompt as a multipart stream with the boundary content type", async () => {
    const input = fluxInput("A quiet room");
    expect(input.multipart.contentType.startsWith("multipart/form-data; boundary=")).toBe(true);
    expect(input.multipart.body).toBeInstanceOf(ReadableStream);
    const text = await new Response(input.multipart.body).text();
    expect(text).toContain('name="prompt"');
    expect(text).toContain("A quiet room");
    expect(text).toContain('name="width"');
    expect(text).toContain("1024");
    expect(text).toContain('name="height"');
  });
});
