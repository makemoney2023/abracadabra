/** Models a Grok agent may ask HQ to run. The agent picks one. Anything else is refused. */

export type MediaKind = "image" | "video";
export type MediaInput = "json" | "multipart";
export type ReferenceImage = "none" | "optional" | "required";
export type MediaFit = "text-to-image" | "edit" | "text-to-video" | "image-to-video" | "upscale" | "background";
export type PromptField = "prompt" | "instruction" | "omit";
export type ImageField = "omit" | "image" | "image_input" | "images" | "input_images" | "keyframes";
export type ImageShape = "string" | "list" | "url" | "keyframes";
export type ImageEncoding = "data-uri" | "base64";
export type DurationField = "none" | "label" | "seconds";

export const MEDIA_FITS: readonly MediaFit[] = ["text-to-image", "edit", "text-to-video", "image-to-video", "upscale", "background"];

export type MediaModel = {
  id: string;
  kind: MediaKind;
  input: MediaInput;
  referenceImage: ReferenceImage;
  fits: MediaFit[];
  note: string;
  promptField: PromptField;
  imageField: ImageField;
  imageShape: ImageShape;
  imageEncoding: ImageEncoding;
  duration: DurationField;
  /** When set, these are the only durations the agent may ask for. */
  durationAllowed: readonly number[] | null;
  /** Fields the provider requires and that do not change per job. */
  defaults: Readonly<Record<string, string | number | boolean>> | null;
};

/** A hosted still on the list. The agent names the model; HQ does not substitute this. */
export const DEFAULT_STILL = "@cf/black-forest-labs/flux-2-klein-9b";
/** A clip on the list. The agent names the model; HQ does not substitute this. */
export const DEFAULT_CLIP = "google/veo-3.1-fast";

const MODELS: readonly MediaModel[] = [
  model({
    id: DEFAULT_STILL,
    kind: "image",
    input: "multipart",
    fits: ["text-to-image"],
    note: "Fast hosted still from a prompt. No reference image.",
  }),
  model({
    id: "@cf/black-forest-labs/flux-2-dev",
    kind: "image",
    fits: ["text-to-image"],
    note: "Hosted Flux still from a prompt.",
  }),
  model({
    id: "@cf/leonardo/lucid-origin",
    kind: "image",
    fits: ["text-to-image"],
    note: "Hosted Leonardo still from a prompt.",
  }),
  model({
    id: "@cf/leonardo/phoenix-1.0",
    kind: "image",
    fits: ["text-to-image"],
    note: "Hosted Leonardo still from a prompt.",
  }),
  model({
    id: "black-forest-labs/flux-2-pro-preview",
    kind: "image",
    referenceImage: "optional",
    fits: ["text-to-image", "edit"],
    note: "Production still. Optional reference stills for an edit.",
    imageField: "input_images",
    imageShape: "list",
  }),
  model({
    id: "black-forest-labs/flux-2-max",
    kind: "image",
    referenceImage: "optional",
    fits: ["text-to-image", "edit"],
    note: "Higher-detail still. Optional reference stills for an edit.",
    imageField: "input_images",
    imageShape: "list",
  }),
  model({
    id: "google/nano-banana-2",
    kind: "image",
    referenceImage: "optional",
    fits: ["text-to-image", "edit"],
    note: "Google still. One optional reference still for an edit.",
    imageField: "image_input",
    imageShape: "list",
  }),
  model({
    id: "google/nano-banana-2.1",
    kind: "image",
    referenceImage: "optional",
    fits: ["text-to-image", "edit"],
    note: "Newer Google still. One optional reference still for an edit.",
    imageField: "image_input",
    imageShape: "list",
  }),
  model({
    id: "xai/grok-imagine-image",
    kind: "image",
    fits: ["text-to-image"],
    note: "Grok still from a prompt.",
  }),
  model({
    id: "xai/grok-imagine-image-2.0",
    kind: "image",
    fits: ["text-to-image"],
    note: "Newer Grok still from a prompt.",
  }),
  model({
    id: "pruna/p-image",
    kind: "image",
    fits: ["text-to-image"],
    note: "Fast still from a prompt.",
  }),
  model({
    id: "openai/gpt-image-2",
    kind: "image",
    referenceImage: "optional",
    fits: ["text-to-image", "edit"],
    note: "OpenAI still. Optional reference stills for an edit.",
    imageField: "images",
    imageShape: "list",
  }),
  model({
    id: "recraft/recraftv4-1-flash",
    kind: "image",
    fits: ["text-to-image"],
    note: "Fast raster still from a prompt, including logos and posters.",
  }),
  model({
    id: "bytedance/seedream-5-pro",
    kind: "image",
    referenceImage: "optional",
    fits: ["text-to-image", "edit"],
    note: "ByteDance still. Optional reference stills for an edit.",
    imageField: "images",
    imageShape: "list",
  }),
  model({
    id: "bria/fibo-edit-1.5",
    kind: "image",
    referenceImage: "required",
    fits: ["edit"],
    note: "Edit a ready still from an instruction.",
    promptField: "instruction",
    imageField: "images",
    imageShape: "list",
  }),
  model({
    id: "pruna/p-image-upscale",
    kind: "image",
    referenceImage: "required",
    fits: ["upscale"],
    note: "Make a ready still sharper. Send image_media_id.",
    promptField: "omit",
    imageField: "image",
  }),
  model({
    id: "bria/remove-background",
    kind: "image",
    referenceImage: "required",
    fits: ["background"],
    note: "Cut the background from a ready still. Send image_media_id.",
    promptField: "omit",
    imageField: "image",
  }),
  model({
    id: DEFAULT_CLIP,
    kind: "video",
    referenceImage: "optional",
    fits: ["text-to-video", "image-to-video"],
    note: "Short clip from a prompt, or from a ready still. 4, 6, or 8 seconds.",
    imageField: "image_input",
    imageEncoding: "base64",
    duration: "label",
  }),
  model({
    id: "xai/grok-imagine-video",
    kind: "video",
    referenceImage: "optional",
    fits: ["text-to-video", "image-to-video"],
    note: "Clip from a prompt or a first frame. 4, 6, or 8 seconds.",
    imageShape: "url",
    duration: "seconds",
  }),
  model({
    id: "black-forest-labs/flux-3-video",
    kind: "video",
    referenceImage: "optional",
    fits: ["text-to-video", "image-to-video"],
    note: "Clip from a prompt or a reference still. 6 or 8 seconds.",
    imageField: "keyframes",
    imageShape: "keyframes",
    imageEncoding: "base64",
    duration: "seconds",
    durationAllowed: [6, 8],
    defaults: { mode: "t2v" },
  }),
  model({
    id: "pruna/p-video",
    kind: "video",
    referenceImage: "optional",
    fits: ["text-to-video", "image-to-video"],
    note: "Clip from a prompt or a reference still. 4, 6, or 8 seconds.",
    duration: "seconds",
    defaults: {
      resolution: "720p",
      fps: 24,
      aspect_ratio: "16:9",
      draft: false,
      save_audio: true,
      prompt_upsampling: true,
      disable_safety_filter: true,
    },
  }),
  model({
    id: "alibaba/wan-2.7-i2v",
    kind: "video",
    referenceImage: "required",
    fits: ["image-to-video"],
    note: "Clip that starts from a ready still. image_media_id is required.",
    duration: "seconds",
  }),
];

