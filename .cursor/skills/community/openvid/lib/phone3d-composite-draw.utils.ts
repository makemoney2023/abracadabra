import type { MutableRefObject } from "react";
import { drawMaskedImage } from "@/lib/masked-image-draw.utils";
import { PHONE_H, PHONE_W, DEVICE_3D_DIMENSIONS, type ImageMaskConfigLike } from "@/lib/phone3d.utils";
import type { Mockup3DMotionTransform } from "@/lib/mockup-motion-3d";
import { REST_MOCKUP_3D_MOTION } from "@/lib/mockup-motion-3d";
import * as THREE from "three";

export interface Phone3DApi {
  renderAt: (w: number, h: number) => void;
  restorePreview: () => void;
  hasBuiltInShadow?: boolean;
  getVisualSize?: () => { width: number; height: number; offsetY?: number } | null;
}

export interface Phone3DCompositeContext {
  imagePhoneCanvasRef: MutableRefObject<HTMLCanvasElement | null>;
  imagePhoneApiRef: MutableRefObject<Phone3DApi | null>;
  canvasDimensions: { width: number; height: number } | null;
  imagePhoneDevice: string;
  imagePhoneScale: number;
  imagePhoneX: number;
  imagePhoneY: number;
  imagePhoneShadow: number;
  imagePhoneShadowColor: string;
  effectivePhoneMaskConfig: ImageMaskConfigLike | null | undefined;
  maskCompositeCanvasRef: MutableRefObject<HTMLCanvasElement | null>;
  /** Root group ref for applying 3D motion during export. */
  imagePhoneRootRef?: MutableRefObject<THREE.Group | null>;
  /** 3D motion transform to apply before rendering each export frame. */
  motion3DForFrame?: Mockup3DMotionTransform;
}

// Cache of the base transform so we can restore after export rendering.
let cachedBase: {
  rx: number; ry: number; rz: number;
  sx: number; sy: number; sz: number;
  px: number; py: number; pz: number;
} | null = null;

export function drawPhone3DCompositeWithZoom(
  c: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  _frameTime: number,
  zs: { scale: number; focusX: number; focusY: number },
  highQuality: boolean,
  pivotX: number,
  pivotY: number,
  ctx2: Phone3DCompositeContext,
): void {
  const {
    imagePhoneCanvasRef, imagePhoneApiRef, canvasDimensions, imagePhoneDevice,
    imagePhoneScale, imagePhoneX, imagePhoneY, imagePhoneShadow, imagePhoneShadowColor,
    effectivePhoneMaskConfig, maskCompositeCanvasRef,
    imagePhoneRootRef, motion3DForFrame,
  } = ctx2;

  const phoneGL = imagePhoneCanvasRef.current!;
  const domW = canvasDimensions?.width ?? canvasWidth;
  const pxScale = canvasWidth / domW;
  const zScale = zs.scale;
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  const measuredDims = imagePhoneApiRef.current?.getVisualSize?.();
  const deviceDims = measuredDims ?? DEVICE_3D_DIMENSIONS[imagePhoneDevice] ?? { width: PHONE_W, height: PHONE_H };
  const visualOffsetY = (measuredDims?.offsetY ?? 0) * imagePhoneScale * pxScale;
  const baseCx = centerX + imagePhoneX * pxScale;
  const baseCy = centerY + imagePhoneY * pxScale + visualOffsetY;
  const baseW = deviceDims.width * imagePhoneScale * pxScale;
  const baseH = deviceDims.height * imagePhoneScale * pxScale;

  // Apply 3D motion to the root group before high-quality render so the
  // exported frame reflects the motion at this frame time. We capture the
  // base transform on first use and restore it after rendering.
  const root = imagePhoneRootRef?.current;
  const motion = motion3DForFrame ?? REST_MOCKUP_3D_MOTION;
  const hasMotion = root && motion !== REST_MOCKUP_3D_MOTION;

  if (hasMotion && root) {
    if (!cachedBase) {
      cachedBase = {
        rx: root.rotation.x, ry: root.rotation.y, rz: root.rotation.z,
        sx: root.scale.x, sy: root.scale.y, sz: root.scale.z,
        px: root.position.x, py: root.position.y, pz: root.position.z,
      };
    }
    root.rotation.x = cachedBase.rx + motion.rotX;
    root.rotation.y = cachedBase.ry + motion.rotY;
    root.rotation.z = cachedBase.rz + motion.rotZ;
    root.scale.x = cachedBase.sx * motion.scale;
    root.scale.y = cachedBase.sy * motion.scale;
    root.scale.z = cachedBase.sz * motion.scale;
    root.position.x = cachedBase.px + motion.posX;
    root.position.y = cachedBase.py + motion.posY;
    root.position.z = cachedBase.pz + motion.posZ;
  }

  if (highQuality) {
    imagePhoneApiRef.current?.renderAt(baseW, baseH);
  }

  c.save();
  if (zScale !== 1) {
    c.translate(pivotX, pivotY);
    c.scale(zScale, zScale);
    c.translate(-pivotX, -pivotY);
  }

  const hasBuiltInShadow = imagePhoneApiRef.current?.hasBuiltInShadow ?? false;
  if (imagePhoneShadow > 0.01 && !hasBuiltInShadow) {
    const sT = imagePhoneShadow * imagePhoneShadow;
    const sBlur = sT * 60;
    const sOpacity = sT * 0.7;
    c.save();
    c.globalAlpha = sOpacity;
    c.filter = `blur(${Math.max(2, sBlur * 0.6) * pxScale}px)`;
    c.beginPath();
    c.ellipse(
      baseCx,
      baseCy + baseH / 2 + sBlur * 0.2 * pxScale,
      baseW * (0.6 - sT * 0.1) / 2,
      Math.max(4, sBlur * 0.55) * pxScale / 2,
      0, 0, Math.PI * 2
    );
    c.fillStyle = imagePhoneShadowColor;
    c.fill();
    c.restore();
  }

  if (imagePhoneShadow > 0.01) {
    c.shadowColor = imagePhoneShadowColor;
    c.shadowBlur = 28 * imagePhoneShadow * pxScale;
    c.shadowOffsetX = 0;
    c.shadowOffsetY = 18 * imagePhoneShadow * pxScale;
  }

  drawMaskedImage(c, phoneGL, baseCx - baseW / 2, baseCy - baseH / 2, baseW, baseH, effectivePhoneMaskConfig, maskCompositeCanvasRef);

  if (imagePhoneShadow > 0.01) {
    c.shadowColor = "transparent";
    c.shadowBlur = 0;
    c.shadowOffsetY = 0;
  }

  c.restore();

  if (highQuality) {
    imagePhoneApiRef.current?.restorePreview();
  }

  // Restore the root group's base transform after rendering so the live
  // preview's Motion3DApplicator doesn't compound on our changes.
  if (hasMotion && root && cachedBase) {
    root.rotation.x = cachedBase.rx;
    root.rotation.y = cachedBase.ry;
    root.rotation.z = cachedBase.rz;
    root.scale.x = cachedBase.sx;
    root.scale.y = cachedBase.sy;
    root.scale.z = cachedBase.sz;
    root.position.x = cachedBase.px;
    root.position.y = cachedBase.py;
    root.position.z = cachedBase.pz;
  }
}
