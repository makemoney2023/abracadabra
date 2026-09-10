import type { MutableRefObject } from "react";
import { applyGradientMaskToRegion } from "@/lib/media-mask.utils";
import type { ImageMaskConfigLike } from "@/lib/phone3d.utils";

export function drawMaskedImage(
  destCtx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
  maskConfig: ImageMaskConfigLike | null | undefined,
  maskCompositeCanvasRef: MutableRefObject<HTMLCanvasElement | null>,
): void {
  if (!maskConfig?.enabled) {
    destCtx.drawImage(img, x, y, w, h);
    return;
  }

  const safeW = Math.max(1, Math.round(w));
  const safeH = Math.max(1, Math.round(h));
  let off = maskCompositeCanvasRef.current;
  if (!off) {
    off = document.createElement('canvas');
    maskCompositeCanvasRef.current = off;
  }
  if (off.width !== safeW || off.height !== safeH) {
    off.width = safeW;
    off.height = safeH;
  }
  const offCtx = off.getContext('2d');
  if (!offCtx) {
    destCtx.drawImage(img, x, y, w, h);
    return;
  }
  offCtx.setTransform(1, 0, 0, 1, 0, 0);
  offCtx.clearRect(0, 0, safeW, safeH);
  offCtx.drawImage(img, 0, 0, safeW, safeH);
  applyGradientMaskToRegion(offCtx, 0, 0, safeW, safeH, maskConfig);
  destCtx.drawImage(off, x, y, w, h);
}