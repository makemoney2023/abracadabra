import { describe, expect, it } from "vitest";
import { fluxInput } from "./flux-input";

describe("fluxInput", () => {
  it("sends the prompt as multipart form data", async () => {
    const input = await fluxInput("A quiet room");
    expect(input.multipart.contentType.startsWith("multipart/form-data; boundary=")).toBe(true);
    const text = new TextDecoder().decode(input.multipart.body);
    expect(text).toContain('name="prompt"');
    expect(text).toContain("A quiet room");
    expect(text).toContain('name="width"');
    expect(text).toContain("1024");
    expect(text).toContain('name="height"');
  });
});
