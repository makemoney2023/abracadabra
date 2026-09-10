import type { ZoomMovement } from "@/types/zoom.types";

export const MIN_MOVEMENT_DURATION = 0.3;

export function canAddMovementAt(
  startTime: number,
  endTime: number,
  existingMovements: ZoomMovement[],
  excludeId?: string
): boolean {
  for (const movement of existingMovements) {
    if (excludeId && movement.id === excludeId) continue;
    if (startTime < movement.endTime && endTime > movement.startTime) return false;
  }
  return true;
}

function findAllMovementGaps(
  existingMovements: ZoomMovement[],
  windowStart: number,
  windowEnd: number,
  minDuration: number
): Array<{ start: number; end: number }> {
  const gaps: Array<{ start: number; end: number }> = [];
  const sorted = [...existingMovements].sort((a, b) => a.startTime - b.startTime);

  if (sorted.length === 0) {
    if (windowEnd - windowStart >= minDuration) gaps.push({ start: windowStart, end: windowEnd });
    return gaps;
  }
  if (sorted[0].startTime - windowStart >= minDuration) {
    gaps.push({ start: windowStart, end: sorted[0].startTime });
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = sorted[i].endTime;
    const gapEnd = sorted[i + 1].startTime;
    if (gapEnd - gapStart >= minDuration) gaps.push({ start: gapStart, end: gapEnd });
  }
  const lastEnd = sorted[sorted.length - 1].endTime;
  if (windowEnd - lastEnd >= minDuration) gaps.push({ start: lastEnd, end: windowEnd });
  return gaps;
}

export function hasMovementSpaceAvailable(
  existingMovements: ZoomMovement[],
  windowStart: number,
  windowEnd: number,
  minDuration: number = MIN_MOVEMENT_DURATION
): boolean {
  return findAllMovementGaps(existingMovements, windowStart, windowEnd, minDuration).length > 0;
}

export function findNextMovementSlot(
  existingMovements: ZoomMovement[],
  windowStart: number,
  windowEnd: number,
  defaultDuration: number
): { startTime: number; endTime: number } | null {
  const gaps = findAllMovementGaps(existingMovements, windowStart, windowEnd, Math.min(defaultDuration, MIN_MOVEMENT_DURATION));
  if (gaps.length === 0) return null;
  const gap = gaps[0];
  const duration = Math.min(defaultDuration, gap.end - gap.start);
  return { startTime: gap.start, endTime: gap.start + duration };
}