const BY_ID = new Map(MODELS.map((entry) => [entry.id, entry]));

export function isMediaFit(value: string): value is MediaFit {
  return (MEDIA_FITS as readonly string[]).includes(value);
}

export function listMediaModels(fits?: MediaFit): MediaModel[] {
  const rows = fits ? MODELS.filter((entry) => entry.fits.includes(fits)) : MODELS;
  return rows.map(copy);
}

export function mediaModel(id: string): MediaModel | null {
  const found = BY_ID.get(id.trim());
  return found ? copy(found) : null;
}

function model(spec: {
  id: string;
  kind: MediaKind;
  input?: MediaInput;
  referenceImage?: ReferenceImage;
  fits: MediaFit[];
  note: string;
  promptField?: PromptField;
  imageField?: ImageField;
  imageShape?: ImageShape;
  imageEncoding?: ImageEncoding;
  duration?: DurationField;
  durationAllowed?: readonly number[];
  defaults?: Readonly<Record<string, string | number | boolean>>;
}): MediaModel {
  const referenceImage = spec.referenceImage ?? "none";
  return {
    id: spec.id,
    kind: spec.kind,
    input: spec.input ?? "json",
    referenceImage,
    fits: spec.fits,
    note: spec.note,
    promptField: spec.promptField ?? "prompt",
    imageField: spec.imageField ?? (referenceImage === "none" ? "omit" : "image"),
    imageShape: spec.imageShape ?? "string",
    imageEncoding: spec.imageEncoding ?? "data-uri",
    duration: spec.duration ?? (spec.kind === "video" ? "label" : "none"),
    durationAllowed: spec.durationAllowed ?? null,
    defaults: spec.defaults ?? null,
  };
}

function copy(entry: MediaModel): MediaModel {
  return {
    ...entry,
    fits: [...entry.fits],
    durationAllowed: entry.durationAllowed ? [...entry.durationAllowed] : null,
    defaults: entry.defaults ? { ...entry.defaults } : null,
  };
}
