import { VideoThumbnail } from "./editor.types";

export interface ZoomFragment {
    id: string;
    startTime: number;
    endTime: number;
    zoomLevel: number;
    speed: number;
    focusX: number;
    focusY: number;
    movementEnabled?: boolean;
    enable3D?: boolean;
    perspective3DIntensity?: number;
    perspective3DAngleX?: number;
    perspective3DAngleY?: number;
}

export interface ZoomState {
    fragments: ZoomFragment[];
    selectedFragmentId: string | null;
}

export interface ZoomFragmentEditorProps {
    fragment: ZoomFragment;
    movements: ZoomMovement[];
    selectedMovementId?: string | null;
    onSelectMovement: (id: string | null) => void;
    onToggleMovement: (enabled: boolean) => void;
    onAddMovement: () => void;
    onDeleteMovement: (id: string) => void;
    onUpdateMovementPoint: (id: string, x: number, y: number) => void;
    videoUrl: string | null;
    videoThumbnail?: string | null;
    getThumbnailForTime?: (time: number) => VideoThumbnail | null;
    videoDimensions?: { width: number; height: number } | null;
    onBack: () => void;
    onDelete: () => void;
    onUpdate: (updates: Partial<ZoomFragment>) => void;
    is3DModelActive?: boolean;
}


export function easeOutQuart(t: number): number {
    return 1 - Math.pow(1 - t, 4);
}

export function easeInOutQuart(t: number): number {
    return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
}


export interface ZoomPhaseState {
    phase: 'entry' | 'hold' | 'exit';
    scale: number;
    focusX: number;
    focusY: number;
    progress: number;
    rotateX: number;
    rotateY: number;
    perspective: number;
}

export function calculateZoomPhaseState(
    fragment: ZoomFragment,
    currentTime: number,
    movements: ZoomMovement[] = [],
    forExport: boolean = false,
): ZoomPhaseState {
    const totalDuration = fragment.endTime - fragment.startTime;
    const elapsed = currentTime - fragment.startTime;
    const normalizedTime = Math.max(0, Math.min(1, elapsed / totalDuration));

    const targetScale = zoomLevelToFactor(fragment.zoomLevel);
    const enable3D = fragment.enable3D ?? false;

    // Exit now occurs WITHIN the fragment (ending at endTime), not after it.
    // Clamp transition so entry + exit always fit: if the fragment is too
    // short, each ramp gets at most half the duration (no hold phase).
    const rawTransitionSeconds = speedToTransitionMs(fragment.speed) / 1000;
    const transitionSeconds = Math.min(rawTransitionSeconds, totalDuration / 2);
    const entryEndTime = fragment.startTime + transitionSeconds;
    const exitStartTime = fragment.endTime - transitionSeconds;

    let rotateX = 0;
    let rotateY = 0;
    let perspective = 0;
    let scale = forExport ? 1 : targetScale;
    let focusX = fragment.focusX;
    let focusY = fragment.focusY;
    let phase: 'entry' | 'hold' | 'exit' = 'hold';
    let progress = normalizedTime;

    const sortedMovements = [...movements].sort((a, b) => a.startTime - b.startTime);
    const finalMovementPoint = sortedMovements.length > 0
        ? { x: sortedMovements[sortedMovements.length - 1].focusX, y: sortedMovements[sortedMovements.length - 1].focusY }
        : { x: fragment.focusX, y: fragment.focusY };

    const resolveChainFocus = (time: number): { x: number; y: number } => {
        let fromPoint = { x: fragment.focusX, y: fragment.focusY };
        for (const movement of sortedMovements) {
            if (time <= movement.endTime) {
                const duration = movement.endTime - movement.startTime;
                const localProgress = duration > 0 ? (time - movement.startTime) / duration : 1;
                const eased = easeInOutQuart(Math.max(0, Math.min(1, localProgress)));
                return {
                    x: fromPoint.x + (movement.focusX - fromPoint.x) * eased,
                    y: fromPoint.y + (movement.focusY - fromPoint.y) * eased,
                };
            }
            fromPoint = { x: movement.focusX, y: movement.focusY };
        }
        return fromPoint; 
    };

    
    if (currentTime < entryEndTime && transitionSeconds > 0) {
        
        phase = 'entry';
        const entryProgress = (currentTime - fragment.startTime) / transitionSeconds;
        progress = Math.max(0, Math.min(1, entryProgress));
        const easedProgress = easeOutQuart(progress);

        if (forExport) {
            scale = 1 + (targetScale - 1) * easedProgress;
        }

    } else if (currentTime >= exitStartTime && transitionSeconds > 0) {
        
        phase = 'exit';
        const exitProgress = (currentTime - exitStartTime) / transitionSeconds;
        progress = Math.max(0, Math.min(1, exitProgress));
        const easedProgress = easeOutQuart(progress);

        if (forExport) {
        
            scale = targetScale - (targetScale - 1) * easedProgress;
            if (fragment.movementEnabled) {
                focusX = finalMovementPoint.x;
                focusY = finalMovementPoint.y;
            }
        } else {
     
            scale = 1;
            focusX = 50;
            focusY = 50;
        }

    } else {
        phase = 'hold';

        if (forExport) {
            scale = targetScale;
        }

        if (fragment.movementEnabled) {
            const point = resolveChainFocus(currentTime);
            focusX = point.x;
            focusY = point.y;
        }
    }

    
    if (enable3D) {
        const intensity = (fragment.perspective3DIntensity ?? 50) / 100;

        const baseAngleX = fragment.perspective3DAngleX ?? 0;
        const baseAngleY = fragment.perspective3DAngleY ?? 0;

        let effect3DOpacity = 0;

        if (phase === 'entry') {
            const entryProgress = (currentTime - fragment.startTime) / transitionSeconds;
            effect3DOpacity = Math.min(1, entryProgress * 1.2);
        } else if (phase === 'exit') {
            const exitProgress = (currentTime - exitStartTime) / transitionSeconds;
            effect3DOpacity = Math.max(0, 1 - exitProgress);
        } else {
            effect3DOpacity = 1;
        }

        
        const smoothOpacity = easeInOutQuart(effect3DOpacity);
        perspective = 500;

        const maxRotation = 32 * intensity;
        rotateX = (baseAngleX / 45) * maxRotation * smoothOpacity;
        rotateY = (baseAngleY / 45) * maxRotation * smoothOpacity;
    }

    return {
        phase,
        scale,
        focusX,
        focusY,
        progress,
        rotateX,
        rotateY,
        perspective,
    };
}

