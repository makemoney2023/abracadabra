import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EnvironmentPreset } from "./viewer-controls3d";

export interface DeviceConfig {
  modelUrl: string | null;
  aspectRatio: number;
  screenHeightFactor: number;
  screenOffset: { x: number; y: number; z: number };
  cornerRadiusFactor: number;
}

export interface ImageMaskConfigLike {
  enabled?: boolean;
  top?: { from: number; to?: number };
  right?: { from: number; to?: number };
  bottom?: { from: number; to?: number };
  left?: { from: number; to?: number };
  angle?: number;
  angleFrom?: number;
  angleTo?: number;
}

export const PHONE_H = 704;
export const PHONE_W = Math.round(PHONE_H * 0.479);

export const RENDER_MULTIPLIER = 4;
export const RENDER_W = PHONE_W * RENDER_MULTIPLIER;
export const RENDER_H = PHONE_H * RENDER_MULTIPLIER;

export const DEVICE_3D_DIMENSIONS: Record<string, { width: number; height: number }> = {
  'phone': { width: PHONE_W, height: PHONE_H },
  'iphone': { width: PHONE_W, height: PHONE_H },
  'iphone-13-pro-max': { width: 480, height: 1000 },
  'iphone-17-pro-max': { width: 480, height: 1000 },
  'double_iphone_13_pro': { width: 960, height: 2000 },
  'laptop': { width: 1500, height: 1035 },
  'ipad_mini_6_2021': { width: 1040, height: 1500 },
};

export const PHONE_DEVICE_URLS: Record<string, string | undefined> = {
    phone: '/models/phone-gltf.glb',
    iphone: '/models/iphone-15-pro-max.glb',
    'iphone-13-pro-max': '/models/apple_iphone_13_pro_max.glb',
    'double_iphone_13_pro': '/models/double_iphone_13_pro.glb',
    'iphone-17-pro-max': '/models/iphone-17-pro-max.glb',
    'ipad_mini_6_2021': '/models/ipad_mini_6_2021.glb',
    laptop: '/models/mac-book.glb',
};

export const CAM_FOV = 20;
export const CAM_Z = 6;

export type DeviceKey = "iphone" | "phone" | "double_iphone_13_pro";

export const deviceConfigs: Record<DeviceKey, DeviceConfig> = {
  iphone: {
    modelUrl: "/models/iphone-15-pro-max.glb",
    aspectRatio: 1290 / 2796,
    screenHeightFactor: 0.826,
    screenOffset: { x: 0.027, y: 0.745, z: 0.098 },
    cornerRadiusFactor: 0.16,
  },
  double_iphone_13_pro: {
    modelUrl: "/models/double-iphone-13-pro.glb",
    aspectRatio: 1290 / 2796,
    screenHeightFactor: 0.826,
    screenOffset: { x: 0.027, y: 0.745, z: 0.098 },
    cornerRadiusFactor: 0.16,
  },
  phone: {
    modelUrl: "/models/phone-gltf.glb",
    aspectRatio: 0,
    screenHeightFactor: 0,
    screenOffset: { x: 0, y: 0, z: 0 },
    cornerRadiusFactor: 0,
  },
};

export const DEVICE_VIEWER_DEFAULTS: Record<string, { environment: EnvironmentPreset; glow: number }> = {
  double_iphone_13_pro: { environment: "studio", glow: 3.0 },
  "iphone-13-pro-max": { environment: "sunset", glow: 2.0 },
  "iphone-17-pro-max": { environment: "studio", glow: 1.0 },
  laptop: { environment: "forest", glow: 1.0 },
  phone: { environment: "studio", glow: 2.0 },
  iphone: { environment: "studio", glow: 2.0 },
  "ipad_mini_6_2021": { environment: "studio", glow: 1.0 },
};

