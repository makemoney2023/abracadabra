"use client";

import { useRef } from "react";
import { Icon } from "@iconify/react";

interface PositionPadProps {
  x: number;
  y: number;
  onChange: (x: number, y: number) => void;
  range?: number;
  scale?: number;
  rotateZ?: number;
  blur?: number;
  accentRgb?: string;
  icon?: string;
  labelIcon?: string;
  label?: string;
  hint?: string;
  className?: string;
}

export function PositionPad({
  x,
  y,
  onChange,
  range = 50,
  scale = 1,
  rotateZ = 0,
  blur = 0,
  accentRgb = "249,115,22",
  icon = "ph:device-mobile-bold",
  labelIcon,
  label,
  hint,
  className,
}: PositionPadProps) {
  const padRef = useRef<HTMLDivElement>(null);

  const setFromClient = (clientX: number, clientY: number) => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nx = Math.max(-range, Math.min(range, ((clientX - rect.left) / rect.width) * range * 2 - range));
    const ny = Math.max(-range, Math.min(range, ((clientY - rect.top) / rect.height) * range * 2 - range));
    onChange(Math.round(nx), Math.round(ny));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setFromClient(e.clientX, e.clientY);
    const move = (ev: PointerEvent) => setFromClient(ev.clientX, ev.clientY);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const handlePadClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-drag-handle]")) return;
    setFromClient(e.clientX, e.clientY);
  };

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {labelIcon && <Icon icon={labelIcon} width="14" aria-hidden="true" />}
          <span>{label}</span>
        </div>
      )}
      <div
        ref={padRef}
        onClick={handlePadClick}
        className={`relative w-full mx-auto bg-card squircle-element border border-border hover:border-foreground/30 transition-colors cursor-crosshair overflow-hidden ${className ?? "aspect-video"}`}
      >
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-full h-px bg-muted-foreground/20" />
          <div className="h-full w-px bg-muted-foreground/20 absolute" />
        </div>
        <div
          data-drag-handle
          onPointerDown={handlePointerDown}
          className="absolute size-12 rounded-lg cursor-grab active:cursor-grabbing touch-none flex items-center justify-center"
          style={{
            left: `${50 + (x / range) * 50}%`,
            top: `${50 + (y / range) * 50}%`,
            background: `rgba(${accentRgb}, 0.18)`,
            border: `2px solid rgb(${accentRgb})`,
            transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotateZ}deg)`,
            filter: blur > 0 ? `blur(${blur * 0.4}px)` : undefined,
          }}
        >
          <Icon icon={icon} width="16" style={{ color: `rgb(${accentRgb})` }} aria-hidden="true" />
        </div>
      </div>
      {hint && <p className="text-[11px] text-muted-foreground/60 text-center">{hint}</p>}
    </div>
  );
}