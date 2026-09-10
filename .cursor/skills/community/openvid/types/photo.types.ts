import { AspectRatio } from "./editor.types";

export interface Preview3DConfig {
  id: string;
  label: string;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  translateY: number;
  scale: number;
  perspective?: number;
}

export interface PhoneRotationOffset {
  rx: number;
  ry: number;
}

export interface PhoneImagePreviewConfig {
  id: string;
  label: string;
  imageUrl: string | null;
  x: number;
  y: number;
  scale: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
}

export interface LaptopImagePreviewConfig {
  id: string;
  label: string;
  imageUrl: string | null;
  imagePhoneOpening: number;
  x: number;
  y: number;
  scale: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
}
const PHONE_PRESET_META: { id: string; label: string; imageUrl: string }[] = [
  { id: "isometric-left-tilt", label: "Isometric Left Tilt", imageUrl: "/images/devices-positions/phone/isometric-left-tilt.avif" },
  { id: "subtle-low-angle-left", label: "Subtle Low Angle Left", imageUrl: "/images/devices-positions/phone/subtle-low-angle-left.avif" },
  { id: "isometric-forward-twist", label: "Isometric Forward Twist", imageUrl: "/images/devices-positions/phone/isometric-forward-twist.avif" },
  { id: "high-angle-right-shifted", label: "High Angle Right Shifted", imageUrl: "/images/devices-positions/phone/high-angle-right-shifted.avif" },
  { id: "steep-isometric-front", label: "Steep Isometric Front", imageUrl: "/images/devices-positions/phone/steep-isometric-front.avif" },
  { id: "slanted-forward-view", label: "Slanted Forward View", imageUrl: "/images/devices-positions/phone/slanted-forward-view.avif" },
  { id: "flat-front-subtle-turn", label: "Flat Front Subtle Turn", imageUrl: "/images/devices-positions/phone/flat-front-subtle-turn.avif" },
];

type PhoneTransform = Pick<PhoneImagePreviewConfig, "x" | "y" | "scale" | "rotateX" | "rotateY" | "rotateZ">;

function buildPhonePresets(transforms: PhoneTransform[]): PhoneImagePreviewConfig[] {
  return PHONE_PRESET_META.map((meta, i) => ({ ...meta, ...transforms[i] }));
}

const IPHONE13_TRANSFORMS: PhoneTransform[] = [
  { x: 0, y: 0, scale: 1.19, rotateX: -58.23, rotateY: -29.82, rotateZ: 0 },
  { x: 5, y: -6, scale: 0.73, rotateX: -21, rotateY: -29, rotateZ: -25 },
  { x: 23, y: -37, scale: 1.27, rotateX: -59.66, rotateY: -0.43, rotateZ: 40 },
  { x: 26, y: 317, scale: 1.55, rotateX: 24.33, rotateY: -53.09, rotateZ: 0 },
  { x: 19, y: 125, scale: 1.38, rotateX: -52.92, rotateY: 0.44, rotateZ: 0 },
  { x: -5, y: -41, scale: 1.2, rotateX: -58.57, rotateY: -0.64, rotateZ: 0 },
  { x: -12, y: -6, scale: 0.80, rotateX: -4.11, rotateY: 1.22, rotateZ: 0 },
];

const DOUBLE_IPHONE_TRANSFORMS: PhoneTransform[] = [
  { x: -9, y: -21, scale: 0.91, rotateX: -48.22, rotateY: -129.25, rotateZ: 0 },
  { x: -9, y: -21, scale: 0.67, rotateX: 27.38, rotateY: 59.3, rotateZ: 35 },
  { x: 23, y: -21, scale: 0.89, rotateX: -2.19, rotateY: -58.58, rotateZ: -45 },
  { x: 23, y: 156, scale: 1.03, rotateX: 29.61, rotateY: -133.59, rotateZ: 0 },
  { x: -16, y: 117, scale: 1.03, rotateX: -27.01, rotateY: -90.59, rotateZ: 0 },
  { x: -5, y: -67, scale: 0.98, rotateX: -53.78, rotateY: -91.53, rotateZ: 0 },
  { x: 2, y: -21, scale: 0.75, rotateX: 0.72, rotateY: -95.14, rotateZ: 0 }
];

const DEFAULT_PHONE_TRANSFORMS: PhoneTransform[] = [
  { x: 0, y: 0, scale: 1.19, rotateX: -58.23, rotateY: -29.82, rotateZ: 0 },
  { x: -9, y: -13, scale: 0.55, rotateX: -19.08, rotateY: -24.58, rotateZ: 25 },
  { x: 44, y: -29, scale: 0.81, rotateX: -52.93, rotateY: -1.97, rotateZ: -45 },
  { x: 44, y: 387, scale: 1.13, rotateX: 32.43, rotateY: -48.17, rotateZ: 0 },
  { x: -16, y: 340, scale: 1.13, rotateX: -8.16, rotateY: 2.12, rotateZ: 0 },
  { x: -9, y: -44, scale: 0.74, rotateX: -52.05, rotateY: 1.51, rotateZ: 0 },
  { x: -5, y: 10, scale: 0.57, rotateX: -0.62, rotateY: -0.11, rotateZ: 0 }];

export const PHONE_IMAGE_PREVIEWS_IPHONE13: PhoneImagePreviewConfig[] = buildPhonePresets(IPHONE13_TRANSFORMS);
export const PHONE_IMAGE_PREVIEWS_DOUBLE: PhoneImagePreviewConfig[] = buildPhonePresets(DOUBLE_IPHONE_TRANSFORMS);
export const PHONE_IMAGE_PREVIEWS_DEFAULT: PhoneImagePreviewConfig[] = buildPhonePresets(DEFAULT_PHONE_TRANSFORMS);

