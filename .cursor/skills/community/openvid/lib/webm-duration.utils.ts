import {
    Input,
    Output,
    Conversion,
    BufferTarget,
    BlobSource,
    ALL_FORMATS,
    WebMOutputFormat,
} from "mediabunny";

/**
 * MediaRecorder-produced WebM files omit the EBML `Duration` element (and the
 * seek index/Cues), which makes `HTMLVideoElement.duration` report `Infinity`
 * until the element is forced to scan the whole file. That breaks export
 * validation, timeline clamping and multi-clip playback.
 *
 * Strategy (defense in depth):
 *  1. `normalizeRecordingBlob` — remuxes the recording with mediabunny (packet
 *     copy, zero re-encoding) so the file carries proper duration metadata.
 *     Applied when a recording is saved AND as a self-healing migration when a
 *     legacy broken blob is loaded from IndexedDB.
 *  2. `forceResolveVideoDuration` — runtime fallback that forces any given
 *     `<video>` element to compute the real duration via an out-of-range seek.
 */

const PROBE_TIMEOUT_MS = 4000;
const REMUX_TIMEOUT_MS = 60_000;

export interface NormalizedRecording {
    /** The original blob if it was already healthy, otherwise the remuxed one. */
    blob: Blob;
    /** Real media duration in seconds; 0 if it could not be determined. */
    duration: number;
    /** True when the input blob was broken and had to be remuxed. */
    changed: boolean;
}

/**
 * Reads the duration of a media blob using a detached <video> element.
 * Returns `Infinity` when the browser cannot determine it (headerless WebM),
 * and `NaN` only if the blob is not decodable at all.
 */
export function probeBlobDuration(blob: Blob): Promise<number> {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(blob);
        const video = document.createElement("video");
        let settled = false;

        const finish = (value: number) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            video.removeAttribute("src");
            video.load();
            URL.revokeObjectURL(url);
            resolve(value);
        };

        const timeout = setTimeout(() => finish(Infinity), PROBE_TIMEOUT_MS);

        video.preload = "metadata";
        video.muted = true;
        video.onloadedmetadata = () => finish(video.duration);
        video.onerror = () => finish(NaN);
        video.src = url;
    });
}

function isKnownDuration(value: number): value is number {
    return Number.isFinite(value) && value > 0;
}

/**
 * Guarantees a blob whose container metadata includes a real duration.
 *
 * If the blob already reports a finite duration it is returned untouched
 * (zero-cost fast path). Otherwise it is demuxed/remuxed through mediabunny:
 * packets are copied verbatim (no re-encode), but the new WebM header gets a
 * correct `Duration` plus a full Cues index, fixing both duration reporting
 * and seeking accuracy.
 */
export async function normalizeRecordingBlob(blob: Blob): Promise<NormalizedRecording> {
    const probed = await probeBlobDuration(blob);
    if (isKnownDuration(probed)) {
        return { blob, duration: probed, changed: false };
    }

    try {
        const remuxed = await Promise.race([
            remuxWithDurationMetadata(blob),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("Remux timed out")), REMUX_TIMEOUT_MS)
            ),
        ]);
        return remuxed;
    } catch (error) {
        console.warn("[webm-duration] Could not normalize recording blob:", error);
        return { blob, duration: isKnownDuration(probed) ? probed : 0, changed: false };
    }
}

async function remuxWithDurationMetadata(blob: Blob): Promise<NormalizedRecording> {
    const input = new Input({
        formats: ALL_FORMATS,
        source: new BlobSource(blob),
    });

    const output = new Output({
        format: new WebMOutputFormat(),
        target: new BufferTarget(),
    });

    const conversion = await Conversion.init({ input, output });
    await conversion.execute();

    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer || buffer.byteLength === 0) {
        throw new Error("Remux produced an empty buffer");
    }

    const fixedBlob = new Blob([buffer], { type: "video/webm" });
    const duration = await probeBlobDuration(fixedBlob);

    if (!isKnownDuration(duration)) {
        throw new Error("Remuxed blob still reports no duration");
    }

    // Guard against pathological outputs smaller than the source data.
    if (fixedBlob.size < blob.size * 0.5) {
        throw new Error("Remuxed blob is suspiciously smaller than the source");
    }

    return { blob: fixedBlob, duration, changed: true };
}

/**
 * Runtime fallback for elements backed by unfixable sources: forces the
 * browser to compute the real duration by seeking far beyond the end of the
 * media. Resolves once `video.duration` becomes a finite number.
 */
export function forceResolveVideoDuration(video: HTMLVideoElement): Promise<number> {
    return new Promise((resolve) => {
        if (isKnownDuration(video.duration)) {
            resolve(video.duration);
            return;
        }

        let settled = false;

        const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(fallbackTimer);
            video.removeEventListener("durationchange", onDurationChange);
            resolve(isKnownDuration(video.duration) ? video.duration : 0);
        };

        const onDurationChange = () => {
            if (!Number.isFinite(video.duration)) return;
            // Reset to a sane position; also triggers a fresh frame request.
            video.currentTime = 0;
            finish();
        };

        const fallbackTimer = setTimeout(finish, PROBE_TIMEOUT_MS);

        video.addEventListener("durationchange", onDurationChange);
        // Out-of-range target: Chromium clamps it to the last decodable
        // timestamp, which forces a full stream scan and resolves the duration.
        try {
            video.currentTime = 1e101;
        } catch {
            finish();
        }
    });
}
