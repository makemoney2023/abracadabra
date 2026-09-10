"use client";
import type { MockupRenderProps } from "@/types/mockup.types";

interface GlassUIContainerProps extends MockupRenderProps {
  shadows?: number;
  roundedCorners?: number;
}

export function GlassUIContainerMockup({
  children,
  config,
  className = "",
  shadows = 20,
  roundedCorners,
  maskStyles, 
}: GlassUIContainerProps) {
  const cornerRadius = roundedCorners ?? config.cornerRadius ?? 12;

  return (
    <div className={`relative w-full h-full ${className}`}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          borderRadius: `${cornerRadius}px`,
          boxShadow: shadows > 0 ? `0 ${shadows * 0.3}px ${shadows}px rgba(0,0,0,1)` : "none",
        }}
      />

      <div
        className="relative w-full h-full overflow-hidden"
        style={{
          ...maskStyles,
          borderRadius: `${cornerRadius}px`,
        }}
      >
        <div
          className="glass-border w-full h-full flex flex-col overflow-hidden"
          style={{
            borderRadius: `${cornerRadius}px`,
            borderTop: "1px solid rgba(255,255,255,0.6)",
            borderLeft: "1px solid rgba(255,255,255,0.6)",
          }}
        >
          <div
            className="flex-1 relative overflow-hidden"
            style={{
              borderRadius: `${Math.max(0, cornerRadius - 3)}px`,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}