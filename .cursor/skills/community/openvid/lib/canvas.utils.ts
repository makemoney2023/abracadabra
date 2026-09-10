import { AspectRatio } from "@/types/editor.types";
import { ZoomStateCanvas, ZoomFragment, calculateZoomPhaseState, zoomLevelToFactor, speedToTransitionMs, easeOutQuart, ZoomMovement } from "@/types/zoom.types";

export function drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

export function drawRoundedRectBottomOnly(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
): void {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.closePath();
}

export function calculateScaledPadding(
    containerSize: number,
    paddingPercent: number
): number {
    return paddingPercent * containerSize;
}

export function getAspectRatioStyle(ratio: AspectRatio, customDimensions?: { width: number; height: number }): string {
    if ((ratio === "custom" || ratio === "auto") && customDimensions) {
        return `${customDimensions.width}/${customDimensions.height}`;
    }

    switch (ratio) {
        case "16:9": return "16/9";
        case "9:16": return "9/16";
        case "1:1": return "1/1";
        case "4:3": return "4/3";
        case "3:4": return "3/4";
        default: return "16/9";
    }
}

// Numeric aspect ratio (width / height) for a given AspectRatio setting
export function getAspectRatioNumber(ratio: AspectRatio, customDimensions?: { width: number; height: number }): number {
    if ((ratio === "custom" || ratio === "auto") && customDimensions) {
        return customDimensions.width / customDimensions.height;
    }
    switch (ratio) {
        case "16:9": return 16 / 9;
        case "9:16": return 9 / 16;
        case "1:1": return 1;
        case "4:3": return 4 / 3;
        case "3:4": return 3 / 4;
        default: return 16 / 9;
    }
}