export function getDeviceFromModelUrl(modelUrl: string | undefined): DeviceKey {
  if (!modelUrl) return "phone";
  if (modelUrl.includes("iphone")) return "iphone";
  return "phone";
}
export function createCoverScreenCanvas(
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  targetW: number,
  targetH: number,
  cornerRadius: number,
  maskConfig?: ImageMaskConfigLike | null
): HTMLCanvasElement | OffscreenCanvas {
  let srcW: number, srcH: number;
  
  if (source instanceof HTMLImageElement) {
    srcW = source.naturalWidth || source.width || 1;
    srcH = source.naturalHeight || source.height || 1;
  } else if (source instanceof HTMLVideoElement) {
    srcW = source.videoWidth || 1;
    srcH = source.videoHeight || 1;
  } else {
    srcW = source.width || 1;
    srcH = source.height || 1;
  }

  const scale = Math.max(targetW / srcW, targetH / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const offsetX = (targetW - drawW) / 2;
  const offsetY = (targetH - drawH) / 2;

  const canvas = createOptimalCanvas(targetW, targetH);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const r = Math.min(cornerRadius, Math.min(targetW, targetH) / 2);

  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(targetW - r, 0);
  ctx.quadraticCurveTo(targetW, 0, targetW, r);
  ctx.lineTo(targetW, targetH - r);
  ctx.quadraticCurveTo(targetW, targetH, targetW - r, targetH);
  ctx.lineTo(r, targetH);
  ctx.quadraticCurveTo(0, targetH, 0, targetH - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.clip();
  
  ctx.drawImage(source, offsetX, offsetY, drawW, drawH);

  if (maskConfig?.enabled) {
    const drawGradient = (cssAngleDeg: number, from: number, to: number) => {
      const a = (cssAngleDeg * Math.PI) / 180;
      const cx = targetW / 2;
      const cy = targetH / 2;
      const diag = Math.sqrt(targetW * targetW + targetH * targetH);
      const dx = Math.sin(a) * diag;
      const dy = -Math.cos(a) * diag;
      
      const g = ctx.createLinearGradient(cx - dx / 2, cy - dy / 2, cx + dx / 2, cy + dy / 2);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(Math.max(0, Math.min(1, from / 100)), "rgba(0,0,0,1)");
      g.addColorStop(Math.max(0, Math.min(1, (to ?? 100) / 100)), "rgba(0,0,0,0)");
      
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.globalCompositeOperation = "source-over";
    };

    if (maskConfig.top) drawGradient(180, maskConfig.top.from, maskConfig.top.to ?? 100);
    if (maskConfig.bottom) drawGradient(0, maskConfig.bottom.from, maskConfig.bottom.to ?? 100);
    if (maskConfig.left) drawGradient(90, maskConfig.left.from, maskConfig.left.to ?? 100);
    if (maskConfig.right) drawGradient(270, maskConfig.right.from, maskConfig.right.to ?? 100);
    if (maskConfig.angle !== undefined) drawGradient(maskConfig.angle, maskConfig.angleFrom ?? 0, maskConfig.angleTo ?? 100);
  }

  return canvas;
}

const gltfUrlCache = new Map<string, Promise<THREE.Group>>();

export function loadGltfFromUrl(url: string): Promise<THREE.Group> {
  if (!gltfUrlCache.has(url)) {
    gltfUrlCache.set(
      url,
      new Promise<THREE.Group>((resolve, reject) =>
        new GLTFLoader().load(
          url,
          (gltf) => resolve(gltf.scene as THREE.Group),
          undefined,
          reject
        )
      )
    );
  }
  return gltfUrlCache.get(url)!;
}

export function loadGltfGroup(): Promise<THREE.Group> {
  return loadGltfFromUrl("/models/phone-gltf.glb");
}

export function cloneGroup(src: THREE.Group): THREE.Group {
  const cloned = src.clone(true);
  cloned.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const orig = obj.material as THREE.Material | THREE.Material[];
      if (Array.isArray(orig)) {
        obj.material = orig.map((m) => m.clone());
      } else {
        obj.material = orig.clone();
      }
    }
  });
  return cloned;
}

