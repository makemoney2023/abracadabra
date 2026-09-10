import { VideoTrackClip } from "@/types/video-track.types";

export function buildAtempoChain(speed: number): string {
    if (!speed || speed <= 0) return "atempo=1.0";
    const stages: string[] = [];
    let remaining = speed;
    while (remaining > 2.0) { stages.push("atempo=2.0"); remaining /= 2.0; }
    while (remaining < 0.5) { stages.push("atempo=0.5"); remaining /= 0.5; }
    stages.push(`atempo=${remaining.toFixed(4)}`);
    return stages.join(",");
}

export function getActiveClipAtTime(clips: VideoTrackClip[], timelineTime: number): { clip: VideoTrackClip; clipTime: number } | null {
    for (const clip of clips) {
        const clipDuration = clip.trimEnd - clip.trimStart;
        const clipEndTime = clip.startTime + clipDuration;
        if (timelineTime >= clip.startTime && timelineTime < clipEndTime) {
            const clipTime = clip.trimStart + (timelineTime - clip.startTime);
            return { clip, clipTime };
        }
    }
    return null;
}

export async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
}
 
export function canvasToBlobFast(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Failed to convert canvas to image"));
            },
            "image/jpeg",
            0.95
        );
    });
}