export function applyCanvasBackground(
    ctx: CanvasRenderingContext2D,
    cssBackground: string,
    width: number,
    height: number
): void {
    if (cssBackground.startsWith('#') || cssBackground.startsWith('rgb')) {
        ctx.fillStyle = cssBackground;
        ctx.fillRect(0, 0, width, height);
        return;
    }

    if (cssBackground.includes('linear-gradient')) {
        const angleMatch = cssBackground.match(/(\d+)deg/);
        const angle = angleMatch ? parseInt(angleMatch[1]) : 135;

        const colorMatches = cssBackground.matchAll(/(#[0-9a-fA-F]{6}|rgb\([^)]+\))\s+(\d+)%/g);
        const stops: { color: string; position: number }[] = [];

        for (const match of colorMatches) {
            stops.push({
                color: match[1],
                position: parseInt(match[2]) / 100
            });
        }

        if (stops.length >= 2) {
            const angleRad = (angle - 90) * Math.PI / 180;
            const x0 = width / 2 - Math.cos(angleRad) * width / 2;
            const y0 = height / 2 - Math.sin(angleRad) * height / 2;
            const x1 = width / 2 + Math.cos(angleRad) * width / 2;
            const y1 = height / 2 + Math.sin(angleRad) * height / 2;

            const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
            stops.forEach(stop => gradient.addColorStop(stop.position, stop.color));

            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
            return;
        }
    }

    if (cssBackground.includes('radial-gradient')) {
        const colorMatches = cssBackground.matchAll(/(#[0-9a-fA-F]{6}|rgb\([^)]+\))\s+(\d+)%/g);
        const stops: { color: string; position: number }[] = [];

        for (const match of colorMatches) {
            stops.push({
                color: match[1],
                position: parseInt(match[2]) / 100
            });
        }

        if (stops.length >= 2) {
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = Math.max(width, height) / 2;

            const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
            stops.forEach(stop => gradient.addColorStop(stop.position, stop.color));

            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
            return;
        }
    }

    if (cssBackground.includes('conic-gradient')) {
        // Parsear: conic-gradient(from {angle}deg at {x}% {y}%, {stops})
        const angleMatch = cssBackground.match(/from\s+(\d+)deg/);
        const positionMatch = cssBackground.match(/at\s+(\d+)%\s+(\d+)%/);

        const angle = angleMatch ? parseInt(angleMatch[1]) : 0;
        const originX = positionMatch ? parseInt(positionMatch[1]) / 100 : 0.5;
        const originY = positionMatch ? parseInt(positionMatch[2]) / 100 : 0.5;

        const colorMatches = cssBackground.matchAll(/(#[0-9a-fA-F]{6}|rgb\([^)]+\))\s+(\d+)%/g);
        const stops: { color: string; position: number }[] = [];

        for (const match of colorMatches) {
            stops.push({
                color: match[1],
                position: parseInt(match[2]) / 100
            });
        }

        if (stops.length >= 2) {
            const centerX = width * originX;
            const centerY = height * originY;
            const startAngle = (angle - 90) * Math.PI / 180;

            const gradient = ctx.createConicGradient(startAngle, centerX, centerY);
            stops.forEach(stop => gradient.addColorStop(stop.position, stop.color));

            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
            return;
        }
    }

    ctx.fillStyle = '#667eea';
    ctx.fillRect(0, 0, width, height);
}

// Extended zoom state for canvas export including 3D effects
export interface ZoomStateCanvasExport extends ZoomStateCanvas {
    rotateX: number;
    rotateY: number;
    perspective: number;
}
/**
 * Calculate smooth zoom for canvas export.
 *
 * Both entry AND exit ramps occur WITHIN the fragment bounds [startTime, endTime]:
 *   - entry ramp: [start, start+T]       (T = speedToTransitionMs, clamped to dur/2)
 *   - hold:       [start+T, end-T]       (flat at targetScale)
 *   - exit ramp:  [end-T, end]           (back to scale=1 by endTime)
 *
 * This means the zoom is fully complete at endTime: no invisible exit tail
 * after the fragment, so adjacent fragments/content never collide with an
 * unseen zoom-out.
 *
 * For advanced zoom (3D/movement), focus/rotation come from
 * calculateZoomPhaseState(forExport=true), which now uses the same within-
 * fragment exit window, so scale and 3D effects stay in sync.
 */
export function calculateSmoothZoom(
    frameTime: number,
    zoomFragments: ZoomFragment[],
    zoomMovements: ZoomMovement[] = []
): ZoomStateCanvasExport {
    const DEFAULT_STATE: ZoomStateCanvasExport = {
        scale: 1, focusX: 50, focusY: 50, rotateX: 0, rotateY: 0, perspective: 0,
    };

    if (!zoomFragments.length) return DEFAULT_STATE;

    const sortedFragments = [...zoomFragments].sort((a, b) => a.startTime - b.startTime);
    const activeFragment = sortedFragments.find(f => frameTime >= f.startTime && frameTime <= f.endTime);

    const isAdvancedZoom = (f: ZoomFragment) => f.enable3D || f.movementEnabled;
    const movementsFor = (fragmentId: string) => zoomMovements.filter(m => m.zoomFragmentId === fragmentId);

    // Compute scale for a fragment at a given time, covering all 3 phases
    // (entry, hold, exit) entirely WITHIN [startTime, endTime].
    const computeFragmentScale = (fragment: ZoomFragment, time: number): number => {
        const totalDuration = fragment.endTime - fragment.startTime;
        const transitionSec = Math.min(speedToTransitionMs(fragment.speed) / 1000, totalDuration / 2);
        const targetScale = zoomLevelToFactor(fragment.zoomLevel);
        const timeIntoFragment = time - fragment.startTime;

        // Entry ramp [start, start+T]
        if (transitionSec > 0 && timeIntoFragment < transitionSec) {
            const progress = Math.min(1, Math.max(0, timeIntoFragment / transitionSec));
            return 1 + (targetScale - 1) * easeOutQuart(progress);
        }

        // Exit ramp [end-T, end]
        const timeBeforeEnd = fragment.endTime - time;
        if (transitionSec > 0 && timeBeforeEnd < transitionSec) {
            const progress = Math.min(1, Math.max(0, timeBeforeEnd / transitionSec));
            return 1 + (targetScale - 1) * easeOutQuart(progress);
        }

        // Hold
        return targetScale;
    };

    if (activeFragment) {
        const scale = computeFragmentScale(activeFragment, frameTime);
        if (isAdvancedZoom(activeFragment)) {
            const phaseState = calculateZoomPhaseState(activeFragment, frameTime, movementsFor(activeFragment.id), true);
            return { scale, focusX: phaseState.focusX, focusY: phaseState.focusY, rotateX: phaseState.rotateX, rotateY: phaseState.rotateY, perspective: phaseState.perspective };
        }
        return { scale, focusX: activeFragment.focusX, focusY: activeFragment.focusY, rotateX: 0, rotateY: 0, perspective: 0 };
    }

    return DEFAULT_STATE;
}

// Functions to determine nearest corner and corner styles for rotating elements
export type Corner = "top-left" | "top-right" | "bottom-right" | "bottom-left";

export function getNearestCorner(e: React.MouseEvent<HTMLElement>, rotationDeg = 0): Corner {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const dx = e.clientX - cx;
    const dy = e.clientY - cy;

    const rad = (-rotationDeg * Math.PI) / 180;
    const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
    const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

    const isRight = localX > 0;
    const isBottom = localY > 0;
    if (!isRight && !isBottom) return "top-left";
    if (isRight && !isBottom) return "top-right";
    if (isRight && isBottom) return "bottom-right";
    return "bottom-left";
}

export function getCornerStyle(corner: Corner, offset = -10): React.CSSProperties {
    const base: React.CSSProperties = { position: "absolute", zIndex: 20, cursor: "grab" };
    switch (corner) {
        case "top-left":
            return { ...base, top: offset, left: offset };
        case "top-right":
            return { ...base, top: offset, right: offset };
        case "bottom-right":
            return { ...base, bottom: offset, right: offset };
        case "bottom-left":
            return { ...base, bottom: offset, left: offset };
    }
}

export const CORNER_ICON_ROTATION: Record<Corner, number> = {
    "top-right": 0,    // natural SVG position
    "bottom-right": 90,   // rotate 90° clockwise
    "bottom-left": 180,  // rotate 180°
    "top-left": 270,  // rotate 270°
};

export function getResizeHandleStyle(corner: Corner, size = 9): React.CSSProperties {
    const half = size / 2;
    const base: React.CSSProperties = { position: "absolute", zIndex: 25 };
    switch (corner) {
        case "top-left":
            return { ...base, top: -half, left: -half };
        case "top-right":
            return { ...base, top: -half, right: -half };
        case "bottom-right":
            return { ...base, bottom: -half, right: -half };
        case "bottom-left":
            return { ...base, bottom: -half, left: -half };
    }
}

export const CORNER_RESIZE_CURSOR: Record<Corner, string> = {
    "top-left": "nwse-resize",
    "bottom-right": "nwse-resize",
    "top-right": "nesw-resize",
    "bottom-left": "nesw-resize",
};

export const CORNER_SIGNS: Record<Corner, [number, number]> = {
    "top-left": [-1, -1],
    "top-right": [1, -1],
    "bottom-right": [1, 1],
    "bottom-left": [-1, 1],
};

export interface RotationSnapResult {
    angle: number;
    snapped: boolean;
}

const ROTATION_SNAP_STEP = 45;
const ROTATION_SNAP_THRESHOLD = 4;

const MOCKUP_OUTER_RADIUS_MULTIPLIER: Record<string, number> = {
    "iphone-slim": 2.5,
    "glass-curve": 2.5,
    "glass-full": 2.5,
    "hard-shell": 1.5,
    "s24-ultra": 1.2,
    outline: 2.5,
};

const MOCKUP_OUTER_RADIUS_OFFSET: Record<string, number> = {
    outline: 8,
};

export function getMockupOuterRadius(mockupId: string, roundedCorners: number): number {
    const multiplier = MOCKUP_OUTER_RADIUS_MULTIPLIER[mockupId] ?? 1;
    const offset = MOCKUP_OUTER_RADIUS_OFFSET[mockupId] ?? 0;
    return roundedCorners * multiplier + offset;
}

export function snapRotation(
    angle: number,
    step: number = ROTATION_SNAP_STEP,
    threshold: number = ROTATION_SNAP_THRESHOLD
): RotationSnapResult {
    const nearestSnap = Math.round(angle / step) * step;
    if (Math.abs(angle - nearestSnap) <= threshold) {
        return { angle: nearestSnap, snapped: true };
    }
    return { angle, snapped: false };
}

export function drawImageCover(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    dx: number, dy: number, dWidth: number, dHeight: number
) {
    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;
    if (!imgW || !imgH || dWidth <= 0 || dHeight <= 0) return;

    const imgAspect = imgW / imgH;
    const destAspect = dWidth / dHeight;

    let sx: number, sy: number, sWidth: number, sHeight: number;

    if (imgAspect > destAspect) {
        sHeight = imgH;
        sWidth = imgH * destAspect;
        sx = (imgW - sWidth) / 2;
        sy = 0;
    } else {
        sWidth = imgW;
        sHeight = imgW / destAspect;
        sx = 0;
        sy = (imgH - sHeight) / 2;
    }

    ctx.drawImage(img, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
}