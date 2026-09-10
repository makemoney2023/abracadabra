import type { CameraConfig, RecordingSetupConfig } from "./camera.types";

export type RecordingState = "idle" | "countdown" | "recording" | "processing";

export interface RecordingResult {
    blob: Blob;
    url: string;
    duration: number;
}

export interface RecordingContextType {
    state: RecordingState;
    countdown: number;
    recordingTime: number;
    error: string | null;
    startCountdown: (config?: RecordingSetupConfig) => Promise<void>;
    stopRecording: () => void;
    cancelRecording: () => void;
    isIdle: boolean;
    isCountdown: boolean;
    isRecording: boolean;
    isProcessing: boolean;

    cameraStream: MediaStream | null;
    cameraConfig: CameraConfig | null;
    updateCameraConfig: (partial: Partial<CameraConfig>) => void;
}
