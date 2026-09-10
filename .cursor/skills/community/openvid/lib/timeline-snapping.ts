/**
 * Snapping helpers for the timeline.
 *
 * Collects all "snap points" (clip edges, fragment edges, playhead, zero) and
 * finds the nearest one within a pixel threshold. Used by drag handlers for
 * clips, fragments, and the playhead to implement magnetic snapping.
 */

export interface SnapPoint {
    time: number;
    label?: string;
}

export interface SnapResult {
    /** The snapped time, or null if no snap point was within range. */
    time: number;
    /** The pixel offset that was applied (for rendering snap indicators). */
    offsetPx: number;
}

/**
 * Collects snap points from all timeline entities.
 * De-duplicates and sorts them.
 */
export function collectSnapPoints(opts: {
    clipEdges?: Array<{ start: number; end: number }>;
    fragmentEdges?: Array<{ start: number; end: number }>;
    audioEdges?: Array<{ start: number; end: number }>;
    elementEdges?: Array<{ start: number; end: number }>;
    motionEdges?: Array<{ start: number; end: number }>;
    playhead?: number;
    zero?: boolean;
}): SnapPoint[] {
    const points: SnapPoint[] = [];
    const add = (t: number) => points.push({ time: Math.max(0, t) });

    if (opts.zero !== false) add(0);

    for (const e of opts.clipEdges ?? []) {
        add(e.start);
        add(e.end);
    }
    for (const e of opts.fragmentEdges ?? []) {
        add(e.start);
        add(e.end);
    }
    for (const e of opts.audioEdges ?? []) {
        add(e.start);
        add(e.end);
    }
    for (const e of opts.elementEdges ?? []) {
        add(e.start);
        if (e.end !== undefined) add(e.end);
    }
    for (const e of opts.motionEdges ?? []) {
        add(e.start);
        add(e.end);
    }
    if (opts.playhead !== undefined) add(opts.playhead);

    // De-duplicate within 1ms
    const sorted = points.sort((a, b) => a.time - b.time);
    const deduped: SnapPoint[] = [];
    for (const p of sorted) {
        if (deduped.length === 0 || Math.abs(p.time - deduped[deduped.length - 1].time) > 0.001) {
            deduped.push(p);
        }
    }
    return deduped;
}

/**
 * Finds the nearest snap point to `time` within `thresholdPx` pixels.
 * Returns the snapped time (unchanged if no snap), and the pixel offset.
 */
export function findSnap(
    time: number,
    snapPoints: SnapPoint[],
    timeToPx: (t: number) => number,
    thresholdPx: number,
): SnapResult {
    let bestTime = time;
    let bestDist = thresholdPx;
    let found = false;

    for (const p of snapPoints) {
        const distPx = Math.abs(timeToPx(p.time) - timeToPx(time));
        if (distPx <= bestDist) {
            bestDist = distPx;
            bestTime = p.time;
            found = true;
        }
    }

    if (!found) {
        return { time, offsetPx: 0 };
    }

    const offsetPx = timeToPx(bestTime) - timeToPx(time);
    return { time: bestTime, offsetPx };
}
