import { describe, expect, it } from "vitest";
import { DEFAULT_CLIP, DEFAULT_STILL, listMediaModels, mediaModel } from "./agent-media-models";

describe("agent media allowlist", () => {
  it("names the default still and the default clip", () => {
    expect(mediaModel(DEFAULT_STILL)).toMatchObject({ kind: "image", input: "multipart" });
    expect(mediaModel(DEFAULT_CLIP)).toMatchObject({ kind: "video", referenceImage: "optional" });
    expect(listMediaModels().some((model) => model.id === DEFAULT_STILL)).toBe(true);
    expect(listMediaModels().some((model) => model.id === DEFAULT_CLIP)).toBe(true);
  });

  it("rejects a model that is not on the list", () => {
    expect(mediaModel("google/veo-99")).toBeNull();
    expect(mediaModel("")).toBeNull();
  });

  it("marks veo as video", () => {
    expect(mediaModel("google/veo-3.1-fast")?.kind).toBe("video");
  });
});
