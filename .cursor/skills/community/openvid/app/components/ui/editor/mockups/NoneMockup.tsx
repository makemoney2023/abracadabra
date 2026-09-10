"use client";

import type { MockupRenderProps } from "@/types/mockup.types";

interface NoneMockupProps extends MockupRenderProps {
    roundedCorners?: number;
    shadows?: number;
}
export function NoneMockup({ children, config, className = "", roundedCorners = 12, shadows = 20 }: NoneMockupProps) {
    return (
        <div
            className={`relative w-full h-full overflow-hidden ${className}`}
            style={{
                borderRadius: `${roundedCorners}px`,
                boxShadow: shadows > 0 ? `0 ${shadows * 0.3}px ${shadows}px rgba(0,0,0,1)` : 'none',
            }}
        >
            {children}
        </div>
    );
}