export function getPhoneImagePreviews(device: string): PhoneImagePreviewConfig[] {
  switch (device) {
    case "iphone-13-pro-max":
      return PHONE_IMAGE_PREVIEWS_IPHONE13;
    case "double_iphone_13_pro":
      return PHONE_IMAGE_PREVIEWS_DOUBLE;
    default:
      return PHONE_IMAGE_PREVIEWS_DEFAULT;
  }
}

export const LAPTOP_IMAGE_PREVIEWS: LaptopImagePreviewConfig[] = [
  { id: "left-angled-shifted", label: "Left Angled Shifted", imagePhoneOpening: 0.75, imageUrl: "/images/devices-positions/laptop/left-angled-shifted.avif", x: 106, y: 2, scale: 1.18, rotateX: 8.43, rotateY: -50.33, rotateZ: 0 },
  { id: "dynamic-tilt-left", label: "Dynamic Tilt Left", imagePhoneOpening: 0.85, imageUrl: "/images/devices-positions/laptop/dynamic-tilt-left.avif", x: 68, y: 33, scale: 1.18, rotateX: 28.28, rotateY: -41.75, rotateZ: -20 },
  { id: "front-close-up", label: "Front Close-up", imagePhoneOpening: 0.65, imageUrl: "/images/devices-positions/laptop/front-close-up.avif", x: 12, y: 25, scale: 1.33, rotateX: 15.67, rotateY: -0.36, rotateZ: 0 },
  { id: "right-angled-shifted", label: "Right Angled Shifted", imagePhoneOpening: 0.80, imageUrl: "/images/devices-positions/laptop/right-angled-shifted.avif", x: -99, y: 10, scale: 1.26, rotateX: 23.45, rotateY: 64.74, rotateZ: 10 },
  { id: "half-closed-front", label: "Half Closed Front", imagePhoneOpening: 0.50, imageUrl: "/images/devices-positions/laptop/half-closed-front.avif", x: 19, y: 17, scale: 1.33, rotateX: 14.2, rotateY: 0.15, rotateZ: 0 },
  { id: "high-angle-left", label: "High Angle Left", imagePhoneOpening: 0.57, imageUrl: "/images/devices-positions/laptop/high-angle-left.avif", x: -9, y: -37, scale: 1.02, rotateX: 35.28, rotateY: -37.9, rotateZ: 0 },
  { id: "steep-side-right", label: "Steep Side Right", imagePhoneOpening: 0.64, imageUrl: "/images/devices-positions/laptop/steep-side-right.avif", x: -44, y: 25, scale: 1.31, rotateX: 9.41, rotateY: 71.45, rotateZ: 0 }
];

export const PREVIEW_CONFIGS: readonly Preview3DConfig[] = Object.freeze([
  Object.freeze({ id: "front", label: "Front", rotateX: 0, rotateY: 0, rotateZ: 0, translateY: 0, scale: 0.9, perspective: 600 }),
  Object.freeze({ id: "top-left-angle", label: "Top Left Angle", rotateX: 18, rotateY: 25, rotateZ: -15, translateY: -10, scale: 0.95, perspective: 500 }),
  Object.freeze({ id: "top-right-angle", label: "Top Right Angle", rotateX: 18, rotateY: -22, rotateZ: 15, translateY: 5, scale: 0.95, perspective: 500 }),
  Object.freeze({ id: "tilt-up", label: "Tilt Up", rotateX: 15, rotateY: 0, rotateZ: 0, translateY: -2, scale: 0.88, perspective: 500 }),
  Object.freeze({ id: "bottom-left-angle", label: "Bottom Left Angle", rotateX: -18, rotateY: 25, rotateZ: 15, translateY: -5, scale: 0.95, perspective: 500 }),
  Object.freeze({ id: "bottom-right-angle", label: "Bottom Right Angle", rotateX: -18, rotateY: -22, rotateZ: -15, translateY: -5, scale: 0.95, perspective: 500 }),
  Object.freeze({ id: "isometric", label: "Isometric", rotateX: 35, rotateY: -45, rotateZ: 10, translateY: 0, scale: 0.85, perspective: 1000 }),
]);

export interface ImageMaskConfig {
  enabled: boolean;
  top?: { from: number; to?: number };
  right?: { from: number; to?: number };
  bottom?: { from: number; to?: number };
  left?: { from: number; to?: number };
  angle?: number;
  angleFrom?: number;
  angleTo?: number;
}

export const DEFAULT_MASK_CONFIG: ImageMaskConfig = {
  enabled: false,
};

export interface PhotoEditorPlaceholderProps {
  className?: string;
  canvasImageUrl?: string | null;
  staticImageUrl?: string | null;
  onSelectPreview?: (config: Preview3DConfig) => void;
  selectedPreviewId?: string;
  aspectRatio?: AspectRatio;
  onAspectRatioChange?: (ratio: AspectRatio) => void;
  customAspectRatio?: { width: number; height: number } | null;
  onCustomAspectRatioChange?: (dimensions: { width: number; height: number }) => void;
  onOpenCropper?: () => void;
  apply3DToBackground?: boolean;
  onToggle3DBackground?: (value: boolean) => void;
  imageMaskConfig?: ImageMaskConfig;
  onImageMaskConfigChange?: (config: ImageMaskConfig) => void;
  imageTransform?: Preview3DConfig;
  onReset?: () => void;
}