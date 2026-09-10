"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, useMotionValue } from "framer-motion";
import type { ZoomMovement } from "@/types/zoom.types";

export const MIN_MOVEMENT_TRACK_DURATION = 0.6;

interface ZoomMovementTrackItemProps {
  movement: ZoomMovement;
  index: number;
  isSelected: boolean;
  contentWidth: number;
  videoDuration: number;
  holdStart: number;
  holdEnd: number;
  otherMovements: ZoomMovement[];
  onSelect: () => void;
  onUpdate: (updates: Partial<ZoomMovement>) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function ZoomMovementTrackItem({
  movement, index, isSelected, contentWidth, videoDuration,
  holdStart, holdEnd, otherMovements, onSelect, onUpdate, onDragStateChange, onMouseEnter, onMouseLeave,
}: ZoomMovementTrackItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<"start" | "end" | null>(null);

  const timeToPixels = useCallback((time: number) => (time / videoDuration) * contentWidth, [videoDuration, contentWidth]);
  const pixelsToTime = useCallback((pixels: number) => (pixels / contentWidth) * videoDuration, [contentWidth, videoDuration]);

  const fragmentX = useMotionValue(0);
  const fragmentWidth = useMotionValue(0);
  const initialLeft = timeToPixels(movement.startTime);
  const initialWidth = timeToPixels(movement.endTime - movement.startTime);

  useEffect(() => {
    if (!isDragging && !isResizing) {
      fragmentX.set(initialLeft);
      fragmentWidth.set(initialWidth);
    }
  }, [initialLeft, initialWidth, isDragging, isResizing, fragmentX, fragmentWidth]);

  const boundaries = useMemo(() => {
    const sorted = [...otherMovements].sort((a, b) => a.startTime - b.startTime);
    let minStart = holdStart;
    let maxEnd = holdEnd;
    for (const other of sorted) {
      if (other.endTime <= movement.startTime) minStart = Math.max(minStart, other.endTime);
      if (other.startTime >= movement.endTime) { maxEnd = Math.min(maxEnd, other.startTime); break; }
    }
    return { minStart, maxEnd };
  }, [otherMovements, movement.startTime, movement.endTime, holdStart, holdEnd]);

  const handleDrag = useCallback((_: unknown, info: { delta: { x: number } }) => {
    if (contentWidth === 0 || videoDuration === 0) return;
    const currentX = fragmentX.get();
    const duration = movement.endTime - movement.startTime;
    let newX = currentX + info.delta.x;
    const minX = timeToPixels(boundaries.minStart);
    const maxX = timeToPixels(boundaries.maxEnd - duration);
    newX = Math.max(minX, Math.min(maxX, newX));
    fragmentX.set(newX);
  }, [contentWidth, videoDuration, fragmentX, movement, boundaries, timeToPixels]);

  const handleDragStart = useCallback(() => { setIsDragging(true); onDragStateChange?.(true); }, [onDragStateChange]);
  const handleDragEnd = useCallback(() => {
    setIsDragging(false); onDragStateChange?.(false);
    const newStart = pixelsToTime(fragmentX.get());
    const duration = movement.endTime - movement.startTime;
    onUpdate({ startTime: Math.max(holdStart, newStart), endTime: Math.min(holdEnd, newStart + duration) });
  }, [fragmentX, pixelsToTime, movement, holdStart, holdEnd, onUpdate, onDragStateChange]);

  const handleResizeStartDrag = useCallback((_: unknown, info: { delta: { x: number } }) => {
    if (contentWidth === 0 || videoDuration === 0) return;
    const currentX = fragmentX.get();
    const currentWidth = fragmentWidth.get();
    let newX = currentX + info.delta.x;
    let newWidth = currentWidth - info.delta.x;
    const minWidth = timeToPixels(MIN_MOVEMENT_TRACK_DURATION);
    if (newWidth < minWidth) { newWidth = minWidth; newX = currentX + currentWidth - minWidth; }
    const minX = timeToPixels(boundaries.minStart);
    if (newX < minX) { const diff = minX - newX; newX = minX; newWidth = currentWidth - diff; }
    fragmentX.set(newX); fragmentWidth.set(newWidth);
  }, [contentWidth, videoDuration, fragmentX, fragmentWidth, boundaries, timeToPixels]);

  const handleResizeEndDrag = useCallback((_: unknown, info: { delta: { x: number } }) => {
    if (contentWidth === 0 || videoDuration === 0) return;
    const currentWidth = fragmentWidth.get();
    let newWidth = currentWidth + info.delta.x;
    const minWidth = timeToPixels(MIN_MOVEMENT_TRACK_DURATION);
    newWidth = Math.max(minWidth, newWidth);
    const currentX = fragmentX.get();
    const maxWidth = timeToPixels(boundaries.maxEnd) - currentX;
    newWidth = Math.min(newWidth, maxWidth);
    fragmentWidth.set(newWidth);
  }, [contentWidth, videoDuration, fragmentWidth, fragmentX, boundaries, timeToPixels]);

  const handleResizeStart = useCallback((h: "start" | "end") => { setIsResizing(h); onDragStateChange?.(true); }, [onDragStateChange]);
  const handleResizeEnd = useCallback(() => {
    setIsResizing(null); onDragStateChange?.(false);
    const newStart = pixelsToTime(fragmentX.get());
    const newEnd = pixelsToTime(fragmentX.get() + fragmentWidth.get());
    onUpdate({ startTime: Math.max(holdStart, newStart), endTime: Math.min(holdEnd, newEnd) });
  }, [fragmentX, fragmentWidth, pixelsToTime, holdStart, holdEnd, onUpdate, onDragStateChange]);

  const duration = movement.endTime - movement.startTime;
  const isInteracting = isDragging || isResizing !== null;

  return (
    <motion.div
      className={`absolute h-[80%] top-1/2 -translate-y-1/2 rounded-md flex items-center border transition-shadow select-none focus:outline-none ${isSelected || isInteracting
          ? "bg-emerald-500/30 border-emerald-400/70 shadow-[0_0_10px_rgba(16,185,129,0.3)] z-10"
          : "border-emerald-500/35 hover:border-emerald-500/60"
        } ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{ x: fragmentX, width: fragmentWidth }}
      drag="x"
      dragConstraints={{ left: 0, right: contentWidth }}
      dragElastic={0}
      dragMomentum={false}
      onDrag={handleDrag}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      whileTap={{ scale: 0.98 }}
      role="slider"
      aria-label={`Movement ${index}: ${movement.name}, ${duration.toFixed(1)}s`}
      tabIndex={0}
    >
      <motion.div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 flex items-center justify-center"
        drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0} dragMomentum={false}
        onDrag={handleResizeStartDrag} onDragStart={() => handleResizeStart("start")} onDragEnd={handleResizeEnd}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`w-1 h-5 rounded-full ${isResizing === "start" ? "bg-emerald-300 scale-110" : "bg-emerald-500/70"}`} />
      </motion.div>

      <div className="flex-1 flex flex-col items-center justify-center pointer-events-none overflow-hidden px-2">
        <span className="text-[10px] truncate text-emerald-700 dark:text-emerald-200">{movement.name}</span>
        <span className="text-[9px] truncate text-emerald-700/60 dark:text-emerald-300/60">{duration.toFixed(1)}s</span>
      </div>

      <motion.div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 flex items-center justify-center"
        drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0} dragMomentum={false}
        onDrag={handleResizeEndDrag} onDragStart={() => handleResizeStart("end")} onDragEnd={handleResizeEnd}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`w-1 h-5 rounded-full ${isResizing === "end" ? "bg-emerald-300 scale-110" : "bg-emerald-500/70"}`} />
      </motion.div>
    </motion.div>
  );
}