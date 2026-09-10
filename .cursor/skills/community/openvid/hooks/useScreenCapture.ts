"use client";

import { useState, useCallback, useRef } from "react";

interface ScreenCaptureState {
    status: "idle" | "selecting" | "capturing" | "complete" | "error";
    error: string | null;
}

interface UseScreenCaptureReturn {
    captureScreen: () => Promise<Blob | null>;
    state: ScreenCaptureState;
    isCapturing: boolean;
}

export function useScreenCapture(): UseScreenCaptureReturn {
    const [state, setState] = useState<ScreenCaptureState>({
        status: "idle",
        error: null,
    });

    const streamRef = useRef<MediaStream | null>(null);

    const cleanupStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    }, []);

    const captureScreen = useCallback(async (): Promise<Blob | null> => {
        // Check browser support
        if (!navigator.mediaDevices?.getDisplayMedia) {
            setState({
                status: "error",
                error: "Screen capture is not supported in this browser",
            });
            return null;
        }

        try {
            setState({ status: "selecting", error: null });

            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    displaySurface: "monitor",
                },
                audio: false,
                // @ts-expect-error - preferCurrentTab is a newer API
                preferCurrentTab: false,
            });

            streamRef.current = stream;
            setState({ status: "capturing", error: null });

            const videoTrack = stream.getVideoTracks()[0];
            if (!videoTrack) {
                throw new Error("No video track available");
            }

            const settings = videoTrack.getSettings();
            const width = settings.width || 1920;
            const height = settings.height || 1080;

            const video = document.createElement("video");
            video.srcObject = stream;
            video.muted = true;
            video.playsInline = true;

            await new Promise<void>((resolve, reject) => {
                video.onloadedmetadata = () => {
                    video.play()
                        .then(() => resolve())
                        .catch(reject);
                };
                video.onerror = () => reject(new Error("Failed to load video stream"));
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext("2d", { alpha: false });
            if (!ctx) {
                throw new Error("Failed to create canvas context");
            }

            ctx.drawImage(video, 0, 0, width, height);

            cleanupStream();

            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob(
                    (b) => {
                        if (b) resolve(b);
                        else reject(new Error("Failed to create image blob"));
                    },
                    "image/png",
                    1
                );
            });

            setState({ status: "complete", error: null });

            setTimeout(() => {
                setState({ status: "idle", error: null });
            }, 1000);

            return blob;

        } catch (error) {
            cleanupStream();
            
            if (error instanceof Error && error.name === "NotAllowedError") {
                setState({ status: "idle", error: null });
                return null;
            }

            console.error("Screen capture error:", error);
            setState({
                status: "error",
                error: error instanceof Error ? error.message : "Failed to capture screen",
            });
            return null;
        }
    }, [cleanupStream]);

    return {
        captureScreen,
        state,
        isCapturing: state.status === "selecting" || state.status === "capturing",
    };
}
