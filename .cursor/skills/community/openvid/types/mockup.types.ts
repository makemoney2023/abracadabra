export type MockupCategory = "browser" | "device" | "ide" | "all";
export const FRAME_COLORS_DARK = ["#1e1e1e", "#252033", "#16283d", "#2d1c28", "#1b2e24", "#2c302e"];

export const FRAME_COLORS_LIGHT = ["#ffffff", "#fff0f2", "#f0f7ff", "#f2faf6", "#f6f3ff"];

export const FRAME_COLORS = [...FRAME_COLORS_DARK, ...FRAME_COLORS_LIGHT];

// Available configurations for each mockup
export interface MockupFeatures {
    hasDarkMode: boolean;
    hasFrameColor: boolean;  // Header/frame color
    hasUrl: boolean;
    hasHeaderScale: boolean; // Proportional header scale
    hasHeaderOpacity: boolean; // Header/frame opacity
    hasCornerRadius: boolean;
}

// Current mockup configuration
export interface MockupConfig {
    darkMode: boolean;
    frameColor: string;      // Header/frame color
    url: string;
    headerScale: number;     // Header scale (50-150, where 100 is normal)
    headerOpacity: number;   // Header opacity (0-100)
    cornerRadius: number;
}

// Mockup definition
export interface Mockup {
    id: string;
    name: string;
    category: Exclude<MockupCategory, "all">;
    preview: React.ReactNode;
    features?: MockupFeatures; // Optional - uses DEFAULT if not defined
    defaultConfig?: Partial<MockupConfig>;
}

// Mockup system state
export interface MockupState {
    enabled: boolean;
    selectedMockupId: string;
    config: MockupConfig;
}

// Props for rendering a mockup on the canvas
export interface MockupRenderProps {
    children: React.ReactNode;
    config: MockupConfig;
    className?: string;
    maskStyles?: React.CSSProperties;
    onConfigChange?: (config: Partial<MockupConfig>) => void;
}

// Default configuration
export const DEFAULT_MOCKUP_CONFIG: MockupConfig = {
    darkMode: false,
    frameColor: "#f6f6f6",
    url: "https://openvid.dev",
    headerScale: 60,        // 100% = normal size
    headerOpacity: 100,     // 100% = fully opaque
    cornerRadius: 12,
};

// Default features (no features enabled)
export const DEFAULT_MOCKUP_FEATURES: MockupFeatures = {
    hasDarkMode: false,
    hasFrameColor: false,
    hasUrl: false,
    hasHeaderScale: false,
    hasCornerRadius: false,
    hasHeaderOpacity: false,
};

export function getMockupFeatures(mockup: Mockup | undefined): MockupFeatures {
    return mockup?.features ?? DEFAULT_MOCKUP_FEATURES;
}

export function getMockupDefaultConfig(mockup: Mockup | undefined): MockupConfig {
    return {
        ...DEFAULT_MOCKUP_CONFIG,
        ...(mockup?.defaultConfig ?? {}),
    };
}

export type ImageDeviceId = (typeof IMAGE_DEVICE_TEMPLATES)[number]["id"];

export const PAD_H = 130;
export const X_HALF = 500;
export const Y_HALF = 500;
export const HANDLE_R = 9;

export type MenuPage = "home" | "detail-2d" | "detail-3d";

export const IMAGE_DEVICE_TEMPLATES = [
    {
        id: "iphone-13-pro-max",
        title: "iPhone 13 Pro",
        accentColor: "#B9D5FD",
        icon: "simple-icons:apple",
        modelUrl: "/models/apple_iphone_13_pro_max.glb",
        posterUrl: encodeURI("/images/mockups-3d/iphone-13pro.avif"),
        videoUrl: encodeURI("/videos/mockups-3d/iphone-13pro.mp4"),
    },
    {
        id: "double_iphone_13_pro",
        title: "Double iPhone 13 Pro",
        accentColor: "#F6B397",
        icon: "simple-icons:apple",
        modelUrl: "/models/double_iphone_13_pro.glb",
        posterUrl: encodeURI("/images/mockups-3d/double-iphone-13pro.avif"),
        videoUrl: encodeURI("/videos/mockups-3d/double-iphone-13pro.mp4"),
    },
    {
        id: "iphone-17-pro-max",
        title: "iPhone 17 Pro",
        accentColor: "#FCB370",
        icon: "simple-icons:apple",
        modelUrl: "/models/iphone-17-pro-max.glb",
        posterUrl: encodeURI("/images/mockups-3d/iphone-17pro.avif"),
        videoUrl: encodeURI("/videos/mockups-3d/iphone-17pro.mp4"),
    },
    {
        id: "iphone",
        title: "iPhone 15 Pro",
        accentColor: "#00A3FF",
        icon: "simple-icons:apple",
        modelUrl: "/models/iphone-15-pro-max.glb",
        posterUrl: encodeURI("/images/mockups-3d/iphone-15pro.avif"),
        videoUrl: encodeURI("/videos/mockups-3d/iphone-15pro.mp4"),
    },
    {
        id: "phone",
        title: "Phone",
        accentColor: "#ededed",
        icon: "lineicons:phone",
        modelUrl: "/models/phone-gltf.glb",
        posterUrl: encodeURI("/images/mockups-3d/phone.avif"),
        videoUrl: encodeURI("/videos/mockups-3d/phone.mp4"),
    },
    {
        id: "laptop",
        title: "macOS Laptop",
        accentColor: "#E0A830",
        icon: "ph:laptop-bold",
        modelUrl: "/models/mac-book.glb",
        posterUrl: encodeURI("/images/mockups-3d/macos-laptop.avif"),
        videoUrl: encodeURI("/videos/mockups-3d/macos-laptop.mp4"),
    },
    {
        id: "ipad_mini_6_2021",
        title: "iPad mini 6 (2021)",
        accentColor: "#a3b8cc",
        icon: "ph:tablet-bold",
        modelUrl: "/models/ipad_mini_6_2021.glb",
        posterUrl: encodeURI("/images/mockups-3d/ipad_mini_6_2021.avif"),
        videoUrl: encodeURI("/videos/mockups-3d/ipad_mini_6_2021.mp4"),
    },
] as const;