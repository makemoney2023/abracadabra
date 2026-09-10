"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CROP_ASPECT_RATIOS, VideoCropperModalProps, type CropArea } from "@/types";

export function VideoCropperModal({
    isOpen,
    onClose,
    videoUrl,
    onCropApply,
    initialCrop,
}: VideoCropperModalProps) {
    const t = useTranslations("videoCropper");
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [cropArea, setCropArea] = useState<CropArea>(initialCrop ?? { x: 0, y: 0, width: 100, height: 100 });
    const [selectedAspectRatio, setSelectedAspectRatio] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragType, setDragType] = useState<"move" | "resize" | null>(null);
    const [dragHandle, setDragHandle] = useState<string | null>(null);
    const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
    const [wasOpen, setWasOpen] = useState(false);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const initialCropRef = useRef<CropArea>({ x: 0, y: 0, width: 100, height: 100 });
    const videoBoxRef = useRef<HTMLDivElement>(null);
    const [boxSize, setBoxSize] = useState({ width: 0, height: 0 });

    if (isOpen && !wasOpen) {
        setCropArea(initialCrop ?? { x: 0, y: 0, width: 100, height: 100 });
        setSelectedAspectRatio(null);
        setWasOpen(true);
    } else if (!isOpen && wasOpen) {
        setWasOpen(false);
    }

    const handleVideoLoad = useCallback(() => {
        if (videoRef.current) {
            setVideoDimensions({
                width: videoRef.current.videoWidth,
                height: videoRef.current.videoHeight,
            });
        }
    }, []);

    const handleAspectRatioSelect = useCallback((ratio: number | null) => {
        setSelectedAspectRatio(ratio);
        if (ratio === null || videoDimensions.width === 0) return;

        const videoAspect = videoDimensions.width / videoDimensions.height;
        const targetAspect = ratio;

        let newWidth: number;
        let newHeight: number;

        if (targetAspect > videoAspect) {
            newWidth = 100;
            newHeight = (100 * videoAspect) / targetAspect;
        } else {
            newHeight = 100;
            newWidth = (100 * targetAspect) / videoAspect;
        }

        const newX = (100 - newWidth) / 2;
        const newY = (100 - newHeight) / 2;

        setCropArea({
            x: Math.max(0, newX),
            y: Math.max(0, newY),
            width: Math.min(100, newWidth),
            height: Math.min(100, newHeight),
        });
    }, [videoDimensions]);

    useEffect(() => {
        function updateBoxSize() {
            if (!containerRef.current || !videoDimensions.width || !videoDimensions.height) return;

            const rect = containerRef.current.getBoundingClientRect();
            const containerW = rect.width;
            const containerH = rect.height;
            if (containerW === 0 || containerH === 0) return;

            const videoAspect = videoDimensions.width / videoDimensions.height;
            const containerAspect = containerW / containerH;

            let w: number, h: number;
            if (videoAspect > containerAspect) {
                w = containerW;
                h = containerW / videoAspect;
            } else {
                h = containerH;
                w = containerH * videoAspect;
            }

            setBoxSize({ width: w, height: h });
        }

        updateBoxSize();

        const ro = new ResizeObserver(updateBoxSize);
        if (containerRef.current) ro.observe(containerRef.current);
        window.addEventListener("resize", updateBoxSize);

        return () => {
            ro.disconnect();
            window.removeEventListener("resize", updateBoxSize);
        };
    }, [videoDimensions, isOpen]);

    const handleMouseDown = (e: React.MouseEvent, type: "move" | "resize", handle?: string) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        setDragType(type);
        setDragHandle(handle ?? null);
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        initialCropRef.current = { ...cropArea };
    };

    useEffect(() => {
        if (!isDragging || !videoBoxRef.current) return;

        const handleMouseMove = (e: MouseEvent) => {
            const container = videoBoxRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const deltaX = ((e.clientX - dragStartPos.current.x) / rect.width) * 100;
            const deltaY = ((e.clientY - dragStartPos.current.y) / rect.height) * 100;

            if (dragType === "move") {
                const newX = Math.max(0, Math.min(100 - cropArea.width, initialCropRef.current.x + deltaX));
                const newY = Math.max(0, Math.min(100 - cropArea.height, initialCropRef.current.y + deltaY));
                setCropArea(prev => ({ ...prev, x: newX, y: newY }));
            } else if (dragType === "resize" && dragHandle) {
                const newCrop = { ...initialCropRef.current };
                const minSize = 10;

                switch (dragHandle) {
                    case "nw": {
                        const maxDx = initialCropRef.current.width - minSize;
                        const maxDy = initialCropRef.current.height - minSize;
                        const clampedDx = Math.max(-initialCropRef.current.x, Math.min(maxDx, deltaX));
                        const clampedDy = Math.max(-initialCropRef.current.y, Math.min(maxDy, deltaY));
                        newCrop.x = initialCropRef.current.x + clampedDx;
                        newCrop.y = initialCropRef.current.y + clampedDy;
                        newCrop.width = initialCropRef.current.width - clampedDx;
                        newCrop.height = initialCropRef.current.height - clampedDy;
                        break;
                    }
                    case "ne": {
                        const maxDx = 100 - initialCropRef.current.x - initialCropRef.current.width;
                        const maxDy = initialCropRef.current.height - minSize;
                        const clampedDx = Math.max(-(initialCropRef.current.width - minSize), Math.min(maxDx, deltaX));
                        const clampedDy = Math.max(-initialCropRef.current.y, Math.min(maxDy, deltaY));
                        newCrop.y = initialCropRef.current.y + clampedDy;
                        newCrop.width = initialCropRef.current.width + clampedDx;
                        newCrop.height = initialCropRef.current.height - clampedDy;
                        break;
                    }
                    case "sw": {
                        const maxDx = initialCropRef.current.width - minSize;
                        const maxDy = 100 - initialCropRef.current.y - initialCropRef.current.height;
                        const clampedDx = Math.max(-initialCropRef.current.x, Math.min(maxDx, deltaX));
                        const clampedDy = Math.max(-(initialCropRef.current.height - minSize), Math.min(maxDy, deltaY));
                        newCrop.x = initialCropRef.current.x + clampedDx;
                        newCrop.width = initialCropRef.current.width - clampedDx;
                        newCrop.height = initialCropRef.current.height + clampedDy;
                        break;
                    }
                    case "se": {
                        const maxDx = 100 - initialCropRef.current.x - initialCropRef.current.width;
                        const maxDy = 100 - initialCropRef.current.y - initialCropRef.current.height;
                        const clampedDx = Math.max(-(initialCropRef.current.width - minSize), Math.min(maxDx, deltaX));
                        const clampedDy = Math.max(-(initialCropRef.current.height - minSize), Math.min(maxDy, deltaY));
                        newCrop.width = initialCropRef.current.width + clampedDx;
                        newCrop.height = initialCropRef.current.height + clampedDy;
                        break;
                    }
                    case "n": {
                        const maxDy = initialCropRef.current.height - minSize;
                        const clampedDy = Math.max(-initialCropRef.current.y, Math.min(maxDy, deltaY));
                        newCrop.y = initialCropRef.current.y + clampedDy;
                        newCrop.height = initialCropRef.current.height - clampedDy;
                        break;
                    }
                    case "s": {
                        const maxDy = 100 - initialCropRef.current.y - initialCropRef.current.height;
                        const clampedDy = Math.max(-(initialCropRef.current.height - minSize), Math.min(maxDy, deltaY));
                        newCrop.height = initialCropRef.current.height + clampedDy;
                        break;
                    }
                    case "w": {
                        const maxDx = initialCropRef.current.width - minSize;
                        const clampedDx = Math.max(-initialCropRef.current.x, Math.min(maxDx, deltaX));
                        newCrop.x = initialCropRef.current.x + clampedDx;
                        newCrop.width = initialCropRef.current.width - clampedDx;
                        break;
                    }
                    case "e": {
                        const maxDx = 100 - initialCropRef.current.x - initialCropRef.current.width;
                        const clampedDx = Math.max(-(initialCropRef.current.width - minSize), Math.min(maxDx, deltaX));
                        newCrop.width = initialCropRef.current.width + clampedDx;
                        break;
                    }
                }

                newCrop.x = Math.max(0, Math.min(100 - minSize, newCrop.x));
                newCrop.y = Math.max(0, Math.min(100 - minSize, newCrop.y));
                newCrop.width = Math.max(minSize, Math.min(100 - newCrop.x, newCrop.width));
                newCrop.height = Math.max(minSize, Math.min(100 - newCrop.y, newCrop.height));
                setCropArea(newCrop);
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            setDragType(null);
            setDragHandle(null);
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isDragging, dragType, dragHandle, cropArea.width, cropArea.height]);

    const handleReset = () => {
        setCropArea({ x: 0, y: 0, width: 100, height: 100 });
        setSelectedAspectRatio(null);
    };

    const handleApply = () => {
        onCropApply(cropArea);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"
            >
                <motion.div
                    initial={{ scale: 0.96, opacity: 0, y: 8 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.96, opacity: 0, y: 8 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="bg-popover dark:bg-black rounded-2xl border border-border w-[94vw] max-w-6xl h-[88vh] flex flex-col overflow-hidden shadow-2xl"
                >
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                        <div className="flex items-center gap-2.5">
                            <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center">
                                <Icon icon="mdi:crop" className="text-sm text-muted-foreground" aria-hidden="true" />
                            </div>
                            <span className="text-sm font-medium text-foreground">{t("title")}</span>
                            {videoDimensions.width > 0 && (
                                <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-md border border-border">
                                    {videoDimensions.width} × {videoDimensions.height}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                            aria-label={t("close")}
                        >
                            <Icon icon="mdi:close" className="text-base" aria-hidden="true" />
                        </button>
                    </div>

                    <div className="flex-1 flex overflow-hidden min-h-0">
                        <div className="flex-1 p-6 flex items-center justify-center bg-black/50 overflow-hidden">
                            <div
                                ref={containerRef}
                                className="relative w-full h-full max-w-full max-h-full flex items-center justify-center"
                            >
                                <div
                                    ref={videoBoxRef}
                                    className="relative"
                                    style={{
                                        width: boxSize.width || "100%",
                                        height: boxSize.height || "100%",
                                    }}
                                >
                                    {videoUrl ? (
                                        <video
                                            ref={videoRef}
                                            src={videoUrl}
                                            className="absolute inset-0 w-full h-full object-contain bg-black"
                                            onLoadedMetadata={handleVideoLoad}
                                            muted
                                            loop
                                            autoPlay
                                        />
                                    ) : (
                                        <div className="absolute inset-0 bg-muted rounded-lg flex items-center justify-center text-muted-foreground/60 text-sm">
                                            {t("noVideo")}
                                        </div>
                                    )}

                                    <div className="absolute inset-0 pointer-events-none">
                                        <div className="absolute bg-black/75 left-0 right-0 top-0" style={{ height: `${cropArea.y}%` }} />
                                        <div className="absolute bg-black/75 left-0 right-0 bottom-0" style={{ height: `${Math.max(0, 100 - cropArea.y - cropArea.height)}%` }} />
                                        <div className="absolute bg-black/75 left-0" style={{ top: `${cropArea.y}%`, width: `${cropArea.x}%`, height: `${cropArea.height}%` }} />
                                        <div className="absolute bg-black/75 right-0" style={{ top: `${cropArea.y}%`, width: `${Math.max(0, 100 - cropArea.x - cropArea.width)}%`, height: `${cropArea.height}%` }} />
                                    </div>

                                    <div
                                        className="absolute border border-white/80 cursor-move"
                                        style={{
                                            left: `${cropArea.x}%`,
                                            top: `${cropArea.y}%`,
                                            width: `${cropArea.width}%`,
                                            height: `${cropArea.height}%`,
                                        }}
                                        onMouseDown={(e) => handleMouseDown(e, "move")}
                                    >
                                        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                                            {[...Array(9)].map((_, i) => (
                                                <div key={i} className="border border-white/15" />
                                            ))}
                                        </div>

                                        {videoDimensions.width > 0 && (
                                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-sm border border-white/12 text-white/70 text-[11px] font-mono px-2 py-0.5 rounded-md whitespace-nowrap pointer-events-none">
                                                {Math.round((videoDimensions.width * cropArea.width) / 100)} ×{" "}
                                                {Math.round((videoDimensions.height * cropArea.height) / 100)}
                                            </div>
                                        )}

                                        {["nw", "ne", "sw", "se"].map((handle) => (
                                            <div
                                                key={handle}
                                                className={`absolute w-3 h-3 bg-white rounded-sm shadow-lg ${handle === "nw" ? "-top-1.5 -left-1.5 cursor-nwse-resize" :
                                                    handle === "ne" ? "-top-1.5 -right-1.5 cursor-nesw-resize" :
                                                        handle === "sw" ? "-bottom-1.5 -left-1.5 cursor-nesw-resize" :
                                                            "-bottom-1.5 -right-1.5 cursor-nwse-resize"
                                                    }`}
                                                onMouseDown={(e) => {
                                                    e.stopPropagation();
                                                    handleMouseDown(e, "resize", handle);
                                                }}
                                            />
                                        ))}

                                        {["n", "s", "w", "e"].map((handle) => {
                                            const isVertical = handle === "n" || handle === "s";
                                            return (
                                                <div
                                                    key={handle}
                                                    className={`absolute bg-white rounded-sm ${handle === "n" ? "left-1/2 -translate-x-1/2 -top-0.75 cursor-ns-resize" :
                                                        handle === "s" ? "left-1/2 -translate-x-1/2 -bottom-0.75 cursor-ns-resize" :
                                                            handle === "w" ? "top-1/2 -translate-y-1/2 -left-0.75 cursor-ew-resize" :
                                                                "top-1/2 -translate-y-1/2 -right-0.75 cursor-ew-resize"
                                                        }`}
                                                    style={{ width: isVertical ? "28px" : "5px", height: isVertical ? "5px" : "28px" }}
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation();
                                                        handleMouseDown(e, "resize", handle);
                                                    }}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="w-56 shrink-0 border-l border-border flex flex-col bg-card">
                            <div className="p-4 border-b border-border">
                                <p className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground mb-3">
                                    {t("sections.ratio")}
                                </p>
                                <div className="grid grid-cols-3 gap-1">
                                    {CROP_ASPECT_RATIOS.map((ratio) => (
                                        <div key={ratio.label} className="relative">
                                            <button
                                                onClick={() => handleAspectRatioSelect(ratio.value)}
                                                className={`w-full py-1.5 text-[11px] font-medium rounded-lg transition-all ${selectedAspectRatio === ratio.value
                                                    ? "text-white border-transparent"
                                                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border"
                                                    }`}
                                                style={
                                                    selectedAspectRatio === ratio.value
                                                        ? {
                                                            background: "radial-gradient(circle at 50% 0%, #555555 0%, #121212 75%)",
                                                            boxShadow: "0 0 0 1px #fff3, 0 4px 4px 0 #0004, 0 0 0 1px #333",
                                                        }
                                                        : {}
                                                }
                                            >
                                                {ratio.label === "Libre" ? t("freeRatio") : ratio.label}
                                            </button>
                                            {selectedAspectRatio === ratio.value && (
                                                <div className="absolute left-1 top-1/5 -translate-y-1/2 size-3 bg-white rounded-full blur-[5px]" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="p-4 border-b border-border">
                                <p className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground mb-3">
                                    {t("sections.area")}
                                </p>
                                <div className="space-y-2">
                                    {[
                                        { label: t("labels.x"), value: cropArea.x },
                                        { label: t("labels.y"), value: cropArea.y },
                                        { label: t("labels.width"), value: cropArea.width },
                                        { label: t("labels.height"), value: cropArea.height },
                                    ].map(({ label, value }) => (
                                        <div key={label} className="flex items-center justify-between">
                                            <span className="text-[11px] text-muted-foreground/60 font-mono w-4">{label}</span>
                                            <div className="flex-1 mx-3 h-px bg-border/60" />
                                            <span className="text-[11px] font-mono text-muted-foreground">{value.toFixed(1)}%</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex-1" />

                            <div className="p-4 flex flex-col gap-2">
                                <Button variant="outline" onClick={handleReset}>
                                    {t("buttons.reset")}
                                </Button>
                                <Button variant="primary" className="text-white" onClick={handleApply}>
                                    {t("buttons.apply")}
                                </Button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}