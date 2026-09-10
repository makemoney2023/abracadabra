"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PhotoMockupConfig } from "./photo-mockups.config";
export interface Rect { x: number; y: number; width: number; height: number }

interface AlphaSampler { data: Uint8ClampedArray; width: number; height: number }

const ALPHA_SAMPLE_WIDTH = 256;
const ALPHA_HIT_THRESHOLD = 10; 
const alphaSamplerCache = new Map<string, Promise<AlphaSampler>>();

function getPhotoAlphaSampler(imageSrc: string, aspect: number): Promise<AlphaSampler> {
  const key = `${imageSrc}|${aspect}`;
  let cached = alphaSamplerCache.get(key);
  if (!cached) {
    cached = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const width = ALPHA_SAMPLE_WIDTH;
        const height = Math.round(ALPHA_SAMPLE_WIDTH / aspect);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) { reject(new Error("2d context unavailable")); return; }
        ctx.drawImage(img, 0, 0, width, height);
        const { data } = ctx.getImageData(0, 0, width, height);
        resolve({ data, width, height });
      };
      img.onerror = reject;
      img.src = imageSrc;
    });
    alphaSamplerCache.set(key, cached);
  }
  return cached;
}

/** Contain-fit rect de una foto de proporción `photoAspect` dentro de una
 *  caja de dimensiones dadas — la misma matemática que `object-fit: contain`. */
export function computeContainRect(containerWidth: number, containerHeight: number, photoAspect: number): Rect | null {
  if (containerWidth <= 0 || containerHeight <= 0) return null;
  const boxAspect = containerWidth / containerHeight;
  let iw: number, ih: number;
  if (photoAspect > boxAspect) {
    iw = containerWidth; ih = containerWidth / photoAspect;
  } else {
    ih = containerHeight; iw = containerHeight * photoAspect;
  }
  return { x: (containerWidth - iw) / 2, y: (containerHeight - ih) / 2, width: iw, height: ih };
}

function isAlphaOpaqueAt(sampler: AlphaSampler | null, localX: number, localY: number, imageRect: Rect): boolean {
  if (!sampler) return true; 
  if (localX < 0 || localY < 0 || localX >= imageRect.width || localY >= imageRect.height) return false;
  const px = Math.min(sampler.width - 1, Math.floor((localX / imageRect.width) * sampler.width));
  const py = Math.min(sampler.height - 1, Math.floor((localY / imageRect.height) * sampler.height));
  const alpha = sampler.data[(py * sampler.width + px) * 4 + 3];
  return alpha > ALPHA_HIT_THRESHOLD;
}

export interface PhotoMockupHitTest {
  imageRect: Rect;
  screenBoxPx: Rect;
  measured: boolean;
  isOnDevice: (clientX: number, clientY: number) => boolean;
}

export function usePhotoMockupHitTest(
  containerRef: React.RefObject<HTMLElement | null>,
  config: PhotoMockupConfig
): PhotoMockupHitTest {
  const aspect = config.naturalWidth / config.naturalHeight;
  const [imageRect, setImageRect] = useState<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const [measured, setMeasured] = useState(false);
  const samplerRef = useRef<AlphaSampler | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const { width: cw, height: ch } = el.getBoundingClientRect();
      const rect = computeContainRect(cw, ch, aspect);
      if (rect) { setImageRect(rect); setMeasured(true); }
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef, aspect]);

  useEffect(() => {
    let cancelled = false;
    getPhotoAlphaSampler(config.imageSrc, aspect).then((sampler) => {
      if (!cancelled) samplerRef.current = sampler;
    });
    return () => { cancelled = true; };
  }, [config.imageSrc, aspect]);

  const screenBoxPx = useMemo<Rect>(() => ({
    x: imageRect.x + (config.screenRect.left / 100) * imageRect.width,
    y: imageRect.y + (config.screenRect.top / 100) * imageRect.height,
    width: (config.screenRect.width / 100) * imageRect.width,
    height: (config.screenRect.height / 100) * imageRect.height,
  }), [imageRect, config.screenRect]);

  const isOnDevice = useCallback((clientX: number, clientY: number): boolean => {
    const el = containerRef.current;
    if (!el) return true;
    const rect = el.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const insideScreen =
      localX >= screenBoxPx.x && localX <= screenBoxPx.x + screenBoxPx.width &&
      localY >= screenBoxPx.y && localY <= screenBoxPx.y + screenBoxPx.height;
    if (insideScreen) return true;
    return isAlphaOpaqueAt(samplerRef.current, localX - imageRect.x, localY - imageRect.y, imageRect);
  }, [containerRef, imageRect, screenBoxPx]);

  return { imageRect, screenBoxPx, measured, isOnDevice };
}