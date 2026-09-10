"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { motion, useMotionValue } from "framer-motion";
import { MOTION_PRESET_3D_IDS, type MockupMotionFragment } from "@/lib/mockup-motion";
import { useTranslations } from "next-intl";

const MIN_FRAGMENT_DURATION = 0.3;

interface MockupMotionTrackItemProps {
  fragment: MockupMotionFragment;
  isSelected: boolean;
  contentWidth: number;
  videoDuration: number;
  contentDuration: number;
  onSelect: () => void;
  onUpdate: (updates: Partial<MockupMotionFragment>) => void;
  onDelete: () => void;
  onDragStateChange?: (isDragging: boolean) => void;
  otherFragments: MockupMotionFragment[];
}

export function MockupMotionTrackItem({
  fragment,
  isSelected,
  contentWidth,
  videoDuration,
  contentDuration,
  onSelect,
  onUpdate,
  onDragStateChange,
  otherFragments,
}: MockupMotionTrackItemProps) {
  const t = useTranslations("motionMenu");
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<"start" | "end" | null>(null);

  const label = t(`presets.${fragment.presetId}`);

  const is3D = MOTION_PRESET_3D_IDS.has(fragment.presetId);

  const timeToPixels = useCallback(
    (time: number) => (time / videoDuration) * contentWidth,
    [videoDuration, contentWidth]
  );
  const pixelsToTime = useCallback(
    (pixels: number) => (pixels / contentWidth) * videoDuration,
    [contentWidth, videoDuration]
  );

  const fragmentX = useMotionValue(timeToPixels(fragment.startTime));
  const fragmentWidth = useMotionValue(timeToPixels(fragment.endTime - fragment.startTime));

  useEffect(() => {
    if (!isDragging && !isResizing) {
      fragmentX.set(timeToPixels(fragment.startTime));
      fragmentWidth.set(timeToPixels(fragment.endTime - fragment.startTime));
    }
  }, [fragment.startTime, fragment.endTime, isDragging, isResizing, timeToPixels, fragmentX, fragmentWidth]);

  const leftLimit = useMemo(() => {
    const ends = otherFragments
      .filter((f) => f.endTime <= fragment.startTime)
      .map((f) => f.endTime);
    return ends.length > 0 ? Math.max(...ends) : 0;
  }, [otherFragments, fragment.startTime]);

  const rightLimit = useMemo(() => {
    const starts = otherFragments
      .filter((f) => f.startTime >= fragment.endTime)
      .map((f) => f.startTime);
    return starts.length > 0 ? Math.min(...starts) : contentDuration;
  }, [otherFragments, fragment.endTime, contentDuration]);

  const leftLimitPx = timeToPixels(leftLimit);
  const rightLimitPx = timeToPixels(rightLimit);

  const handleBodyDrag = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: { delta: { x: number } }) => {
      if (contentWidth === 0) return;
      const duration = fragment.endTime - fragment.startTime;
      const widthPx = timeToPixels(duration);
      const maxX = Math.min(timeToPixels(contentDuration - duration), rightLimitPx - widthPx);
      const minX = leftLimitPx;
      const newX = Math.max(minX, Math.min(maxX, fragmentX.get() + info.delta.x));
      fragmentX.set(newX);
    },
    [contentWidth, fragment, contentDuration, timeToPixels, fragmentX, leftLimitPx, rightLimitPx]
  );

  const handleBodyDragEnd = useCallback(() => {
    setIsDragging(false);
    onDragStateChange?.(false);
    const newStart = pixelsToTime(fragmentX.get());
    const duration = fragment.endTime - fragment.startTime;
    onUpdate({
      startTime: Math.max(0, newStart),
      endTime: Math.min(contentDuration, newStart + duration),
    });
  }, [fragmentX, pixelsToTime, fragment, contentDuration, onUpdate, onDragStateChange]);

  const handleResizeStartDrag = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: { delta: { x: number } }) => {
      if (contentWidth === 0) return;
      const currentX = fragmentX.get();
      const currentWidth = fragmentWidth.get();
      const rightEdge = currentX + currentWidth;
      const minWidth = timeToPixels(MIN_FRAGMENT_DURATION);

      let newX = currentX + info.delta.x;
      newX = Math.max(leftLimitPx, newX);
      newX = Math.min(newX, rightEdge - minWidth);

      fragmentX.set(newX);
      fragmentWidth.set(rightEdge - newX);
    },
    [contentWidth, fragmentX, fragmentWidth, timeToPixels, leftLimitPx]
  );

  const handleResizeEndDrag = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: { delta: { x: number } }) => {
      if (contentWidth === 0) return;
      const currentX = fragmentX.get();
      const currentWidth = fragmentWidth.get();
      const minWidth = timeToPixels(MIN_FRAGMENT_DURATION);
      const maxWidth = rightLimitPx - currentX;

      const newWidth = Math.max(minWidth, Math.min(maxWidth, currentWidth + info.delta.x));
      fragmentWidth.set(newWidth);
    },
    [contentWidth, fragmentWidth, fragmentX, timeToPixels, rightLimitPx]
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
  const duration = fragment.endTime - fragment.startTime;

  return (
    <motion.div
      className={`absolute h-[90%] top-[5%] rounded-md flex items-center border transition-shadow select-none focus:outline-none ${isSelected || isInteracting
        ? "bg-orange-500/30 border-orange-400/70 shadow-[0_0_10px_rgba(251,146,60,0.35)] z-10"
        : "bg-orange-600/20 border-orange-500/35 hover:border-orange-500/60"
        } ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{
        x: fragmentX,
        width: fragmentWidth,
        top: "10%", height: "80%",
        background:
          isSelected || isInteracting
            ? "linear-gradient(180deg, rgba(251,146,60,0.5) 0%, rgba(194,65,12,0.4) 100%)"
            : "linear-gradient(180deg, rgba(245,158,11,0.2) 0%, rgba(146,64,14,0.15) 100%)",
      }}
      drag="x"
      dragConstraints={{ left: 0, right: contentWidth }}
      dragElastic={0}
      dragMomentum={false}
      onDrag={handleBodyDrag}
      onDragStart={() => {
        setIsDragging(true);
        onDragStateChange?.(true);
      }}
      onDragEnd={handleBodyDragEnd}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      whileTap={{ scale: 0.98 }}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={contentDuration}
      aria-valuenow={fragment.startTime}
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
        onDragStart={() => {
          setIsResizing("start");
          onDragStateChange?.(true);
        }}
        onDragEnd={commitResize}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`w-1 h-5 rounded-full ${isResizing === "start" ? "bg-orange-500 dark:bg-orange-300" : "bg-orange-600/50 dark:bg-orange-400/60"}`} />
      </motion.div>

      <div className="flex-1 flex flex-col items-center justify-center pointer-events-none overflow-hidden px-2">
        <span className={`text-[10px] truncate ${isSelected || isInteracting ? "text-orange-700 dark:text-orange-200" : "text-orange-700/70 dark:text-orange-300/70"}`}>
          {is3D && <span className="mr-0.5 text-[8px] font-bold align-middle">3D</span>}{label}
        </span>
        <span className={`text-[8px] truncate ${isSelected || isInteracting ? "text-orange-700/70 dark:text-orange-300/70" : "text-orange-700/50 dark:text-orange-400/45"}`}>
          {duration.toFixed(1)}s
        </span>
      </div>

      <motion.div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 flex items-center justify-center"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0}
        dragMomentum={false}
        onDrag={handleResizeEndDrag}
        onDragStart={() => {
          setIsResizing("end");
          onDragStateChange?.(true);
        }}
        onDragEnd={commitResize}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`w-1 h-5 rounded-full ${isResizing === "end" ? "bg-orange-500 dark:bg-orange-300" : "bg-orange-600/50 dark:bg-orange-400/60"}`} />
      </motion.div>
    </motion.div>

  );
}