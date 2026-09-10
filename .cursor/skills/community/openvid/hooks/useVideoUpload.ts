import { useCallback, useState } from "react";
import { saveUploadedVideo, getUploadedVideo, deleteUploadedVideo, ALLOWED_VIDEO_TYPES, MAX_VIDEO_SIZE, mapAspectRatio } from "@/lib/video-upload-cache";
import type { AspectRatio } from "@/types";

interface UploadedVideoData {
    url: string;
    videoId: string;
    duration: number;
    aspectRatio: AspectRatio;
    fileName: string;
    width: number;
    height: number;
    timestamp: number;
}

interface UseVideoUploadReturn {
    uploadVideo: (file: File) => Promise<UploadedVideoData | null>;
    loadUploadedVideo: () => Promise<UploadedVideoData | null>;
    clearUploadedVideo: () => Promise<void>;
    isUploading: boolean;
    uploadError: string | null;
}

let cachedLoadedUrl: { key: string; url: string } | null = null;

function releaseCachedUploadedUrl(): void {
    if (cachedLoadedUrl) {
        URL.revokeObjectURL(cachedLoadedUrl.url);
        cachedLoadedUrl = null;
    }
}

export function useVideoUpload(): UseVideoUploadReturn {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const uploadVideo = useCallback(async (file: File): Promise<UploadedVideoData | null> => {
        setIsUploading(true);
        setUploadError(null);

        try {
            if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
                throw new Error("Formato de video no soportado. Use MP4, WebM o MOV.");
            }

            if (file.size > MAX_VIDEO_SIZE) {
                throw new Error("El video es demasiado grande. Máximo 500MB.");
            }

            const cachedVideo = await saveUploadedVideo(file);

            releaseCachedUploadedUrl();
            const url = URL.createObjectURL(cachedVideo.blob);
            cachedLoadedUrl = { key: `${cachedVideo.uploadedAt}`, url };
            const videoId = `uploaded-${cachedVideo.uploadedAt}`;

            return {
                url,
                videoId,
                duration: cachedVideo.duration,
                aspectRatio: mapAspectRatio(cachedVideo.aspectRatio),
                fileName: cachedVideo.fileName,
                width: cachedVideo.width,
                height: cachedVideo.height,
                timestamp: cachedVideo.uploadedAt,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Error al subir el video";
            setUploadError(errorMessage);
            console.error("Video upload error:", error);
            return null;
        } finally {
            setIsUploading(false);
        }
    }, []);

    const loadUploadedVideo = useCallback(async (): Promise<UploadedVideoData | null> => {
        try {
            const cachedVideo = await getUploadedVideo();
            
            if (!cachedVideo) {
                return null;
            }

            const key = `${cachedVideo.uploadedAt}`;
            if (cachedLoadedUrl && cachedLoadedUrl.key === key) {
                return {
                    url: cachedLoadedUrl.url,
                    videoId: `uploaded-${cachedVideo.uploadedAt}`,
                    duration: cachedVideo.duration,
                    aspectRatio: mapAspectRatio(cachedVideo.aspectRatio),
                    fileName: cachedVideo.fileName,
                    width: cachedVideo.width,
                    height: cachedVideo.height,
                    timestamp: cachedVideo.uploadedAt,
                };
            }

            releaseCachedUploadedUrl();
            const url = URL.createObjectURL(cachedVideo.blob);
            cachedLoadedUrl = { key, url };
            const videoId = `uploaded-${cachedVideo.uploadedAt}`;

            return {
                url,
                videoId,
                duration: cachedVideo.duration,
                aspectRatio: mapAspectRatio(cachedVideo.aspectRatio),
                fileName: cachedVideo.fileName,
                width: cachedVideo.width,
                height: cachedVideo.height,
                timestamp: cachedVideo.uploadedAt,
            };
        } catch (error) {
            console.error("Error loading uploaded video:", error);
            return null;
        }
    }, []);

    const clearUploadedVideo = useCallback(async (): Promise<void> => {
        try {
            releaseCachedUploadedUrl();
            await deleteUploadedVideo();
        } catch (error) {
            console.error("Error clearing uploaded video:", error);
        }
    }, []);

    return {
        uploadVideo,
        loadUploadedVideo,
        clearUploadedVideo,
        isUploading,
        uploadError,
    };
}