export interface ZoomStateCanvas {
    scale: number;
    focusX: number;
    focusY: number;
}

export interface ZoomState {
    scale: number;
    focusX: number;
    focusY: number;
}

const DEFAULT_ZOOM_LEVEL = 1.5;
const DEFAULT_ZOOM_SPEED = 5;

export function createZoomFragment(
    startTime: number,
    endTime: number
): ZoomFragment {
    return {
        id: `zoom_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        startTime,
        endTime,
        zoomLevel: DEFAULT_ZOOM_LEVEL,
        speed: DEFAULT_ZOOM_SPEED,
        focusX: 50,
        focusY: 50,
        movementEnabled: false,
    };
}

export function generateDefaultZoomFragments(
    videoDuration: number
): ZoomFragment[] {
    if (videoDuration <= 0) return [];

    const fragmentDuration = 3;
    const spacing = videoDuration / 3;

    const fragments: ZoomFragment[] = [];

    const start1 = Math.max(0, spacing * 0.5);
    fragments.push(createZoomFragment(
        start1,
        Math.min(start1 + fragmentDuration, videoDuration)
    ));

    const start2 = Math.max(0, spacing * 2);
    fragments.push(createZoomFragment(
        start2,
        Math.min(start2 + fragmentDuration, videoDuration)
    ));

    return fragments;
}


export function zoomLevelToFactor(level: number): number {
    const minZoom = 1.2;
    const maxZoom = 4.0;
    const normalized = (level - 1) / 9;
    return minZoom + (maxZoom - minZoom) * normalized;
}


export function speedToTransitionMs(speed: number): number {
    const minMs = 150;
    const maxMs = 2000;
    const normalized = (speed - 1) / 9;
    return Math.round(maxMs - (maxMs - minMs) * normalized);
}

export const ZOOM_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

export function formatZoomTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export interface ZoomMovement {
    id: string;
    zoomFragmentId: string;
    name: string;
    startTime: number;
    endTime: number;
    focusX: number;
    focusY: number;
}

export function getFragmentHoldBounds(fragment: ZoomFragment): { start: number; end: number } {
    const totalDuration = fragment.endTime - fragment.startTime;
    const transitionSec = Math.min(speedToTransitionMs(fragment.speed) / 1000, totalDuration / 2);
    const start = fragment.startTime + transitionSec;
    const end = fragment.endTime - transitionSec;
    return start <= end ? { start, end } : { start: fragment.startTime, end: fragment.startTime };
}

export function calculateHoldDuration(fragment: ZoomFragment): number {
    const { start, end } = getFragmentHoldBounds(fragment);
    return Math.max(0, end - start);
}

export function canAddFragmentAt(
    startTime: number,
    endTime: number,
    existingFragments: ZoomFragment[],
    excludeFragmentId?: string
): boolean {
    for (const fragment of existingFragments) {
        if (excludeFragmentId && fragment.id === excludeFragmentId) continue;

        const overlaps = startTime < fragment.endTime && endTime > fragment.startTime;
        if (overlaps) return false;
    }
    return true;
}

function findAllGapsInRange(
    existingRanges: Array<{ startTime: number; endTime: number }>,
    rangeStart: number,
    rangeEnd: number,
    minDuration: number
): Array<{ start: number; end: number }> {
    const gaps: Array<{ start: number; end: number }> = [];
    const sorted = [...existingRanges].sort((a, b) => a.startTime - b.startTime);

    if (sorted.length === 0) {
        if (rangeEnd - rangeStart >= minDuration) gaps.push({ start: rangeStart, end: rangeEnd });
        return gaps;
    }

    if (sorted[0].startTime - rangeStart >= minDuration) {
        gaps.push({ start: rangeStart, end: sorted[0].startTime });
    }

    for (let i = 0; i < sorted.length - 1; i++) {
        const gapStart = sorted[i].endTime;
        const gapEnd = sorted[i + 1].startTime;
        if (gapEnd - gapStart >= minDuration) gaps.push({ start: gapStart, end: gapEnd });
    }

    const lastEnd = sorted[sorted.length - 1].endTime;
    if (rangeEnd - lastEnd >= minDuration) gaps.push({ start: lastEnd, end: rangeEnd });

    return gaps;
}

function findAllGaps(
    existingFragments: ZoomFragment[],
    videoDuration: number,
    minDuration: number
): Array<{ start: number; end: number }> {
    return findAllGapsInRange(existingFragments, 0, videoDuration, minDuration);
}

function findValidPositionInGaps(
    clickTime: number,
    defaultDuration: number,
    gaps: Array<{ start: number; end: number }>
): { startTime: number; endTime: number } | null {
    if (gaps.length === 0) return null;

    for (const gap of gaps) {
        if (clickTime >= gap.start && clickTime <= gap.end) {
            const halfDuration = defaultDuration / 2;
            let startTime = clickTime - halfDuration;
            let endTime = clickTime + halfDuration;
            if (startTime < gap.start) { startTime = gap.start; endTime = startTime + defaultDuration; }
            if (endTime > gap.end) { endTime = gap.end; startTime = endTime - defaultDuration; }
            return { startTime, endTime };
        }
    }

    let closestGap = gaps[0];
    let closestDistance = Infinity;
    for (const gap of gaps) {
        const distToStart = Math.abs(clickTime - gap.start);
        const distToEnd = Math.abs(clickTime - gap.end);
        const gapCenter = (gap.start + gap.end) / 2;
        const distToCenter = Math.abs(clickTime - gapCenter);
        const minDist = Math.min(distToStart, distToEnd, distToCenter);
        if (minDist < closestDistance) { closestDistance = minDist; closestGap = gap; }
    }

    if (clickTime <= closestGap.start) {
        return { startTime: closestGap.start, endTime: closestGap.start + defaultDuration };
    } else if (clickTime >= closestGap.end) {
        return { startTime: closestGap.end - defaultDuration, endTime: closestGap.end };
    } else {
        return { startTime: closestGap.start, endTime: closestGap.start + defaultDuration };
    }
}
export function findValidFragmentPosition(
    clickTime: number,
    defaultDuration: number,
    existingFragments: ZoomFragment[],
    videoDuration: number
): { startTime: number; endTime: number } | null {
    const gaps = findAllGaps(existingFragments, videoDuration, defaultDuration);
    return findValidPositionInGaps(clickTime, defaultDuration, gaps);
}

export function findValidMovementPosition(
    clickTime: number,
    defaultDuration: number,
    existingMovements: ZoomMovement[],
    holdStart: number,
    holdEnd: number
): { startTime: number; endTime: number } | null {
    const gaps = findAllGapsInRange(existingMovements, holdStart, holdEnd, defaultDuration);
    return findValidPositionInGaps(clickTime, defaultDuration, gaps);
}