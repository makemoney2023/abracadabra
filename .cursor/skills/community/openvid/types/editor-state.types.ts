import type { BackgroundTab, AspectRatio, BackgroundColorConfig, CropArea, ZoomFragment, AudioTrack, ZoomMovement } from "@/types";
import type { TrimRange } from "@/types/timeline.types";
import type { MockupConfig } from "@/types/mockup.types";
import type { CanvasElement } from "@/types/canvas-elements.types";
import type { CameraConfig } from "@/types/camera.types";
import type { Preview3DConfig, ImageMaskConfig } from "@/types/photo.types";
import { MockupMotionFragment } from "@/lib/mockup-motion";
import { VideoTrackClip } from "./video-track.types";

export interface VideoTransform {
    rotation: number;
    translateX: number;
    translateY: number;
}

export interface EditorState {
    backgroundTab: BackgroundTab;
    selectedWallpaper: number;
    backgroundBlur: number;
    padding: number;
    roundedCorners: number;
    shadows: number;
    selectedImageUrl: string;
    backgroundColorConfig: BackgroundColorConfig | null;
    aspectRatio: AspectRatio;
    customDimensions: { width: number; height: number } | null;
    cropArea: CropArea | undefined;
    trimRange: TrimRange;
    zoomFragments: ZoomFragment[];
    mockupId: string;
    mockupConfig: MockupConfig;
    canvasElements: CanvasElement[];
    audioTracks: AudioTrack[];
    muteOriginalAudio: boolean;
    masterVolume: number;
    cameraConfig: CameraConfig | null;
    videoTransform: VideoTransform;
    imageTransform: Preview3DConfig;
    apply3DToBackground: boolean;
    imageMaskConfig: ImageMaskConfig;
    videoMaskConfig: ImageMaskConfig;
    imagePhoneActive: boolean;
    imagePhoneX: number;
    imagePhoneY: number;
    imagePhoneScale: number;
    imagePhoneRotX: number;
    imagePhoneRotY: number;
    imagePhoneRotZ: number;
    imagePhonePerspective: number;
    imagePhoneDevice: 'phone' | 'iphone' | 'iphone-13-pro-max' | 'iphone-17-pro-max' | 'double_iphone_13_pro' | 'laptop' | 'ipad_mini_6_2021';
    imagePhonePresetId: string;
    imagePhoneOpening: number;
    imagePhoneShadow: number;
    imagePhoneShadowColor: string;
    imagePhoneRefWidth: number;
    mockupMotionFragments: MockupMotionFragment[];
    videoClips: VideoTrackClip[];
    zoomMovements: ZoomMovement[];
    imageZoomScale: number;
    unsplashBgUrl: string;
    globalSpeed: number;
}

export function createInitialEditorState(overrides?: Partial<EditorState>): EditorState {
    return {
        backgroundTab: "wallpaper",
        selectedWallpaper: 0,
        backgroundBlur: 0,
        padding: 10,
        roundedCorners: 10,
        shadows: 10,
        selectedImageUrl: "",
        backgroundColorConfig: null,
        aspectRatio: "auto",
        customDimensions: null,
        cropArea: undefined,
        trimRange: { start: 0, end: 0 },
        zoomFragments: [],
        mockupId: "none",
        mockupConfig: {
            darkMode: false,
            frameColor: "#000000",
            url: "",
            headerScale: 100,
            headerOpacity: 100,
            cornerRadius: 10,
        },
        canvasElements: [],
        audioTracks: [],
        muteOriginalAudio: false,
        masterVolume: 1,
        cameraConfig: null,
        videoTransform: {
            rotation: 0,
            translateX: 0,
            translateY: 0,
        },
        imageTransform: {
            id: "front",
            label: "Front",
            rotateX: 0,
            rotateY: 0,
            rotateZ: 0,
            translateY: 0,
            scale: 0.9,
            perspective: 600,
        },
        apply3DToBackground: false,
        imageMaskConfig: {
            enabled: false,
        },
        videoMaskConfig: {
            enabled: false,
        },
        imagePhoneActive: false,
        imagePhoneX: 0,
        imagePhoneY: 0,
        imagePhoneScale: 1,
        imagePhoneRotX: 0,
        imagePhoneRotY: 0,
        imagePhoneRotZ: 0,
        imagePhonePerspective: 600,
        imagePhoneDevice: 'phone',
        imagePhonePresetId: 'front',
        imagePhoneOpening: 1,
        imagePhoneShadow: 0.6,
        imagePhoneShadowColor: '#000000',
        imagePhoneRefWidth: 0,
        mockupMotionFragments: [],
        videoClips: [],
        ...overrides,
        zoomMovements: [],
        imageZoomScale: 1,
        unsplashBgUrl: "",
        globalSpeed: 1,
    };
}
