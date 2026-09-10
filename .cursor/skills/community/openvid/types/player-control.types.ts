import type { AspectRatio } from "./editor.types";
import type { ImageMaskConfig } from "./photo.types";

export interface PlayerControlsProps {
    isPlaying: boolean;
    currentTime: number;
    videoDuration: number;
    aspectRatio: AspectRatio;
    isFullscreen: boolean;
    zoomLevel: number;
    customAspectRatio?: { width: number; height: number } | null;
    onTogglePlayPause: () => void;
    onSkipBackward: () => void;
    onSkipForward: () => void;
    onToggleFullscreen: () => void;
    onAspectRatioChange: (ratio: AspectRatio) => void;
    onCustomAspectRatioChange?: (dimensions: { width: number; height: number }) => void;
    onOpenCropper: () => void;
    onZoomChange: (zoom: number) => void;
    videoMaskConfig: ImageMaskConfig;
    onVideoMaskConfigChange: (config: ImageMaskConfig) => void;
    videoPreviewImageUrl?: string | null;
    onSplitClip?: () => void;
    canSplitClip?: boolean;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 10;
export const ZOOM_STEP = 1;