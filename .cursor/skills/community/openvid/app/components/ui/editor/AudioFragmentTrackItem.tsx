"use client";
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { motion, useMotionValue } from "framer-motion";
import { AudioFragmentTrackItemProps, MIN_FRAGMENT_DURATION, MIN_VISUAL_WIDTH_PX } from "@/types/audio.types";
import { collectSnapPoints, findSnap } from "@/lib/timeline-snapping";

export function AudioFragmentTrackItem({
  track, audio, isSelected, contentWidth, videoDuration, contentDuration,
  otherTracks, onSelect, onUpdate, onDragStateChange, onMouseEnter, onMouseLeave,
  speed = 1,
  lane = 0,
  laneHeight = 55,
  laneCount = 1,
  currentTime = 0,
  clipEdges = [],
}: AudioFragmentTrackItemProps & { currentTime?: number; clipEdges?: Array<{ start: number; end: number }> }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<'start' | 'end' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fragmentX = useMotionValue(0);
  const fragmentY = useMotionValue(0); 
  const fragmentWidth = useMotionValue(0);

  const topOffset = lane * laneHeight + laneHeight * 0.05;
  const itemHeight = laneHeight * 0.9;
  const maxLaneY = Math.max(0, laneCount - 1) * laneHeight + laneHeight * 0.05;

  const timeToPixels = useCallback((time: number) => (time / videoDuration) * contentWidth, [videoDuration, contentWidth]);
  const pixelsToTime = useCallback((pixels: number) => (pixels / contentWidth) * videoDuration, [contentWidth, videoDuration]);

  const initialLeft = timeToPixels(track.startTime);
  const initialWidth = timeToPixels(track.duration);
  const visualWidth = Math.max(initialWidth, MIN_VISUAL_WIDTH_PX);

  useEffect(() => {
    if (!isDragging && !isResizing) {
      fragmentX.set(initialLeft);
      fragmentWidth.set(visualWidth);
      fragmentY.set(topOffset); 
    }
  }, [initialLeft, visualWidth, topOffset, isDragging, isResizing, fragmentX, fragmentWidth, fragmentY]);

  const boundaries = useMemo(() => {
    const sorted = [...otherTracks]
      .filter(t => t.id !== track.id)
      .sort((a, b) => a.startTime - b.startTime);
    let minStart = 0;
    let maxEnd = contentDuration ?? videoDuration;
    for (const other of sorted) {
      const otherEnd = other.startTime + other.duration;
      const trackEnd = track.startTime + track.duration;
      if (otherEnd <= track.startTime) {
        minStart = Math.max(minStart, otherEnd);
      }
      if (other.startTime >= trackEnd) {
        maxEnd = Math.min(maxEnd, other.startTime);
        break;
      }
    }
    return { minStart, maxEnd };
  }, [otherTracks, track.id, track.startTime, track.duration, videoDuration, contentDuration]);

  const handleDrag = useCallback((_e: MouseEvent | TouchEvent | PointerEvent, info: { delta: { x: number; y: number } }) => {
    if (contentWidth === 0 || videoDuration === 0) return;

    const currentX = fragmentX.get();
    let newX = currentX + info.delta.x;
    const minX = timeToPixels(boundaries.minStart);
    const maxX = timeToPixels(boundaries.maxEnd - track.duration);
    newX = Math.max(minX, Math.min(maxX, newX));

    // Magnetic snapping: snap track start/end to clip edges, other tracks, playhead, zero.
    const snapThresholdPx = 8;
    const newStartTime = pixelsToTime(newX);
    const newEndTime = newStartTime + track.duration;
    const audioEdges = otherTracks.map(t => ({ start: t.startTime, end: t.startTime + t.duration }));
    const snapPoints = collectSnapPoints({ clipEdges, audioEdges, playhead: currentTime });
    const snapStart = findSnap(newStartTime, snapPoints, timeToPixels, snapThresholdPx);
    if (snapStart.offsetPx !== 0) {
      newX = timeToPixels(snapStart.time);
    } else {
      const snapEnd = findSnap(newEndTime, snapPoints, timeToPixels, snapThresholdPx);
      if (snapEnd.offsetPx !== 0) {
        newX = timeToPixels(snapEnd.time - track.duration);
      }
    }
    newX = Math.max(minX, Math.min(maxX, newX));
    fragmentX.set(newX);

    const currentY = fragmentY.get();
    const newY = Math.max(laneHeight * 0.05, Math.min(maxLaneY, currentY + info.delta.y));
    fragmentY.set(newY);
  }, [contentWidth, videoDuration, fragmentX, fragmentY, track.duration, boundaries, timeToPixels, pixelsToTime, otherTracks, clipEdges, currentTime, maxLaneY, laneHeight]);

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
    onDragStateChange?.(true);
  }, [onDragStateChange]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    onDragStateChange?.(false);
    const newStartTime = pixelsToTime(fragmentX.get());
    const newLane = Math.max(0, Math.round((fragmentY.get() - laneHeight * 0.05) / laneHeight));
    onUpdate({
      startTime: Math.max(0, Math.min((contentDuration ?? videoDuration) - track.duration, newStartTime)),
      lane: newLane,
    });
  }, [fragmentX, fragmentY, pixelsToTime, track.duration, videoDuration, contentDuration, onUpdate, onDragStateChange, laneHeight]);

  const handleResizeStartDrag = useCallback((_e: MouseEvent | TouchEvent | PointerEvent, info: { delta: { x: number } }) => {
    if (contentWidth === 0 || videoDuration === 0) return;
    const currentX = fragmentX.get();
    const currentWidth = fragmentWidth.get();
    let newX = currentX + info.delta.x;
    let newWidth = currentWidth - info.delta.x;
    const minWidth = timeToPixels(MIN_FRAGMENT_DURATION);
    if (newWidth < minWidth) {
      newWidth = minWidth;
      newX = currentX + currentWidth - minWidth;
    }
    const minX = timeToPixels(boundaries.minStart);
    if (newX < minX) {
      newWidth = newWidth - (minX - newX);
      newX = minX;
    }
    if (audio) {
      const maxWidth = timeToPixels(audio.duration);
      if (newWidth > maxWidth) {
        const diff = newWidth - maxWidth;
        newX = newX + diff;
        newWidth = maxWidth;
      }
    }
    fragmentX.set(newX);
    fragmentWidth.set(newWidth);
  }, [contentWidth, videoDuration, fragmentX, fragmentWidth, boundaries, timeToPixels, audio]);

  const handleResizeEndDrag = useCallback((_e: MouseEvent | TouchEvent | PointerEvent, info: { delta: { x: number } }) => {
    if (contentWidth === 0 || videoDuration === 0) return;
    const currentX = fragmentX.get();
    const currentWidth = fragmentWidth.get();
    let newWidth = currentWidth + info.delta.x;
    const minWidth = timeToPixels(MIN_FRAGMENT_DURATION);
    newWidth = Math.max(minWidth, newWidth);
    const maxWidth = timeToPixels(boundaries.maxEnd) - currentX;
    newWidth = Math.min(newWidth, maxWidth);
    if (audio) {
      newWidth = Math.min(newWidth, timeToPixels(audio.duration));
    }
    fragmentWidth.set(newWidth);
  }, [contentWidth, videoDuration, fragmentWidth, fragmentX, boundaries, timeToPixels, audio]);

  const handleResizeStart = useCallback((handle: 'start' | 'end') => {
    setIsResizing(handle);
    onDragStateChange?.(true);
  }, [onDragStateChange]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(null);
    onDragStateChange?.(false);
    const newStartTime = pixelsToTime(fragmentX.get());
    const newDuration = pixelsToTime(fragmentWidth.get());
    onUpdate({
      startTime: Math.max(0, newStartTime),
      duration: Math.min(audio?.duration ?? contentDuration ?? videoDuration, newDuration),
    });
  }, [fragmentX, fragmentWidth, pixelsToTime, audio, videoDuration, contentDuration, onUpdate, onDragStateChange]);

  const isInteracting = isDragging || isResizing !== null;

  return (
    <motion.div
      ref={containerRef}
      className={`absolute rounded-md flex items-center border transition-shadow select-none focus:outline-none ${
        isSelected || isInteracting
          ? 'bg-violet-500/30 border-violet-400/70 shadow-[0_0_10px_rgba(139,92,246,0.3)] z-10'
          : 'bg-violet-600/20 border-violet-500/35 hover:border-violet-500/60'
      } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{
        x: fragmentX,
        y: fragmentY,
        width: fragmentWidth,
        height: itemHeight,
        background: isSelected || isInteracting
          ? 'linear-gradient(180deg, rgba(139, 92, 246, 0.5) 0%, rgba(109, 40, 217, 0.4) 100%)'
          : 'linear-gradient(180deg, rgba(124, 58, 237, 0.2) 0%, rgba(91, 33, 182, 0.15) 100%)',
        boxShadow: isSelected || isInteracting
          ? 'inset 0 1px 0 rgba(255,255,255,0.3), 0 0 10px rgba(139,92,246,0.3)'
          : 'inset 0 1px 0 rgba(255,255,255,0.1)'
      }}
      drag
      dragConstraints={{ left: 0, right: contentWidth / speed, top: laneHeight * 0.05, bottom: maxLaneY }}
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
      aria-valuemin={0}
      aria-valuemax={contentDuration ?? videoDuration}
      aria-valuenow={track.startTime}
      aria-label={`Audio fragment ${(track.duration / speed).toFixed(1)}s`}
      tabIndex={0}
    >
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
        aria-valuenow={track.startTime}
        tabIndex={0}
      >
        <div className={`w-1 h-6 rounded-full transition-all ${isResizing === 'start' ? 'bg-violet-500 dark:bg-violet-300 scale-110' : 'bg-violet-600/50 group-hover/resize:bg-violet-500 dark:bg-violet-400/60 dark:group-hover/resize:bg-violet-300'}`} />
      </motion.div>

      <div className="flex-1 flex flex-col items-center justify-center pointer-events-none overflow-hidden px-2">
        <span className={`text-[11px] truncate ${isSelected || isInteracting ? 'text-violet-700 dark:text-violet-200' : 'text-violet-700/70 dark:text-violet-300/70'}`}>
          Audio
        </span>
        <span className={`text-[9px] truncate ${isSelected || isInteracting ? 'text-violet-700/70 dark:text-violet-300/70' : 'text-violet-700/50 dark:text-violet-400/45'}`}>
          {(track.duration / speed).toFixed(1)}s
        </span>
      </div>

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
        aria-valuenow={track.startTime + track.duration}
        tabIndex={0}
      >
        <div className={`w-1 h-6 rounded-full transition-all ${isResizing === 'end' ? 'bg-violet-500 dark:bg-violet-300 scale-110' : 'bg-violet-600/50 group-hover/resize:bg-violet-500 dark:bg-violet-400/60 dark:group-hover/resize:bg-violet-300'}`} />
      </motion.div>
    </motion.div>
  );
}