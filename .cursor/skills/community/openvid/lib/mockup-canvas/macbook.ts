import type { MockupCanvasContext, MockupDrawResult } from "./types";
import { MACBOOK_PHOTO_MOCKUP } from "@/lib/photo-mockups.config";

let macbookImageCache: HTMLImageElement | null = null;
let macbookImagePromise: Promise<HTMLImageElement> | null = null;

function loadMacbookImage(): Promise<HTMLImageElement> {
  if (macbookImageCache) return Promise.resolve(macbookImageCache);
  if (!macbookImagePromise) {
    macbookImagePromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { macbookImageCache = img; resolve(img); };
      img.onerror = (e) => {
        console.error("Failed to load MacBook mockup image:", e);
        macbookImagePromise = null;
        reject(e);
      };
      img.src = MACBOOK_PHOTO_MOCKUP.imageSrc;
    });
  }
  return macbookImagePromise;
}

loadMacbookImage().catch(() => {});

export function drawMacBookMockup(context: MockupCanvasContext): MockupDrawResult {
  const { ctx, x, y, width, height, shadowBlur } = context;
  const { screenRect, naturalWidth, naturalHeight } = MACBOOK_PHOTO_MOCKUP;
  const photoAspect = naturalWidth / naturalHeight;
  const boxAspect = width / height;

  let iw: number, ih: number;
  if (photoAspect > boxAspect) {
    iw = width;
    ih = width / photoAspect;
  } else {
    ih = height;
    iw = height * photoAspect;
  }
  const ix = x + (width - iw) / 2;
  const iy = y + (height - ih) / 2;

  if (macbookImageCache) {
    if (shadowBlur > 0) {
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
      ctx.shadowBlur = shadowBlur;
      ctx.shadowOffsetY = shadowBlur * 0.25;
      ctx.drawImage(macbookImageCache, ix, iy, iw, ih);
      ctx.restore();
    } else {
      ctx.drawImage(macbookImageCache, ix, iy, iw, ih);
    }
  }

  const contentWidth = (screenRect.width / 100) * iw;
  const contentHeight = (screenRect.height / 100) * ih;
  const contentRadius = ((screenRect.cornerRadiusPct ?? 0) / 100) * contentWidth;

  return {
    contentX: ix + (screenRect.left / 100) * iw,
    contentY: iy + (screenRect.top / 100) * ih,
    contentWidth,
    contentHeight,
    contentRadius,
  };
}