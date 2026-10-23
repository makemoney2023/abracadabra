import { describe, expect, it } from "vitest";
import { publicMediaModels } from "./agent-media";
import { DEFAULT_CLIP, DEFAULT_STILL, isMediaFit, listMediaModels, mediaModel } from "./agent-media-models";

describe("agent media allowlist", () => {
  it("names a hosted still and a clip the agent can choose", () => {
    expect(mediaModel(DEFAULT_STILL)).toMatchObject({ kind: "image", input: "multipart", fits: ["text-to-image"] });
    expect(mediaModel(DEFAULT_CLIP)).toMatchObject({ kind: "video", referenceImage: "optional" });
    expect(mediaModel(DEFAULT_CLIP)?.fits).toEqual(expect.arrayContaining(["text-to-video", "image-to-video"]));
    expect(listMediaModels().some((model) => model.id === DEFAULT_STILL)).toBe(true);
    expect(listMediaModels().some((model) => model.id === DEFAULT_CLIP)).toBe(true);
  });

  it("sends both Workers AI Flux 2 stills as multipart, as Cloudflare documents", () => {
    expect(mediaModel("@cf/black-forest-labs/flux-2-dev")?.input).toBe("multipart");
    expect(mediaModel("@cf/black-forest-labs/flux-2-klein-9b")?.input).toBe("multipart");
    expect(mediaModel("black-forest-labs/flux-2-pro-preview")?.input).toBe("json");
  });

  it("rejects a model that is not on the list", () => {
    expect(mediaModel("google/veo-99")).toBeNull();
    expect(mediaModel("")).toBeNull();
    expect(isMediaFit("poster")).toBe(false);
  });

  it("filters the catalog by the job", () => {
    const clips = listMediaModels("text-to-video").map((model) => model.id);
    expect(clips).toContain("google/veo-3.1-fast");
    expect(clips).not.toContain(DEFAULT_STILL);
    expect(clips).not.toContain("alibaba/wan-2.7-i2v");
    expect(listMediaModels("image-to-video").map((model) => model.id)).toContain("alibaba/wan-2.7-i2v");
    expect(listMediaModels("upscale").map((model) => model.id)).toEqual(["pruna/p-image-upscale"]);
    expect(listMediaModels("background").map((model) => model.id)).toEqual(["bria/remove-background"]);
    expect(mediaModel("bria/fibo-edit-1.5")?.fits).toEqual(["edit"]);
    expect(mediaModel("openai/gpt-image-2")?.fits).toEqual(["text-to-image", "edit"]);
    const published = publicMediaModels("text-to-image");
    expect(published.length).toBeGreaterThan(0);
    expect(published.every((model) => model.fits.includes("text-to-image") && model.note.length > 0)).toBe(true);
    expect(published.some((model) => model.id === DEFAULT_CLIP)).toBe(false);
  });
});