export function parseShadowColor(hex: string, opacity: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.length === 3 ? h[0] + h[0] : h.slice(0, 2), 16);
  const g = parseInt(h.length === 3 ? h[1] + h[1] : h.slice(2, 4), 16);
  const b = parseInt(h.length === 3 ? h[2] + h[2] : h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity.toFixed(3)})`;
}

export interface CropAreaLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function applyCropToImage(
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  cropArea: CropAreaLike | null | undefined
): HTMLCanvasElement {
  let srcW: number, srcH: number;
  if (source instanceof HTMLImageElement) {
    srcW = source.naturalWidth || source.width || 1;
    srcH = source.naturalHeight || source.height || 1;
  } else if (source instanceof HTMLVideoElement) {
    srcW = source.videoWidth || 1;
    srcH = source.videoHeight || 1;
  } else {
    srcW = source.width || 1;
    srcH = source.height || 1;
  }

  const isFullCrop = !cropArea
    || (cropArea.x <= 0 && cropArea.y <= 0
      && cropArea.width >= 100 && cropArea.height >= 100);
  if (isFullCrop) {
    const out = document.createElement("canvas");
    out.width = srcW;
    out.height = srcH;
    out.getContext("2d")!.drawImage(source, 0, 0, srcW, srcH);
    return out;
  }

  const x = Math.max(0, Math.min(100, cropArea.x));
  const y = Math.max(0, Math.min(100, cropArea.y));
  const width = Math.max(1, Math.min(100 - x, cropArea.width));
  const height = Math.max(1, Math.min(100 - y, cropArea.height));

  const sx = (x / 100) * srcW;
  const sy = (y / 100) * srcH;
  const sw = (width / 100) * srcW;
  const sh = (height / 100) * srcH;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw);
  canvas.height = Math.round(sh);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}
export function applyTextureCover(
  texture: THREE.Texture,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  cropArea?: CropAreaLike | null
) {
  if (sourceWidth === 0 || sourceHeight === 0) return;

  let cropX = 0, cropY = 0, cropW = 1, cropH = 1;
  if (cropArea) {
    const x = Math.max(0, Math.min(100, cropArea.x));
    const y = Math.max(0, Math.min(100, cropArea.y));
    const width = Math.max(1, Math.min(100 - x, cropArea.width));
    const height = Math.max(1, Math.min(100 - y, cropArea.height));
    cropX = x / 100;
    cropY = y / 100;
    cropW = width / 100;
    cropH = height / 100;
  }

  const croppedWidth = sourceWidth * cropW;
  const croppedHeight = sourceHeight * cropH;
  const croppedAspect = croppedWidth / croppedHeight;
  const targetAspect = targetWidth / targetHeight;

  let repeatWithinCropX: number;
  let repeatWithinCropY: number;
  if (croppedAspect > targetAspect) {
    repeatWithinCropX = targetAspect / croppedAspect;
    repeatWithinCropY = 1;
  } else {
    repeatWithinCropX = 1;
    repeatWithinCropY = croppedAspect / targetAspect;
  }
  const offsetWithinCropX = (1 - repeatWithinCropX) / 2;
  const offsetWithinCropY = (1 - repeatWithinCropY) / 2;

  const finalRepeatX = repeatWithinCropX * cropW;
  const finalOffsetX = cropX + offsetWithinCropX * cropW;

  const vBase = texture.flipY ? 1 - (cropY + cropH) : cropY;
  const finalRepeatY = repeatWithinCropY * cropH;
  const finalOffsetY = vBase + offsetWithinCropY * cropH;

  texture.repeat.set(finalRepeatX, finalRepeatY);
  texture.offset.set(finalOffsetX, finalOffsetY);
  texture.needsUpdate = true;
}

function createOptimalCanvas(width: number, height: number) {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}