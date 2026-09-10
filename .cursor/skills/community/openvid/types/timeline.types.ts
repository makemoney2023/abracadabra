import { ZoomFragment, ZoomMovement } from "./zoom.types";
import type { AudioTrack, UploadedAudio } from "./audio.types";
import type { VideoTrackClip } from "./video-track.types";
import { MockupMotionFragment } from "@/lib/mockup-motion";
import { CanvasElement } from "./canvas-elements.types";

export interface TrimRange {
    start: number;
    end: number;
}

export interface TimelineProps {
    videoDuration: number;
    currentTime: number;
    onSeek: (time: number) => void;
    videoUrl?: string | null;
    zoomLevel: number;
    isDraggingPlayhead?: boolean;
    onDragStart?: () => void;
    onDragEnd?: () => void;
    trimRange: TrimRange;
    onTrimChange: (range: TrimRange) => void;
    // Video clips props (multi-video support)
    videoClips?: VideoTrackClip[];
    selectedVideoClipId?: string | null;
    onSelectVideoClip?: (clipId: string | null) => void;
    onUpdateVideoClip?: (clipId: string, updates: Partial<VideoTrackClip>) => void;
    onDeleteVideoClip?: (clipId: string) => void;
    onReorderVideoClip?: (draggedId: string, targetId: string, placeAfter: boolean) => void;
    // Zoom props
    zoomFragments?: ZoomFragment[];
    selectedZoomFragmentId?: string | null;
    onSelectZoomFragment?: (fragmentId: string | null) => void;
    onAddZoomFragment?: (startTime: number, endTime: number) => void;
    onUpdateZoomFragment?: (fragmentId: string, updates: Partial<ZoomFragment>) => void;
    onActivateZoomTool?: () => void;
    onActivateMotionTool?: () => void;
    // Audio props
    audioTracks?: AudioTrack[];
    uploadedAudios?: UploadedAudio[];
    selectedAudioTrackId?: string | null;
    onSelectAudioTrack?: (trackId: string | null) => void;
    onUpdateAudioTrack?: (trackId: string, updates: Partial<AudioTrack>) => void;
    globalSpeed?: number;
    isPlaying?: boolean;
    onZoomChange?: (zoom: number) => void;
    mockupMotionFragments?: MockupMotionFragment[];
    selectedMockupMotionFragmentId?: string | null;
    onSelectMockupMotionFragment?: (id: string | null) => void;
    onUpdateMockupMotionFragment?: (id: string, updates: Partial<MockupMotionFragment>) => void;
    onDeleteMockupMotionFragment?: (id: string) => void;
    canvasElements?: CanvasElement[];
    selectedElementId?: string | null;
    onSelectElement?: (id: string | null) => void;
    onUpdateElement?: (id: string, updates: Partial<CanvasElement>) => void;
    onDeleteElement?: (id: string) => void;

    zoomMovements?: ZoomMovement[];
    selectedZoomMovementId?: string | null;
    onSelectZoomMovement?: (id: string | null) => void;
    onUpdateZoomMovement?: (id: string, updates: Partial<ZoomMovement>) => void;
    onDeleteZoomMovement?: (id: string) => void;
    onAddZoomMovementAtRange?: (startTime: number, endTime: number) => void;
}

export const DEFAULT_ZOOM_FRAGMENT_DURATION = 3;
export const ELEMENT_ROW_HEIGHT = 55;
export const DEFAULT_MOVEMENT_DURATION = 1;
export const VIDEO_ROW_MIN_HEIGHT = 64;
export const VIDEO_ROW_MAX_HEIGHT = 78;