"use client";

import { useState, useCallback } from "react";
import { toCanvas } from "html-to-image";
import { encodeJpeg, encodePng, encodeWebp, encodeAvif } from "@/lib/image-codecs/exportEncoders";
import { ASPECT_RATIO_DIMENSIONS } from "@/types";
import type { AspectRatio, VideoCanvasHandle, ImageExportFormat } from "@/types";
import type { RefObject } from "react";

interface UseImageExportParams {
  canvasRef: RefObject<VideoCanvasHandle | null>;
  imageUrl: string | null;
  customAspectRatio: { width: number; height: number } | null;
  aspectRatio: AspectRatio;
  selectedWallpaper: number;
  selectedElementId: string | null;
  selectCanvasElement: (id: string | null) => void;
}

export function useImageExport({
  canvasRef, imageUrl, customAspectRatio, aspectRatio,
  selectedWallpaper, selectedElementId, selectCanvasElement,
}: UseImageExportParams) {
  const [imageExportProgress, setImageExportProgress] = useState<{
    status: "idle" | "preparing" | "rendering" | "complete" | "error";
    progress: number;
    message: string;
  }>({ status: "idle", progress: 0, message: "" });

  const handleImageExport = useCallback(async (
    format: ImageExportFormat,
    quality: number,
    scale: number
  ) => {
    if (!canvasRef.current) return;

    try {
      setImageExportProgress({ status: "preparing", progress: 0, message: "Preparing export..." });

      const previewContainer = canvasRef.current.getPreviewContainer();
      if (!previewContainer || !imageUrl) {
        throw new Error("Preview container or image not available");
      }

      const imageElements = previewContainer.querySelectorAll('img');
      const originalSrcs = new Map<HTMLImageElement, string>();
      await Promise.all(Array.from(imageElements).map(async (img) => {
        const src = img.src;
        if (!src.startsWith('blob:') && !src.startsWith('data:')) return;
        try {
          const response = await fetch(src);
          const blob = await response.blob();
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          originalSrcs.set(img, src);
          img.src = base64;
          if (!img.complete) {
            await new Promise<void>((resolve) => { img.onload = () => resolve(); });
          }
        } catch (e) {
          console.warn("Could not convert image src to base64:", src, e);
        }
      }));

      setImageExportProgress({ status: "rendering", progress: 40, message: "Rendering image..." });

      let exportWidth = 1920;
      let exportHeight = 1080;
      if (customAspectRatio) {
        exportWidth = customAspectRatio.width;
        exportHeight = customAspectRatio.height;
      } else {
        const dims = ASPECT_RATIO_DIMENSIONS[aspectRatio];
        if (dims) {
          exportWidth = dims.width;
          exportHeight = dims.height;
        }
      }
      exportWidth = Math.round(exportWidth * scale);
      exportHeight = Math.round(exportHeight * scale);

      const hasTransparentBackground = selectedWallpaper === -1;

      const prevSingleSelection = selectedElementId;
      selectCanvasElement(null);
      const prevSelectionState = canvasRef.current?.clearAllSelection?.();
      await new Promise(resolve => setTimeout(resolve, 80));

      const rasterCanvas = await toCanvas(previewContainer, {
        cacheBust: false,
        ...(hasTransparentBackground ? {} : { backgroundColor: '#09090B' }),
        canvasWidth: exportWidth,
        canvasHeight: exportHeight,
        pixelRatio: 1,
      });

      if (prevSingleSelection) selectCanvasElement(prevSingleSelection);
      if (prevSelectionState) canvasRef.current?.restoreSelectionState?.(prevSelectionState);
      originalSrcs.forEach((originalSrc, img) => { img.src = originalSrc; });

      setImageExportProgress({ status: "rendering", progress: 60, message: "Encoding..." });

      const ctx = rasterCanvas.getContext("2d");
      if (!ctx) throw new Error("No 2D context available");
      const imageData = ctx.getImageData(0, 0, rasterCanvas.width, rasterCanvas.height);

      let blob: Blob;
      switch (format) {
        case "png": blob = await encodePng(imageData); break;
        case "jpeg": blob = await encodeJpeg(imageData, quality); break;
        case "webp": blob = await encodeWebp(imageData, quality); break;
        case "avif": blob = await encodeAvif(imageData, quality); break;
        default: throw new Error(`Unsupported format: ${format}`);
      }

      if (!blob) throw new Error("Failed to generate image blob");

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `openvid-${Date.now()}.${format === "jpeg" ? "jpg" : format}`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);

      setImageExportProgress({ status: "complete", progress: 100, message: "Export complete!" });
      setTimeout(() => setImageExportProgress({ status: "idle", progress: 0, message: "" }), 2000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      setImageExportProgress({ status: "error", progress: 0, message: `Export failed: ${errorMessage}` });
      setTimeout(() => setImageExportProgress({ status: "idle", progress: 0, message: "" }), 4000);
    }
  }, [canvasRef, imageUrl, customAspectRatio, aspectRatio, selectedWallpaper, selectedElementId, selectCanvasElement]);

  return { imageExportProgress, handleImageExport };
}