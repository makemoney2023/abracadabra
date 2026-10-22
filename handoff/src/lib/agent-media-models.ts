/** Models a Grok agent may ask HQ to run. Anything else is refused. */

export type MediaKind = "image" | "video";
export type MediaInput = "json" | "multipart";
export type ReferenceImage = "none" | "optional" | "required";

export type MediaModel = {
  id: string;
  kind: MediaKind;
  input: MediaInput;
  referenceImage: ReferenceImage;
};

export const DEFAULT_STILL = "@cf/black-forest-labs/flux-2-klein-9b";
export const DEFAULT_CLIP = "google/veo-3.1-fast";

const MODELS: readonly MediaModel[] = [
  { id: DEFAULT_STILL, kind: "image", input: "multipart", referenceImage: "none" },
  { id: "@cf/black-forest-labs/flux-2-dev", kind: "image", input: "json", referenceImage: "none" },
  { id: "@cf/leonardo/lucid-origin", kind: "image", input: "json", referenceImage: "none" },
  { id: "@cf/leonardo/phoenix-1.0", kind: "image", input: "json", referenceImage: "none" },
  { id: "black-forest-labs/flux-2-pro-preview", kind: "image", input: "json", referenceImage: "none" },
  { id: "google/nano-banana-2", kind: "image", input: "json", referenceImage: "none" },
  { id: "xai/grok-imagine-image", kind: "image", input: "json", referenceImage: "none" },
  { id: "pruna/p-image", kind: "image", input: "json", referenceImage: "none" },
  { id: DEFAULT_CLIP, kind: "video", input: "json", referenceImage: "optional" },
  { id: "xai/grok-imagine-video", kind: "video", input: "json", referenceImage: "optional" },
  { id: "black-forest-labs/flux-3-video", kind: "video", input: "json", referenceImage: "optional" },
  { id: "pruna/p-video", kind: "video", input: "json", referenceImage: "none" },
  { id: "alibaba/wan-2.7-i2v", kind: "video", input: "json", referenceImage: "required" },
];

const BY_ID = new Map(MODELS.map((model) => [model.id, model]));

export function listMediaModels(): MediaModel[] {
  return MODELS.map((model) => ({ ...model }));
}

export function mediaModel(id: string): MediaModel | null {
  return BY_ID.get(id.trim()) ?? null;
}
