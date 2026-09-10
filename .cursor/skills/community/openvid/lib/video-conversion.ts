import {
    Input,
    Output,
    Mp4OutputFormat,
    BufferTarget,
    Conversion,
    ALL_FORMATS,
    BlobSource,
    MP4,
} from "mediabunny";

const TARGET_VIDEO_CODEC = "avc";
const TARGET_AUDIO_CODEC = "aac";

export interface VideoFormatCheck {
    needsConversion: boolean;
    reason?: string;
}

export async function checkVideoFormat(file: Blob): Promise<VideoFormatCheck> {
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
        const format = await input.getFormat();
        if (format !== MP4) {
            return { needsConversion: true, reason: `non-MP4 container (${format.name})` };
        }
        const videoTrack = await input.getPrimaryVideoTrack();
        if (!videoTrack) {
            return { needsConversion: true, reason: "no readable video track found" };
        }
        const videoCodec = await videoTrack.getCodec();
        const videoDecodable = await videoTrack.canDecode();
        if (videoCodec !== TARGET_VIDEO_CODEC || !videoDecodable) {
            return { needsConversion: true, reason: `video codec ${videoCodec ?? "unknown"}` };
        }
        const audioTrack = await input.getPrimaryAudioTrack();
        if (audioTrack) {
            const audioCodec = await audioTrack.getCodec();
            const audioDecodable = await audioTrack.canDecode();
            if (audioCodec !== TARGET_AUDIO_CODEC || !audioDecodable) {
                return { needsConversion: true, reason: `audio codec ${audioCodec ?? "unknown"}` };
            }
        }
        return { needsConversion: false };
    } catch (err) {
        console.warn("Could not inspect the video, forcing conversion instead:", err);
        return { needsConversion: true, reason: "failed to read the file" };
    } finally {
        input.dispose();
    }
}

export async function convertToMp4(file: Blob): Promise<Blob> {
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
        const outputTarget = new BufferTarget();
        const output = new Output({ format: new Mp4OutputFormat(), target: outputTarget });

        const conversion = await Conversion.init({
            input,
            output,
            video: { hardwareAcceleration: "prefer-hardware", keyFrameInterval: 2 },
            audio: { codec: "aac", sampleRate: 48000, numberOfChannels: 2 },
        });

        if (!conversion.isValid) {
            console.error("Discarded tracks:", conversion.discardedTracks);
            throw new Error("Could not convert the video to MP4.");
        }

        await conversion.execute();

        if (!outputTarget.buffer) {
            throw new Error("The output buffer is null. Conversion failed.");
        }

        return new Blob([outputTarget.buffer], { type: "video/mp4" });
    } finally {
        input.dispose();
    }
}

export interface NormalizeResult {
    blob: Blob;
    wasConverted: boolean;
    reason?: string;
}

export async function normalizeVideoFile(file: Blob): Promise<NormalizeResult> {
    const { needsConversion, reason } = await checkVideoFormat(file);

    if (!needsConversion) {
        return { blob: file, wasConverted: false };
    }

    console.info(`Normalizing video to MP4/H.264 — reason: ${reason}`);
    const mp4Blob = await convertToMp4(file);
    return { blob: mp4Blob, wasConverted: true, reason };
}
