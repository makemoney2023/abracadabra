"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { MockupRenderProps } from "@/types/mockup.types";
import { MACBOOK_PHOTO_MOCKUP } from "@/lib/photo-mockups.config";
import { usePhotoMockupHitTest, type Rect } from "@/lib/photo-mockup-hit-test.utils";

interface MacBookMockupProps extends MockupRenderProps {
  shadows?: number;
  isSelected?: boolean;
  onDeviceHoverChange?: (hovered: boolean) => void;
  onDeviceRectChange?: (rect: Rect | null) => void;
  onDeviceClickOutside?: () => void;
}

export function MacBookMockup({
  children,
  className = "",
  shadows = 20,
  maskStyles,
  isSelected = false,
  onDeviceHoverChange,
  onDeviceRectChange,
  onDeviceClickOutside,
}: MacBookMockupProps) {
  const { imageSrc, screenRect } = MACBOOK_PHOTO_MOCKUP;
  const containerRef = useRef<HTMLDivElement>(null);
  const { imageRect, screenBoxPx, measured, isOnDevice } = usePhotoMockupHitTest(containerRef, MACBOOK_PHOTO_MOCKUP);
  const [deviceHovered, setDeviceHovered] = useState(false);

  const filterIdBase = useId().replace(/[:]/g, "");
  const outlineWhiteId = `macbook-outline-white-${filterIdBase}`;
  const outlineBlueId = `macbook-outline-blue-${filterIdBase}`;

  useEffect(() => {
    onDeviceRectChange?.(measured ? imageRect : null);
  }, [measured, imageRect, onDeviceRectChange]);

  useEffect(() => () => onDeviceRectChange?.(null), [onDeviceRectChange]);

  const reportHover = useCallback((hovered: boolean) => {
    setDeviceHovered(hovered);
    onDeviceHoverChange?.(hovered);
  }, [onDeviceHoverChange]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    reportHover(isOnDevice(e.clientX, e.clientY));
  }, [isOnDevice, reportHover]);

  const handleMouseLeave = useCallback(() => reportHover(false), [reportHover]);

  const handleMouseDownCapture = useCallback((e: React.MouseEvent) => {
    if (!isOnDevice(e.clientX, e.clientY)) e.stopPropagation();
  }, [isOnDevice]);

  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (!isOnDevice(e.clientX, e.clientY)) {
      e.stopPropagation();
      onDeviceClickOutside?.();
    }
  }, [isOnDevice, onDeviceClickOutside]);

  const physicalShadow = shadows > 0
    ? `drop-shadow(0 ${shadows * 0.4}px ${shadows * 1.1}px rgba(0,0,0,0.5))`
    : "";

  const showOutline = isSelected || deviceHovered;
  const outlineFilterId = isSelected ? outlineBlueId : outlineWhiteId;
  const outline = showOutline ? `url(#${outlineFilterId})` : "";
  const combinedFilter = [outline, physicalShadow].filter(Boolean).join(" ") || undefined;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full ${className}`}
      onMouseDownCapture={handleMouseDownCapture}
      onClickCapture={handleClickCapture}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          {(["white", "blue"] as const).map((variant) => (
            <filter
              key={variant}
              id={variant === "white" ? outlineWhiteId : outlineBlueId}
              x="-15%" y="-15%" width="130%" height="130%"
            >
              <feMorphology in="SourceAlpha" operator="dilate" radius="1.1" result="dilated" />
              <feFlood floodColor={variant === "white" ? "#ffffff" : "#3b82f6"} result="flood" />
              <feComposite in="flood" in2="dilated" operator="in" result="ring" />
              <feComposite in="ring" in2="SourceAlpha" operator="out" result="ringOnly" />
              <feMerge>
                <feMergeNode in="ringOnly" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
        </defs>
      </svg>
      <img
        src={imageSrc}
        alt=""
        draggable={false}
        className="absolute pointer-events-none select-none transition-[filter] duration-150"
        style={{
          left: imageRect.x,
          top: imageRect.y,
          width: imageRect.width,
          height: imageRect.height,
          visibility: measured ? "visible" : "hidden",
          filter: combinedFilter,
        }}
      />
      <div
        className="absolute overflow-hidden"
        style={{
          left: screenBoxPx.x,
          top: screenBoxPx.y,
          width: screenBoxPx.width,
          height: screenBoxPx.height,
          borderRadius: `${screenRect.cornerRadiusPct ?? 0}%`,
          visibility: measured ? "visible" : "hidden",
          ...maskStyles,
        }}
      >
        {children}
      </div>
    </div>
  );
}