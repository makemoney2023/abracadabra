"use client";

import { useRef } from "react";
import { Icon } from "@iconify/react";

interface DirectionPadProps {
  angleX: number;
  angleY: number;
  onChange: (angleX: number, angleY: number) => void;
  maxAngle?: number;
  accentRgb?: string;
  labelIcon?: string;
  label?: string;
  hint?: string;
  className?: string;
}

export function DirectionPad({
  angleX,
  angleY,
  onChange,
  maxAngle = 45,
  accentRgb = "156,163,175",
  labelIcon,
  label,
  hint,
  className,
}: DirectionPadProps) {
  const padRef = useRef<HTMLDivElement>(null);

  const setFromClient = (clientX: number, clientY: number) => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width) * 2 - 1));
    const y = Math.max(-1, Math.min(1, ((clientY - rect.top) / rect.height) * 2 - 1));
    onChange(Math.round(y * maxAngle), Math.round(-x * maxAngle));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
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
        onPointerDown={handlePointerDown}
        className={`relative w-full mx-auto bg-card squircle-element border border-border hover:border-foreground/30 transition-colors cursor-crosshair overflow-hidden touch-none group ${className ?? "aspect-square max-w-[220px]"}`}
      >
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-full h-px bg-muted-foreground/20" />
          <div className="h-full w-px bg-muted-foreground/20 absolute" />
        </div>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="w-3/5 aspect-[10/7] rounded-md transition-transform duration-300 ease-out shadow-[0_4px_20px_rgba(0,0,0,0.4)]"
            style={{
              border: `1px solid rgba(${accentRgb}, 0.4)`,
              background: `rgba(${accentRgb}, 0.1)`,
              transform: `perspective(120px) rotateX(${angleX}deg) rotateY(${angleY}deg)`,
            }}
          />
        </div>

        <div
          className="absolute w-2.5 h-2.5 rounded-full transition-all duration-300 ease-out z-10 pointer-events-none"
          style={{
            background: `rgb(${accentRgb})`,
            boxShadow: `0 0 8px rgba(${accentRgb}, 0.5)`,
            left: `${50 + (-angleY / maxAngle) * 50}%`,
            top: `${50 + (angleX / maxAngle) * 50}%`,
            transform: "translate(-50%, -50%)",
          }}
        />
      </div>
      {hint && <p className="text-[11px] text-muted-foreground/60 text-center">{hint}</p>}
    </div>
  );
}