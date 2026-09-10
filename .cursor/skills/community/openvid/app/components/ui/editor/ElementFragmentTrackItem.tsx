"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, useMotionValue } from "framer-motion";
import { Icon } from "@iconify/react";
import type { CanvasElement } from "@/types/canvas-elements.types";
import { ELEMENT_TYPE_STYLES, getElementLabel, MIN_FRAGMENT_DURATION } from "@/lib/canvas-elements-timeline.utils";

interface ElementFragmentTrackItemProps {
  element: CanvasElement;
  isSelected: boolean;
  contentWidth: number;
  videoDuration: number;
  contentDuration: number;
  lane: number;
  laneHeight: number;
  onSelect: () => void;
  onUpdate: (updates: Partial<CanvasElement>) => void;
  onDelete: () => void;
  onDragStateChange?: (isDragging: boolean) => void;
}

export function ElementFragmentTrackItem({
  element,
  isSelected,
  contentWidth,
  videoDuration,
  contentDuration,
  lane,
  laneHeight,
  onSelect,
  onUpdate,
  onDragStateChange,
}: ElementFragmentTrackItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<"start" | "end" | null>(null);

  const style = ELEMENT_TYPE_STYLES[element.type];
  const label = getElementLabel(element);

  const startTime = element.startTime ?? 0;
  const endTime = element.endTime ?? contentDuration;

  const timeToPixels = useCallback(
    (time: number) => (time / videoDuration) * contentWidth,
    [videoDuration, contentWidth]
  );
  const pixelsToTime = useCallback(
    (pixels: number) => (pixels / contentWidth) * videoDuration,
    [contentWidth, videoDuration]
  );

  const fragmentX = useMotionValue(timeToPixels(startTime));
  const fragmentWidth = useMotionValue(timeToPixels(endTime - startTime));

  useEffect(() => {
    if (!isDragging && !isResizing) {
      fragmentX.set(timeToPixels(startTime));
      fragmentWidth.set(timeToPixels(endTime - startTime));
    }
  }, [startTime, endTime, isDragging, isResizing, timeToPixels, fragmentX, fragmentWidth]);

  const handleBodyDrag = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: { delta: { x: number } }) => {
      if (contentWidth === 0) return;
      const duration = endTime - startTime;
      const maxX = timeToPixels(contentDuration - duration);
      const newX = Math.max(0, Math.min(maxX, fragmentX.get() + info.delta.x));
      fragmentX.set(newX);
    },
    [contentWidth, endTime, startTime, contentDuration, timeToPixels, fragmentX]
  );

  const handleBodyDragEnd = useCallback(() => {
    setIsDragging(false);
    onDragStateChange?.(false);
    const newStart = pixelsToTime(fragmentX.get());
    const duration = endTime - startTime;
    onUpdate({
      startTime: Math.max(0, newStart),
      endTime: Math.min(contentDuration, newStart + duration),
    });
  }, [fragmentX, pixelsToTime, endTime, startTime, contentDuration, onUpdate, onDragStateChange]);

  const handleResizeStartDrag = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: { delta: { x: number } }) => {
      if (contentWidth === 0) return;
      const currentX = fragmentX.get();
      const currentWidth = fragmentWidth.get();
      const rightEdge = currentX + currentWidth;
      const minWidth = timeToPixels(MIN_FRAGMENT_DURATION);
      let newX = currentX + info.delta.x;
      newX = Math.max(0, newX);
      newX = Math.min(newX, rightEdge - minWidth);
      fragmentX.set(newX);
      fragmentWidth.set(rightEdge - newX);
    },
    [contentWidth, fragmentX, fragmentWidth, timeToPixels]
  );

  const handleResizeEndDrag = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: { delta: { x: number } }) => {
      if (contentWidth === 0) return;
      const currentX = fragmentX.get();
      const currentWidth = fragmentWidth.get();
      const minWidth = timeToPixels(MIN_FRAGMENT_DURATION);
      const maxWidth = timeToPixels(contentDuration) - currentX;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, currentWidth + info.delta.x));
      fragmentWidth.set(newWidth);
    },
    [contentWidth, fragmentWidth, fragmentX, timeToPixels, contentDuration]
  );

  const commitResize = useCallback(() => {
    setIsResizing(null);
    onDragStateChange?.(false);
    const newStart = pixelsToTime(fragmentX.get());
    const newEnd = pixelsToTime(fragmentX.get() + fragmentWidth.get());
    onUpdate({
      startTime: Math.max(0, newStart),
      endTime: Math.min(contentDuration, newEnd),
    });
  }, [fragmentX, fragmentWidth, pixelsToTime, contentDuration, onUpdate, onDragStateChange]);

  const isInteracting = isDragging || isResizing !== null;
  const duration = endTime - startTime;

  return (
    <motion.div
      className={`absolute h-[90%] top-[5%] rounded-md flex items-center border transition-shadow select-none focus:outline-none ${isSelected || isInteracting
          ? `${style.activeBorder} ${style.glow} z-10`
          : `${style.idleBorder} hover:brightness-125`
        } ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{
        x: fragmentX,
        width: fragmentWidth,
        top: lane * laneHeight + laneHeight * 0.1,
        height: laneHeight * 0.8,
        background: isSelected || isInteracting ? style.activeBg : style.idleBg,
      }}
      drag="x"
      dragConstraints={{ left: 0, right: contentWidth }}
      dragElastic={0}
      dragMomentum={false}
      onDrag={handleBodyDrag}
      onDragStart={() => { setIsDragging(true); onDragStateChange?.(true); }}
      onDragEnd={handleBodyDragEnd}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      whileTap={{ scale: 0.98 }}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={contentDuration}
      aria-valuenow={startTime}
      aria-label={`${label}, ${duration.toFixed(1)}s`}
      tabIndex={0}
    >
      <motion.div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 flex items-center justify-center"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0}
        dragMomentum={false}
        onDrag={handleResizeStartDrag}
        onDragStart={() => { setIsResizing("start"); onDragStateChange?.(true); }}
        onDragEnd={commitResize}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`w-1 h-4 rounded-full ${isResizing === "start" ? "bg-foreground/80" : "bg-foreground/40"}`} />
      </motion.div>

      <div className="flex-1 flex items-center justify-center gap-1.5 pointer-events-none overflow-hidden px-3 w-full h-full">
        <Icon
          icon={style.icon}
          width="10"
          height="10"
          className={`shrink-0 ${isSelected || isInteracting ? style.activeText : style.idleText}`}
        />
        <span className={`text-[10px] font-medium truncate text-center ${isSelected || isInteracting ? style.activeText : style.idleText
          }`}>
          {label}
        </span>
      </div>
      
      <motion.div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 flex items-center justify-center"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0}
        dragMomentum={false}
        onDrag={handleResizeEndDrag}
        onDragStart={() => { setIsResizing("end"); onDragStateChange?.(true); }}
        onDragEnd={commitResize}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`w-1 h-4 rounded-full ${isResizing === "end" ? "bg-foreground/80" : "bg-foreground/40"}`} />
      </motion.div>
    </motion.div>
  );
}