import type { VideoTrackClip } from "@/types/video-track.types";
import type { ZoomFragment, ZoomMovement } from "@/types/zoom.types";
import type { AudioTrack } from "@/types/audio.types";
import type { CanvasElement } from "@/types/canvas-elements.types";
import type { MockupMotionFragment } from "@/lib/mockup-motion";

/**
 * Keeps timeline overlays (zoom fragments, audio tracks, canvas elements,
 * motion fragments) in sync when the video clip layout changes (clip deleted,
 * trimmed, or reordered).
 *
 * Overlays are stored in absolute timeline time. When clips move, shrink, or
 * disappear, each overlay interval is mapped through the clip that contains
 * it: shifted by that clip's new offset, clamped to its new bounds, and
 * dropped entirely when its containing clip was removed.
 */

interface ClipRange {
    oldStart: number;
    oldEnd: number;
    newStart: number;
    newEnd: number;
}

function buildClipRanges(oldClips: VideoTrackClip[], newClips: VideoTrackClip[]): ClipRange[] {
    const newById = new Map(newClips.map(c => [c.id, c]));
    const ranges: ClipRange[] = [];

    for (const oldClip of oldClips) {
        const oldDuration = oldClip.trimEnd - oldClip.trimStart;
        const newClip = newById.get(oldClip.id);
        if (!newClip) continue; // removed — overlays on it get dropped
        const newDuration = newClip.trimEnd - newClip.trimStart;
        ranges.push({
            oldStart: oldClip.startTime,
            oldEnd: oldClip.startTime + oldDuration,
            newStart: newClip.startTime,
            newEnd: newClip.startTime + newDuration,
        });
    }

    return ranges.sort((a, b) => a.oldStart - b.oldStart);
}

/**
 * Maps an overlay interval through the clip layout change.
 * Returns null when the overlay should be dropped.
 */
function mapInterval(
    start: number,
    end: number,
    ranges: ClipRange[]
): { start: number; end: number } | null {
    if (end <= start) return null;

    // Find the clip that contains the overlay's midpoint (falling back to the
    // clip that contains its start). Overlays sitting in a gap keep their
    // absolute position — there is no clip to anchor them to.
    const mid = (start + end) / 2;
    const containing =
        ranges.find(r => mid >= r.oldStart && mid < r.oldEnd) ??
        ranges.find(r => start >= r.oldStart && start < r.oldEnd);

    if (!containing) {
        return { start, end };
    }

    const offset = containing.newStart - containing.oldStart;
    let newStart = start + offset;
    let newEnd = end + offset;

    // Clamp to the clip's new bounds; drop if nothing visible remains.
    const clampedStart = Math.max(newStart, containing.newStart);
    const clampedEnd = Math.min(newEnd, containing.newEnd);
    if (clampedEnd - clampedStart <= 0.01) return null;

    newStart = clampedStart;
    newEnd = clampedEnd;

    return { start: newStart, end: newEnd };
}

export interface RemapOverlaysInput {
    oldClips: VideoTrackClip[];
    newClips: VideoTrackClip[];
    zoomFragments: ZoomFragment[];
    zoomMovements: ZoomMovement[];
    audioTracks: AudioTrack[];
    canvasElements: CanvasElement[];
    motionFragments: MockupMotionFragment[];
}

export interface RemapOverlaysResult {
    zoomFragments: ZoomFragment[];
    zoomMovements: ZoomMovement[];
    audioTracks: AudioTrack[];
    canvasElements: CanvasElement[];
    motionFragments: MockupMotionFragment[];
    /** Zoom fragment ids that were dropped (their movements are removed too). */
    droppedFragmentIds: Set<string>;
}

export function remapOverlaysAfterClipChange(input: RemapOverlaysInput): RemapOverlaysResult {
    const { oldClips, newClips } = input;
    const ranges = buildClipRanges(oldClips, newClips);

    // Skip all work when nothing relevant changed (pure selection updates etc.)
    const layoutChanged = ranges.some(r => r.newStart !== r.oldStart || r.newEnd !== r.oldEnd)
        || newClips.length !== oldClips.length;
    if (!layoutChanged) {
        return {
            zoomFragments: input.zoomFragments,
            zoomMovements: input.zoomMovements,
            audioTracks: input.audioTracks,
            canvasElements: input.canvasElements,
            motionFragments: input.motionFragments,
            droppedFragmentIds: new Set(),
        };
    }

    const zoomFragments: ZoomFragment[] = [];
    const droppedFragmentIds = new Set<string>();

    for (const fragment of input.zoomFragments) {
        const mapped = mapInterval(fragment.startTime, fragment.endTime, ranges);
        if (!mapped) {
            droppedFragmentIds.add(fragment.id);
            continue;
        }
        zoomFragments.push({ ...fragment, startTime: mapped.start, endTime: mapped.end });
    }

    const zoomMovements = input.zoomMovements.filter(
        m => !droppedFragmentIds.has(m.zoomFragmentId)
    );

    const audioTracks: AudioTrack[] = [];
    for (const track of input.audioTracks) {
        const mapped = mapInterval(track.startTime, track.startTime + track.duration, ranges);
        if (!mapped) continue;
        const duration = mapped.end - mapped.start;
        audioTracks.push({ ...track, startTime: mapped.start, duration });
    }

    const canvasElements: CanvasElement[] = [];
    for (const element of input.canvasElements) {
        const start = element.startTime ?? 0;
        const end = element.endTime;
        // Elements without an endTime span the whole timeline — only shift them
        // when they have a bounded interval.
        if (end === undefined) {
            canvasElements.push(element);
            continue;
        }
        const mapped = mapInterval(start, end, ranges);
        if (!mapped) continue;
        canvasElements.push({
            ...element,
            startTime: mapped.start,
            endTime: mapped.end,
        } as CanvasElement);
    }

    const motionFragments: MockupMotionFragment[] = [];
    for (const fragment of input.motionFragments) {
        const mapped = mapInterval(fragment.startTime, fragment.endTime, ranges);
        if (!mapped) continue;
        motionFragments.push({ ...fragment, startTime: mapped.start, endTime: mapped.end });
    }

    return {
        zoomFragments,
        zoomMovements,
        audioTracks,
        canvasElements,
        motionFragments,
        droppedFragmentIds,
    };
}
