import type { AudioTrack } from "@/types/audio.types";

interface LaneBox {
  startPx: number;
  endPx: number;
}

function computeBox(
  track: AudioTrack,
  timeToPixels: (time: number) => number,
  minVisualWidthPx: number,
): LaneBox {
  const startPx = timeToPixels(track.startTime);
  const rawWidthPx = timeToPixels(track.startTime + track.duration) - startPx;
  return { startPx, endPx: startPx + Math.max(rawWidthPx, minVisualWidthPx) };
}

export function assignAudioLanes(
  tracks: AudioTrack[],
  timeToPixels: (time: number) => number,
  minVisualWidthPx: number,
): Map<string, number> {
  const laneEndPx = new Map<number, number>();
  const laneOf = new Map<string, number>();

  const pinned = tracks
    .filter((t) => t.lane !== undefined)
    .sort((a, b) => a.startTime - b.startTime);
  const unpinned = tracks
    .filter((t) => t.lane === undefined)
    .sort((a, b) => a.startTime - b.startTime);

  for (const t of pinned) {
    const { startPx, endPx } = computeBox(t, timeToPixels, minVisualWidthPx);
    let lane = t.lane!;
    while ((laneEndPx.get(lane) ?? 0) > startPx) lane++;
    laneEndPx.set(lane, endPx);
    laneOf.set(t.id, lane);
  }

  for (const t of unpinned) {
    const { startPx, endPx } = computeBox(t, timeToPixels, minVisualWidthPx);
    let lane = 0;
    while ((laneEndPx.get(lane) ?? 0) > startPx) lane++;
    laneEndPx.set(lane, endPx);
    laneOf.set(t.id, lane);
  }

  return laneOf;
}
