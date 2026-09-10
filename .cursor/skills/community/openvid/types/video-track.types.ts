export interface VideoTrackClip {
    id: string;
    libraryVideoId: string;
    name: string;
    startTime: number;
    duration: number;
    trimStart: number;
    trimEnd: number;
    thumbnailUrl?: string;
    hasCamera?: boolean;
    width?: number;
    height?: number;
}

export const MIN_CLIP_DURATION = 0.1;

export interface SplitClipResult {
    updatedClip: VideoTrackClip;
    newClip: VideoTrackClip;
}

export function calculateTotalDuration(clips: VideoTrackClip[]): number {
    if (clips.length === 0) return 0;
    const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
    const lastClip = sorted[sorted.length - 1];
    return lastClip.startTime + (lastClip.trimEnd - lastClip.trimStart);
}

export function findNextClipPosition(clips: VideoTrackClip[]): number {
    if (clips.length === 0) return 0;
    const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
    const lastClip = sorted[sorted.length - 1];
    return lastClip.startTime + (lastClip.trimEnd - lastClip.trimStart);
}

export function getClipAtTime(clips: VideoTrackClip[], time: number): VideoTrackClip | null {
    return clips.find(clip => {
        const clipEnd = clip.startTime + (clip.trimEnd - clip.trimStart);
        return time >= clip.startTime && time < clipEnd;
    }) || null;
}

export function splitClipAtTime(clip: VideoTrackClip, timelineTime: number): SplitClipResult | null {
    const clipDuration = clip.trimEnd - clip.trimStart;
    const clipEnd = clip.startTime + clipDuration;

    if (
        timelineTime <= clip.startTime + MIN_CLIP_DURATION ||
        timelineTime >= clipEnd - MIN_CLIP_DURATION
    ) {
        return null;
    }

    const splitPointInSource = clip.trimStart + (timelineTime - clip.startTime);

    const updatedClip: VideoTrackClip = {
        ...clip,
        trimEnd: splitPointInSource,
    };

    const newClip: VideoTrackClip = {
        ...clip,
        id: crypto.randomUUID(),
        startTime: timelineTime,
        trimStart: splitPointInSource,
        trimEnd: clip.trimEnd,
    };

    return { updatedClip, newClip };
}

// Reads the real media duration from metadata. Returns 0 if it can't be read.
// Used to clamp clip durations because recordings store a wall-clock duration
// that can overshoot the real length after WebM→MP4 conversion, which freezes
// multi-clip playback (currentTime never reaches trimEnd).
export async function probeMediaDuration(url: string): Promise<number> {
    return new Promise((resolve) => {
        const probe = document.createElement("video");
        probe.preload = "metadata";
        probe.onloadedmetadata = () => resolve(Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 0);
        probe.onerror = () => resolve(0);
        probe.src = url;
    });
}

export function clampClipToRealDuration(clip: VideoTrackClip, realDuration: number): VideoTrackClip {
    if (realDuration > 0 && realDuration < clip.trimEnd) {
        const clamped = Math.min(clip.trimEnd, realDuration);
        return { ...clip, duration: Math.min(clip.duration, clamped), trimEnd: clamped };
    }
    return clip;
}

export function resequenceClips(clips: VideoTrackClip[]): {
    clips: VideoTrackClip[];
    offsetMap: Map<string, number>;
} {
    // Preserve the array order instead of sorting by startTime. Callers that
    // need a specific order (e.g. reorderVideoClipAt) build the array in the
    // desired order; sorting here would undo the reorder because clips still
    // carry their old startTime values.
    const offsetMap = new Map<string, number>();
    let cursor = 0;
    const resequenced = clips.map(clip => {
        const duration = clip.trimEnd - clip.trimStart;
        const offset = cursor - clip.startTime;
        if (offset !== 0) offsetMap.set(clip.id, offset);
        const newClip = { ...clip, startTime: cursor };
        cursor += duration;
        return newClip;
    });
    return { clips: resequenced, offsetMap };
}

/**
 * Moves `draggedId` to the position of `targetId` (before or after it) and
 * re-sequences every clip so the track stays contiguous — the magnetic
 * reorder used by editors like CapCut. Returns the offset each clip moved
 * by (used to remap timeline overlays).
 */
export function reorderVideoClipAt(
    clips: VideoTrackClip[],
    draggedId: string,
    targetId: string,
    placeAfter: boolean
): {
    clips: VideoTrackClip[];
    offsetMap: Map<string, number>;
} {
    const dragged = clips.find(c => c.id === draggedId);
    const target = clips.find(c => c.id === targetId);
    if (!dragged || !target || draggedId === targetId) {
        return { clips, offsetMap: new Map() };
    }

    const withoutDragged = clips.filter(c => c.id !== draggedId);
    const targetIndex = withoutDragged.findIndex(c => c.id === targetId);
    if (targetIndex === -1) {
        return { clips, offsetMap: new Map() };
    }

    const insertAt = placeAfter ? targetIndex + 1 : targetIndex;
    const reordered = [
        ...withoutDragged.slice(0, insertAt),
        dragged,
        ...withoutDragged.slice(insertAt),
    ];

    return resequenceClips(reordered);
}
