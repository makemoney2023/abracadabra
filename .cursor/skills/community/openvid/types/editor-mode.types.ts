export type EditorMode = "video" | "photo";

export interface EditorModeConfig {
    mode: EditorMode;
    // Features available in each mode
    features: {
        timeline: boolean;
        playerControls: boolean;
        videoClips: boolean;
        audioTracks: boolean;
        zoomFragments: boolean;
        camera: boolean;
        cursor: boolean;
        mockups: boolean;
        background: boolean;
        elements: boolean;
        export: boolean;
    };
}

export const VIDEO_MODE_CONFIG: EditorModeConfig = {
    mode: "video",
    features: {
        timeline: true,
        playerControls: true,
        videoClips: true,
        audioTracks: true,
        zoomFragments: true,
        camera: true,
        cursor: true,
        mockups: true,
        background: true,
        elements: true,
        export: true,
    },
};

export const PHOTO_MODE_CONFIG: EditorModeConfig = {
    mode: "photo",
    features: {
        timeline: false,
        playerControls: false,
        videoClips: false,
        audioTracks: false,
        zoomFragments: false,
        camera: false,
        cursor: false,
        mockups: true,
        background: true,
        elements: true,
        export: true,
    },
};

export function getEditorModeConfig(mode: EditorMode): EditorModeConfig {
    return mode === "video" ? VIDEO_MODE_CONFIG : PHOTO_MODE_CONFIG;
}
