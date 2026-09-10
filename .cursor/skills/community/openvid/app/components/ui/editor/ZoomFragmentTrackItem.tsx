"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { motion, useMotionValue } from "framer-motion";
import type { ZoomFragment } from "@/types/zoom.types";
import { zoomLevelToFactor, speedToTransitionMs } from "@/types/zoom.types";
import { MIN_MOVEMENT_TRACK_DURATION } from "./ZoomMovementTrackItem";
import { collectSnapPoints, findSnap } from "@/lib/timeline-snapping";

const MIN_FRAGMENT_DURATION = 0.5;

interface ZoomFragmentTrackItemProps {
    fragment: ZoomFragment;
    isSelected: boolean;
    contentWidth: number;
    videoDuration: number;
    contentDuration?: number;
    otherFragments: ZoomFragment[];
    onSelect: () => void;
    onUpdate: (updates: Partial<ZoomFragment>) => void;
    onDragStateChange?: (isDragging: boolean) => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    speed?: number;
    currentTime?: number;
    clipEdges?: Array<{ start: number; end: number }>;
}

export function ZoomFragmentTrackItem({
    fragment,
    isSelected,
    contentWidth,
    videoDuration,
    contentDuration,
    otherFragments,
    onSelect,
    onUpdate,
    onDragStateChange,
    onMouseEnter,
    onMouseLeave,
    speed = 1,
    currentTime = 0,
    clipEdges = [],
}: ZoomFragmentTrackItemProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState<'start' | 'end' | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const fragmentX = useMotionValue(0);
    const fragmentWidth = useMotionValue(0);

    const timeToPixels = useCallback((time: number) => {
        return (time / videoDuration) * contentWidth;
    }, [videoDuration, contentWidth]);

    const pixelsToTime = useCallback((pixels: number) => {
        return (pixels / contentWidth) * videoDuration;
    }, [contentWidth, videoDuration]);

    const initialLeft = timeToPixels(fragment.startTime);
    const initialWidth = timeToPixels(fragment.endTime - fragment.startTime);

    useEffect(() => {
        if (!isDragging && !isResizing) {
            fragmentX.set(initialLeft);
            fragmentWidth.set(initialWidth);
        }
    }, [initialLeft, initialWidth, isDragging, isResizing, fragmentX, fragmentWidth]);

    const boundaries = useMemo(() => {
        const sorted = [...otherFragments].sort((a, b) => a.startTime - b.startTime);

        let minStart = 0;
        let maxEnd = contentDuration ?? videoDuration;

        for (const other of sorted) {
            if (other.endTime <= fragment.startTime) {
                minStart = Math.max(minStart, other.endTime);
            }
            if (other.startTime >= fragment.endTime) {
                maxEnd = Math.min(maxEnd, other.startTime);
                break;
            }
        }

        return { minStart, maxEnd };
    }, [otherFragments, fragment.startTime, fragment.endTime, videoDuration, contentDuration]);

    const minDurationSeconds = useMemo(() => {
        const transitionSec = speedToTransitionMs(fragment.speed) / 1000;
        // Entry + exit ramps must both fit within the fragment, so the minimum
        // duration is 2 * transitionSec (or MIN_FRAGMENT_DURATION, whichever
        // is larger). When movement is enabled, add the movement track minimum.
        const baseMin = Math.max(MIN_FRAGMENT_DURATION, transitionSec * 2);
        if (!fragment.movementEnabled) return baseMin;
        return Math.max(baseMin, MIN_MOVEMENT_TRACK_DURATION + transitionSec);
    }, [fragment.movementEnabled, fragment.speed]);


    const handleDrag = useCallback((e: MouseEvent | TouchEvent | PointerEvent, info: { delta: { x: number } }) => {
        if (contentWidth === 0 || videoDuration === 0) return;

        const currentX = fragmentX.get();
        const duration = fragment.endTime - fragment.startTime;

        let newX = currentX + info.delta.x;

        const minX = timeToPixels(boundaries.minStart);
        const maxX = timeToPixels(boundaries.maxEnd - duration);
        newX = Math.max(minX, Math.min(maxX, newX));

        // Magnetic snapping: snap fragment start/end to clip edges, other fragments, playhead, zero.
        const snapThresholdPx = 8;
        const newStartTime = pixelsToTime(newX);
        const newEndTime = newStartTime + duration;
        const fragmentEdges = otherFragments.map(f => ({ start: f.startTime, end: f.endTime }));
        const snapPoints = collectSnapPoints({ clipEdges, fragmentEdges, playhead: currentTime });
        const snapStart = findSnap(newStartTime, snapPoints, timeToPixels, snapThresholdPx);
        if (snapStart.offsetPx !== 0) {
            newX = timeToPixels(snapStart.time);
        } else {
            const snapEnd = findSnap(newEndTime, snapPoints, timeToPixels, snapThresholdPx);
            if (snapEnd.offsetPx !== 0) {
                newX = timeToPixels(snapEnd.time - duration);
            }
        }
        newX = Math.max(minX, Math.min(maxX, newX));

        fragmentX.set(newX);
    }, [contentWidth, videoDuration, fragmentX, fragment, boundaries, timeToPixels, pixelsToTime, otherFragments, clipEdges, currentTime]);

    const handleDragStart = useCallback(() => {
        setIsDragging(true);
        onDragStateChange?.(true);
    }, [onDragStateChange]);

    const handleDragEnd = useCallback(() => {
        setIsDragging(false);
        onDragStateChange?.(false);

        const newStartTime = pixelsToTime(fragmentX.get());
        const duration = fragment.endTime - fragment.startTime;

        onUpdate({
            startTime: Math.max(0, newStartTime),
            endTime: Math.min(contentDuration ?? videoDuration, newStartTime + duration),
        });
    }, [fragmentX, pixelsToTime, fragment, videoDuration, contentDuration, onUpdate, onDragStateChange]);

    const handleResizeStartDrag = useCallback((e: MouseEvent | TouchEvent | PointerEvent, info: { delta: { x: number } }) => {
        if (contentWidth === 0 || videoDuration === 0) return;

        const currentX = fragmentX.get();
        const currentWidth = fragmentWidth.get();

        let newX = currentX + info.delta.x;
        let newWidth = currentWidth - info.delta.x;

        const minWidth = timeToPixels(minDurationSeconds);
        if (newWidth < minWidth) {
            newWidth = minWidth;
            newX = currentX + currentWidth - minWidth;
        }

        const minX = timeToPixels(boundaries.minStart);
        if (newX < minX) {
            const allowedShrink = currentX + currentWidth - minX;
            newX = minX;
            newWidth = Math.max(minWidth, Math.min(newWidth, allowedShrink));
        }

        fragmentX.set(newX);
        fragmentWidth.set(newWidth);
    }, [contentWidth, videoDuration, fragmentX, fragmentWidth, boundaries, minDurationSeconds, timeToPixels]);

    const handleResizeEndDrag = useCallback((e: MouseEvent | TouchEvent | PointerEvent, info: { delta: { x: number } }) => {
        if (contentWidth === 0 || videoDuration === 0) return;

        const currentWidth = fragmentWidth.get();

        let newWidth = currentWidth + info.delta.x;

        const currentX = fragmentX.get();
        const maxWidth = timeToPixels(boundaries.maxEnd) - currentX;
        const minWidth = timeToPixels(minDurationSeconds);
        newWidth = Math.max(minWidth, Math.min(newWidth, Math.max(minWidth, maxWidth)));

        fragmentWidth.set(newWidth);
    }, [contentWidth, videoDuration, fragmentWidth, fragmentX, boundaries, minDurationSeconds, timeToPixels]);

    const handleResizeStart = useCallback((handle: 'start' | 'end') => {
        setIsResizing(handle);
        onDragStateChange?.(true);
    }, [onDragStateChange]);

    const handleResizeEnd = useCallback(() => {
        setIsResizing(null);
        onDragStateChange?.(false);

        const newStartTime = pixelsToTime(fragmentX.get());
        const newEndTime = pixelsToTime(fragmentX.get() + fragmentWidth.get());

        onUpdate({
            startTime: Math.max(0, newStartTime),
            endTime: Math.min(contentDuration ?? videoDuration, newEndTime),
        });
    }, [fragmentX, fragmentWidth, pixelsToTime, videoDuration, contentDuration, onUpdate, onDragStateChange]);

    const duration = fragment.endTime - fragment.startTime;
    const isInteracting = isDragging || isResizing !== null;

    return (
        <motion.div
            ref={containerRef}
            className={`absolute h-[90%] top-[5%] rounded-md flex items-center border transition-shadow select-none focus:outline-none ${isSelected || isInteracting
                ? 'bg-blue-500/30 border-blue-400/70 shadow-[0_0_10px_rgba(59,130,246,0.3)] z-10'
                : 'bg-blue-600/20 border-blue-500/35 hover:border-blue-500/60'
                } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{
                x: fragmentX,
                width: fragmentWidth,
                background: isSelected || isInteracting
                    ? 'linear-gradient(180deg, rgba(59, 130, 246, 0.5) 0%, rgba(29, 78, 216, 0.4) 100%)'
                    : 'linear-gradient(180deg, rgba(37, 99, 235, 0.2) 0%, rgba(30, 58, 138, 0.15) 100%)',
                boxShadow: isSelected || isInteracting
                    ? 'inset 0 1px 0 rgba(255,255,255,0.3), 0 0 10px rgba(59,130,246,0.3)'
                    : 'inset 0 1px 0 rgba(255,255,255,0.1)'
            }}
            drag="x"
            dragConstraints={{ left: 0, right: contentWidth / speed }}
            dragElastic={0}
            dragMomentum={false}
            onDrag={handleDrag}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={(e) => {
                e.stopPropagation();
                onSelect();
            }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            whileTap={{ scale: 0.98 }}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={contentDuration ?? videoDuration}
            aria-valuenow={fragment.startTime}
            aria-label={`Zoom fragment ${zoomLevelToFactor(fragment.zoomLevel).toFixed(1)}x, ${(duration / speed).toFixed(1)}s`}
            tabIndex={0}
        >
            {/* Resize handle - Start */}
            <motion.div
                className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 group/resize flex items-center justify-center"
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0}
                dragMomentum={false}
                onDrag={handleResizeStartDrag}
                onDragStart={() => handleResizeStart('start')}
                onDragEnd={handleResizeEnd}
                onClick={(e) => e.stopPropagation()}
                role="slider"
                aria-label="Resize start"
                aria-valuemin={0}
                aria-valuemax={contentDuration ?? videoDuration}
                aria-valuenow={fragment.startTime}
                tabIndex={0}
            >
                <div className={`w-1 h-6 rounded-full transition-all ${isResizing === 'start'
                    ? 'bg-blue-500 dark:bg-blue-300 scale-110'
                    : 'bg-blue-500/70 group-hover/resize:bg-blue-500 dark:bg-blue-400/60 dark:group-hover/resize:bg-blue-300'
                    }`} />
            </motion.div>

            {/* Content */}
            <div className="flex-1 flex flex-col items-center justify-center pointer-events-none overflow-hidden px-2">
                <span className={`text-[11px] truncate ${isSelected || isInteracting ? 'text-blue-700 dark:text-blue-200' : 'text-blue-700/70 dark:text-blue-300/70'}`}>
                    Zoom
                </span>
                <span className={`text-[9px] truncate ${isSelected || isInteracting ? 'text-blue-700/70 dark:text-blue-300/70' : 'text-blue-700/50 dark:text-blue-400/45'}`}>
                    {zoomLevelToFactor(fragment.zoomLevel).toFixed(1)}× · {(duration / speed).toFixed(1)}s
                </span>
            </div>

            {/* Resize handle - End */}
            <motion.div
                className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 group/resize flex items-center justify-center"
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0}
                dragMomentum={false}
                onDrag={handleResizeEndDrag}
                onDragStart={() => handleResizeStart('end')}
                onDragEnd={handleResizeEnd}
                onClick={(e) => e.stopPropagation()}
                role="slider"
                aria-label="Resize end"
                aria-valuemin={0}
                aria-valuemax={contentDuration ?? videoDuration}
                aria-valuenow={fragment.endTime}
                tabIndex={0}
            >
                <div className={`w-1 h-6 rounded-full transition-all ${isResizing === 'end'
                    ? 'bg-blue-500 dark:bg-blue-300 scale-110'
                    : 'bg-blue-500/70 group-hover/resize:bg-blue-500 dark:bg-blue-400/60 dark:group-hover/resize:bg-blue-300'
                    }`} />
            </motion.div>
        </motion.div>
    );
}