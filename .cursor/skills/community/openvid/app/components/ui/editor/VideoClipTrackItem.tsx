"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import type { VideoTrackClip } from "@/types/video-track.types";
import { Icon } from "@iconify/react";
import type { MotionValue } from "framer-motion";
import { collectSnapPoints, findSnap } from "@/lib/timeline-snapping";

const MIN_CLIP_DURATION = 0.1;

interface VideoClipTrackItemProps {
    clip: VideoTrackClip;
    isSelected: boolean;
    contentWidth: number;
    totalDuration: number;
    otherClips: VideoTrackClip[];
    currentTime?: number;
    onSelect: () => void;
    onUpdate: (updates: Partial<VideoTrackClip>) => void;
    onDelete?: () => void;
    onDragStateChange?: (isDragging: boolean) => void;
    onReorder?: (draggedId: string, targetId: string, placeAfter: boolean) => void;
    zoomLevel: number;
    playheadX: MotionValue<number>;
    speed?: number;
    activeClipLeftX?: MotionValue<number>;
    activeClipRightX?: MotionValue<number>;
    autoScrollDeltaX?: MotionValue<number>;
}

export function VideoClipTrackItem({
    clip,
    isSelected,
    contentWidth,
    totalDuration,
    otherClips,
    currentTime = 0,
    onSelect,
    onUpdate,
    onDelete,
    onDragStateChange,
    onReorder,
    zoomLevel,
    playheadX,
    speed = 1,
    activeClipLeftX,
    activeClipRightX,
    autoScrollDeltaX
}: VideoClipTrackItemProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState<'start' | 'end' | null>(null);
    const [isHovered, setIsHovered] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const clipX = useMotionValue(0);
    const clipWidth = useMotionValue(0);

    const timeToPixels = useCallback((time: number) => {
        if (totalDuration === 0) return 0;
        return (time / totalDuration) * contentWidth;
    }, [totalDuration, contentWidth]);

    const clipDuration = clip.trimEnd - clip.trimStart;

    const pixelsToTime = useCallback((pixels: number) => {
        if (contentWidth === 0) return 0;
        return (pixels / contentWidth) * totalDuration;
    }, [contentWidth, totalDuration]);

    const initialLeft = timeToPixels(clip.startTime);
    const initialWidth = timeToPixels(clipDuration);

    const progressWidth = useTransform(
        playheadX,
        (px) => {
            const clipStartPx = timeToPixels(clip.startTime);
            const clipEndPx = timeToPixels(clip.startTime + clipDuration);
            if (px <= clipStartPx) return 0;
            if (px >= clipEndPx) return timeToPixels(clipDuration);
            return px - clipStartPx;
        }
    );

    useEffect(() => {
        if (!isDragging && !isResizing) {
            clipX.set(initialLeft);
            clipWidth.set(initialWidth);
        }
    }, [initialLeft, initialWidth, isDragging, isResizing, clipX, clipWidth]);

    const boundaries = useMemo(() => {
        const sorted = [...otherClips]
            .filter(c => c.id !== clip.id)
            .sort((a, b) => a.startTime - b.startTime);

        let minStart = 0;
        let maxEnd = Infinity;

        for (const other of sorted) {
            const otherEnd = other.startTime + (other.trimEnd - other.trimStart);
            const clipEnd = clip.startTime + clipDuration;

            if (otherEnd <= clip.startTime) {
                minStart = Math.max(minStart, otherEnd);
            }
            if (other.startTime >= clipEnd) {
                maxEnd = Math.min(maxEnd, other.startTime);
                break;
            }
        }

        return { minStart, maxEnd };
    }, [otherClips, clip.id, clip.startTime, clipDuration]);

    const applyDragDelta = useCallback((deltaX: number) => {
        if (contentWidth === 0 || totalDuration === 0) return;
        let newX = clipX.get() + deltaX;
        const minX = 0;
        const maxX = timeToPixels(totalDuration - clipDuration);
        newX = Math.max(minX, Math.min(maxX, newX));
        clipX.set(newX);
        activeClipLeftX?.set(newX);
        activeClipRightX?.set(newX + clipWidth.get());
    }, [contentWidth, totalDuration, clipX, clipWidth, clipDuration, timeToPixels, activeClipLeftX, activeClipRightX]);

    const handleDrag = useCallback((_e: MouseEvent | TouchEvent | PointerEvent, info: { delta: { x: number } }) => {
        applyDragDelta(info.delta.x);
    }, [applyDragDelta]);

    const applyResizeStartDelta = useCallback((deltaX: number) => {
        if (contentWidth === 0 || totalDuration === 0) return;
        const currentX = clipX.get();
        const currentWidth = clipWidth.get();
        let newX = currentX + deltaX;
        let newWidth = currentWidth - deltaX;
        const minWidth = timeToPixels(MIN_CLIP_DURATION);
        if (newWidth < minWidth) {
            newWidth = minWidth;
            newX = currentX + currentWidth - minWidth;
        }
        const minStartTimeBySource = clip.startTime - clip.trimStart;
        const minXBySource = timeToPixels(Math.max(0, minStartTimeBySource));
        const minX = Math.max(timeToPixels(boundaries.minStart), minXBySource);
        if (newX < minX) {
            newWidth = newWidth - (minX - newX);
            newX = minX;
        }
        clipX.set(newX);
        clipWidth.set(newWidth);
        activeClipLeftX?.set(newX);
        activeClipRightX?.set(newX + newWidth);
    }, [contentWidth, totalDuration, clipX, clipWidth, boundaries, timeToPixels, clip.startTime, clip.trimStart, activeClipLeftX, activeClipRightX]);

    const handleDragStart = useCallback(() => {
        setIsDragging(true);
        onDragStateChange?.(true);
        onSelect();
    }, [onDragStateChange, onSelect]);

    const handleDragEnd = useCallback(() => {
        setIsDragging(false);
        onDragStateChange?.(false);

        // Detect if the clip was dropped onto another clip (>=50% overlap).
        // If so, trigger a reorder instead of a free-drag position update.
        const draggedCenterPx = clipX.get() + clipWidth.get() / 2;
        const target = otherClips.find(other => {
            const otherStartPx = timeToPixels(other.startTime);
            const otherDur = other.trimEnd - other.trimStart;
            const otherEndPx = timeToPixels(other.startTime + otherDur);
            return draggedCenterPx >= otherStartPx && draggedCenterPx <= otherEndPx;
        });

        if (target && onReorder) {
            // Determine whether to place before or after the target based on
            // the dragged clip's center relative to the target's center.
            const targetCenterPx = timeToPixels(target.startTime) + timeToPixels(target.trimEnd - target.trimStart) / 2;
            const placeAfter = draggedCenterPx > targetCenterPx;
            onReorder(clip.id, target.id, placeAfter);
        } else {
            // Apply magnetic snapping on drop (not during drag) for smooth control.
            let finalX = clipX.get();
            const snapThresholdPx = 8;
            const finalStartTime = pixelsToTime(finalX);
            const finalEndTime = finalStartTime + clipDuration;
            const clipEdges = otherClips.map(c => ({
                start: c.startTime,
                end: c.startTime + (c.trimEnd - c.trimStart),
            }));
            const snapPoints = collectSnapPoints({
                clipEdges,
                playhead: currentTime,
            });
            const snapStart = findSnap(finalStartTime, snapPoints, timeToPixels, snapThresholdPx);
            if (snapStart.offsetPx !== 0) {
                finalX = timeToPixels(snapStart.time);
            } else {
                const snapEnd = findSnap(finalEndTime, snapPoints, timeToPixels, snapThresholdPx);
                if (snapEnd.offsetPx !== 0) {
                    finalX = timeToPixels(snapEnd.time - clipDuration);
                }
            }
            const newStartTime = pixelsToTime(finalX);
            onUpdate({
                startTime: Math.max(0, newStartTime),
            });
        }
    }, [clipX, clipWidth, pixelsToTime, onUpdate, onDragStateChange, otherClips, timeToPixels, onReorder, clip.id, clipDuration, currentTime]);

    const handleResizeStartDrag = useCallback((_e: MouseEvent | TouchEvent | PointerEvent, info: { delta: { x: number } }) => {
        applyResizeStartDelta(info.delta.x);
    }, [applyResizeStartDelta]);

    const applyResizeEndDelta = useCallback((deltaX: number) => {
        if (contentWidth === 0 || totalDuration === 0) return;
        const currentX = clipX.get();
        const currentWidth = clipWidth.get();
        let newWidth = currentWidth + deltaX;
        const minWidth = timeToPixels(MIN_CLIP_DURATION);
        newWidth = Math.max(minWidth, newWidth);
        if (Number.isFinite(boundaries.maxEnd)) {
            const maxWidthByBoundary = timeToPixels(boundaries.maxEnd) - currentX;
            newWidth = Math.min(newWidth, maxWidthByBoundary);
        }
        const maxAvailableDuration = clip.duration - clip.trimStart;
        const maxWidthBySource = timeToPixels(maxAvailableDuration);
        newWidth = Math.min(newWidth, maxWidthBySource);
        clipWidth.set(newWidth);
        activeClipLeftX?.set(currentX);
        activeClipRightX?.set(currentX + newWidth);
    }, [contentWidth, totalDuration, clipWidth, clipX, boundaries, timeToPixels, clip.duration, clip.trimStart, activeClipLeftX, activeClipRightX]);

    const handleResizeEndDrag = useCallback((_e: MouseEvent | TouchEvent | PointerEvent, info: { delta: { x: number } }) => {
        applyResizeEndDelta(info.delta.x);
    }, [applyResizeEndDelta]);

    const handleResizeStart = useCallback((handle: 'start' | 'end') => {
        setIsResizing(handle);
        onDragStateChange?.(true);
        onSelect();
    }, [onDragStateChange, onSelect]);

    const lastAutoScrollRef = useRef(0);
    useEffect(() => {
        if (!autoScrollDeltaX) return;
        lastAutoScrollRef.current = autoScrollDeltaX.get();
        return autoScrollDeltaX.on('change', (latest) => {
            const delta = latest - lastAutoScrollRef.current;
            lastAutoScrollRef.current = latest;
            if (delta === 0) return;
            if (isDragging) applyDragDelta(delta);
            else if (isResizing === 'start') applyResizeStartDelta(delta);
            else if (isResizing === 'end') applyResizeEndDelta(delta);
        });
    }, [autoScrollDeltaX, isDragging, isResizing, applyDragDelta, applyResizeStartDelta, applyResizeEndDelta]);

    const handleResizeEnd = useCallback(() => {
        const handle = isResizing;
        setIsResizing(null);
        onDragStateChange?.(false);

        let finalX = clipX.get();
        let finalWidth = clipWidth.get();
        const otherEdges = otherClips.map(c => ({ start: c.startTime, end: c.startTime + (c.trimEnd - c.trimStart) }));
        const snapPoints = collectSnapPoints({ clipEdges: otherEdges, playhead: currentTime });

        if (handle === 'end') {
            const snap = findSnap(pixelsToTime(finalX + finalWidth), snapPoints, timeToPixels, 8);
            if (snap.offsetPx !== 0) finalWidth = timeToPixels(snap.time) - finalX;
        } else if (handle === 'start') {
            const snap = findSnap(pixelsToTime(finalX), snapPoints, timeToPixels, 8);
            if (snap.offsetPx !== 0) {
                const delta = timeToPixels(snap.time) - finalX;
                finalX += delta;
                finalWidth -= delta;
            }
        }

        const newStartTime = Math.max(0, pixelsToTime(finalX));
        const newDuration = pixelsToTime(finalWidth);
        const trimDelta = newStartTime - clip.startTime;
        const newTrimStart = Math.max(0, clip.trimStart + trimDelta);
        const newTrimEnd = Math.min(clip.duration, newTrimStart + newDuration);
        const correctedStartTime = clip.startTime + (newTrimStart - clip.trimStart);

        onUpdate({ startTime: correctedStartTime, trimStart: newTrimStart, trimEnd: newTrimEnd });
    }, [isResizing, clipX, clipWidth, pixelsToTime, timeToPixels, otherClips, currentTime, clip, onUpdate, onDragStateChange]);

    const isInteracting = isDragging || isResizing !== null;

    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
    };

    return (
        <motion.div
            ref={containerRef}
            className={`absolute top-0 bottom-0 rounded-md cursor-grab active:cursor-grabbing overflow-hidden group transition-colors duration-200 ${isInteracting ? 'z-50' : isSelected ? 'z-10' : 'z-0'
                } ${isSelected ? 'ring-[1px] ring-[#4ade80] shadow-[0_0_12px_rgba(74,222,128,0.3)]' : ''
                } ${isHovered ? 'bg-emerald-200 dark:bg-[#1c3525]' : 'bg-emerald-100 dark:bg-[#182e20]'}`}
            style={{
                x: clipX,
                width: clipWidth,
                border: isSelected
                    ? '1px solid rgba(74, 222, 128, 0.8)'
                    : isHovered
                        ? '1px solid rgba(52, 168, 83, 0.65)'
                        : '1px solid rgba(52, 168, 83, 0.4)',
            }}
            drag="x"
            dragConstraints={false}
            dragElastic={0}
            dragMomentum={false}
            onDrag={handleDrag}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={(e) => {
                e.stopPropagation();
                onSelect();
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="absolute inset-0 flex items-center overflow-hidden">
                <div className="flex h-full w-full">
                    {Array.from({ length: Math.max(1, Math.ceil(zoomLevel * 3)) }).map((_, i) => (
                        <div
                            key={i}
                            className="h-full flex-1 border-r border-[#34A853]/10 last:border-r-0"
                            style={{
                                background: 'linear-gradient(to top, rgba(0, 0, 0, 0) 0%, rgba(20, 80, 40, 0.1) 50%, rgba(52, 168, 83, 0.1) 100%)',
                                boxShadow: 'inset 0px 1px 0px rgba(255, 255, 255, 0.05)'
                            }}
                        />
                    ))}
                </div>
            </div>

            <motion.div
                className="absolute top-0 bottom-0 left-0 border-r-2 border-[#4ade80] pointer-events-none z-5"
                style={{
                    width: progressWidth,
                    background: `linear-gradient(to bottom, rgba(52, 168, 83, 0.9) 0%, rgba(34, 139, 34, 1) 50%, rgba(20, 80, 40, 1) 100%)`,
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)'
                }}
            />

            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <span className={`flex items-center gap-2 text-[11px] font-medium drop-shadow-sm transition-colors duration-200 ${isHovered ? 'text-emerald-700 dark:text-emerald-300' : 'text-emerald-700 dark:text-emerald-400'
                    }`}>
                    <Icon icon="solar:videocamera-record-bold" width="12" className="opacity-70" />
                    <span className="truncate max-w-30">{clip.name}</span>
                    <span className={`font-mono text-[11px] transition-colors duration-200 ${isHovered ? 'text-emerald-700/80 dark:text-emerald-300/80' : 'text-emerald-700/60 dark:text-emerald-400/60'
                        }`}>
                        {formatDuration(clipDuration / speed)}
                    </span>
                </span>
            </div>

            <motion.div
                className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize z-20 group/trim flex items-center justify-center"
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0}
                dragMomentum={false}
                onDrag={handleResizeStartDrag}
                onDragStart={() => handleResizeStart('start')}
                onDragEnd={handleResizeEnd}
            >
                <div className={`w-1.5 h-8 rounded-full transition-all ${isResizing === 'start' ? 'bg-[#4ade80] scale-110' : 'bg-[#34A853] group-hover/trim:bg-[#4ade80]'
                    }`} />
            </motion.div>

            <motion.div
                className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize z-20 group/trim flex items-center justify-end"
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0}
                dragMomentum={false}
                onDrag={handleResizeEndDrag}
                onDragStart={() => handleResizeStart('end')}
                onDragEnd={handleResizeEnd}
            >
                <div className={`w-1.5 h-8 rounded-full transition-all ${isResizing === 'end' ? 'bg-[#4ade80] scale-110' : 'bg-[#34A853] group-hover/trim:bg-[#4ade80]'
                    }`} />
            </motion.div>
        </motion.div>
    );
}