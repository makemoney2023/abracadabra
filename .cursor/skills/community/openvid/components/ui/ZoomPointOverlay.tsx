"use client";

import React from "react";
import { zoomLevelToFactor } from "@/types/zoom.types";

export interface ZoomPoint {
    id: string;
    x: number;
    y: number;
    label: string;
}

interface ZoomPointOverlayProps {
    points: ZoomPoint[];
    zoomLevel: number;
    activePointId: string | null;
    onPointPointerDown: (e: React.PointerEvent<HTMLDivElement>, id: string) => void;
    markerId?: string;
}

export const ZOOM_POINT_VISUAL_SCALE = 0.7;

export function ZoomPointOverlay({
    points,
    zoomLevel,
    activePointId,
    onPointPointerDown,
    markerId = "default-chain-arrowhead"
}: ZoomPointOverlayProps) {
    if (points.length === 0) return null;

    const rawBoxSize = 100 / zoomLevelToFactor(zoomLevel);
    const boxSize = `${rawBoxSize * ZOOM_POINT_VISUAL_SCALE}%`;

    return (
        <>
            {points.length > 1 && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
                    <defs>
                        <marker id={markerId} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="rgba(16, 185, 129, 0.7)" />
                        </marker>
                    </defs>
                    {points.slice(1).map((point, i) => {
                        const from = points[i];
                        const dx = point.x - from.x;
                        const dy = point.y - from.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        const radius = dist > 0 ? 5.5 : 0;
                        const ratio = dist > 0 ? (dist - radius) / dist : 0;
                        const x2 = from.x + dx * ratio;
                        const y2 = from.y + dy * ratio;

                        return (
                            <line
                                key={point.id}
                                x1={`${from.x}%`} y1={`${from.y}%`}
                                x2={`${x2}%`} y2={`${y2}%`}
                                stroke="#10b981"
                                strokeWidth="2.5"
                                strokeDasharray="6 4"
                                markerEnd={`url(#${markerId})`}
                            />
                        );
                    })}
                </svg>
            )}

            {points.map((point) => (
                <div key={point.id}>
                    <div
                        className="absolute border border-dashed squircle-element pointer-events-none transition-opacity duration-200"
                        style={{
                            width: boxSize,
                            height: boxSize,
                            left: `${point.x}%`,
                            top: `${point.y}%`,
                            transform: "translate(-50%, -50%)",
                            opacity: point.id === activePointId ? 1 : 0.4,
                            borderColor: point.id === "origin" ? "rgba(59,130,246,0.5)" : "rgba(16,185,129,0.5)",
                            background: point.id === "origin"
                                ? "linear-gradient(to bottom, rgba(59,130,246,0.5), transparent)"
                                : "linear-gradient(to bottom, rgba(16,185,129,0.5), transparent)",
                        }}
                    />

                    <div
                        data-zoom-drag-handle
                        className={`absolute z-10 cursor-grab active:cursor-grabbing touch-none transition-[opacity,transform] duration-150 ${point.id === activePointId ? "" : "scale-90"
                            }`}
                        style={{ left: `${point.x}%`, top: `${point.y}%`, transform: "translate(-50%, -50%)" }}
                        onPointerDown={(e) => onPointPointerDown(e, point.id)}
                    >
                        <div className={`size-8 rounded-full shadow-lg border-2 border-white/90 hover:scale-110 transition-transform flex items-center justify-center ${point.id === "origin" ? "bg-blue-500" : "bg-emerald-500"
                            }`}>
                            <span className="text-[10px] font-bold text-white">{point.label}</span>
                        </div>
                    </div>
                </div>
            ))}
        </>
    );
}