"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { getCameraLayout, type CameraConfig } from "@/types/camera.types";
import { useTranslations } from "next-intl";

interface Props {
    stream: MediaStream;
    config: CameraConfig;
    onConfigChange: (partial: Partial<CameraConfig>) => void;
}

function shapeRadius(shape: CameraConfig["shape"], size: number): string {
    const sizeMultiplier = 0.5 + (size - 20) / 40;

    if (shape === "circle") return "50%";
    if (shape === "squircle") {
        const baseRadiusPx = 20;
        return `${Math.round(baseRadiusPx * sizeMultiplier)}px`;
    }
    const baseRadiusPx = 6;
    return `${Math.round(baseRadiusPx * sizeMultiplier)}px`;
}

export default function FloatingCameraPreview({ stream, config, onConfigChange }: Props) {
    const t = useTranslations("recordingSetup");

    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const dragStateRef = useRef<{
        pointerId: number;
        startX: number;
        startY: number;
        startPosX: number;
        startPosY: number;
    } | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        el.srcObject = stream;
        el.play().catch(() => undefined);
    }, [stream]);

    const onPointerDown = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (e.button !== 0) return;
            const target = e.currentTarget;
            target.setPointerCapture(e.pointerId);
            dragStateRef.current = {
                pointerId: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                startPosX: config.position.x,
                startPosY: config.position.y,
            };
            setIsDragging(true);
        },
        [config.position.x, config.position.y]
    );

    const onPointerMove = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            const state = dragStateRef.current;
            if (!state || state.pointerId !== e.pointerId) return;
            const dx = (e.clientX - state.startX) / window.innerWidth;
            const dy = (e.clientY - state.startY) / window.innerHeight;
            const nextX = Math.min(1, Math.max(0, state.startPosX + dx));
            const nextY = Math.min(1, Math.max(0, state.startPosY + dy));
            onConfigChange({
                position: { x: nextX, y: nextY },
                corner: "custom",
            });
        },
        [onConfigChange]
    );

    const onPointerUp = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            const state = dragStateRef.current;
            if (!state || state.pointerId !== e.pointerId) return;
            e.currentTarget.releasePointerCapture(e.pointerId);
            dragStateRef.current = null;
            setIsDragging(false);
        },
        []
    );

    const { size, left, top } = getCameraLayout(
        config,
        typeof window !== "undefined" ? window.innerWidth : 1920,
        typeof window !== "undefined" ? window.innerHeight : 1080
    );
    const isSquircle = config.shape === "squircle";
    const radius = shapeRadius(config.shape, config.size * 100);

    return (
        <div
            ref={containerRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className={`fixed pointer-events-auto select-none z-60 group ${isDragging ? "cursor-grabbing" : "cursor-grab"
                }`}
            style={{
                left: `${left}px`,
                top: `${top}px`,
                width: size,
                height: size,
                transition: isDragging ? "none" : "left 120ms ease, top 120ms ease",
                touchAction: "none",
            }}
            aria-label="Vista previa de cámara (arrastra para mover)"
        >
            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={`size-full object-cover shadow-[0_10px_40px_rgba(0,0,0,0.55)] ring-1 ring-foreground/20 ${isSquircle ? "squircle-element-camera" : ""
                    }`}
                style={{
                    borderRadius: radius,
                    transform: config.mirror ? "scaleX(-1)" : undefined,
                }}
            />

            <div
                className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center bg-black/30"
                style={{
                    borderRadius: radius,
                }}
            >
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/60 text-white text-[11px] font-medium">
                    <Icon icon="solar:hand-move-bold" className="size-3.5" />
                    {t("drag")}
                </div>
            </div>
        </div>
    );
}
