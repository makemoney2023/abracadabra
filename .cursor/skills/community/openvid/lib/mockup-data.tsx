import { Mockup, DEFAULT_MOCKUP_FEATURES } from "@/types/mockup.types";
import { BraveGlassPreview, BravePreview, BrowserTabGlassPreview, ChromeGlassPreview, ChromePreview, GlassCurvePreview, GlassFullPreview, GlassUIContainerPreview, HardShellPreview, IphoneSlimPreview, MacBookPreview, MacosContainerGlassPreview, MacosDarkPreview, MacosGhostGlassPreview, MacosGhostIdePreview, MacosGhostPreview, MacosGlassPreview, MacosPreview, NonePreview, OutlinePreview, S24UltraPreview, VSCodePreview } from "./mockup-previews";

export const MOCKUPS: Mockup[] = [
    {
        id: "none",
        name: "None",
        category: "browser",
        features: {
            ...DEFAULT_MOCKUP_FEATURES,
        },
        preview: (
            <NonePreview />
        ),
    },
    {
        id: "macos",
        name: "Macos",
        category: "browser",
        features: {
            hasDarkMode: true,
            hasFrameColor: true,
            hasUrl: true,
            hasHeaderScale: true,
            hasCornerRadius: true,
            hasHeaderOpacity: true,
        },
        defaultConfig: {
            darkMode: false,
            frameColor: "#f6f6f6",
            url: "https://openvid.dev",
            headerScale: 60,
            cornerRadius: 12,
        },
        preview: (
            <MacosPreview />
        ),
    },
    {
        id: "macos-glass",
        name: "Macos Glass",
        category: "browser",
        features: {
            hasDarkMode: true,
            hasFrameColor: true,
            hasUrl: true,
            hasHeaderScale: true,
            hasCornerRadius: true,
            hasHeaderOpacity: true,
        },
        defaultConfig: {
            darkMode: false,
            frameColor: "#f6f6f6",
            url: "https://openvid.dev",
            headerScale: 60,
            cornerRadius: 12,
        },
        preview: (
            <MacosGlassPreview />
        ),
    },
    {
        id: "outline",
        name: "Outline",
        category: "browser",
        features: {
            hasDarkMode: true,
            hasFrameColor: true,
            hasUrl: false,
            hasHeaderScale: false,
            hasCornerRadius: true,
            hasHeaderOpacity: false,
        },
        defaultConfig: {
            darkMode: false,
            cornerRadius: 12,
        },
        preview: (
            <OutlinePreview />
        ),
    },
    {
        id: "glass-ui-container",
        name: "Glass UI Container",
        category: "browser",
        features: {
            ...DEFAULT_MOCKUP_FEATURES,
            hasCornerRadius: true,
        },
        defaultConfig: {
            cornerRadius: 12,
        },
        preview: (
            <GlassUIContainerPreview />
        ),
    },
    {
        id: "macos-ghost",
        name: "Macos Ghost",
        category: "browser",
        features: {
            hasDarkMode: true,
            hasFrameColor: true,
            hasUrl: true,
            hasHeaderScale: true,
            hasCornerRadius: true,
            hasHeaderOpacity: true,
        },
        defaultConfig: {
            darkMode: false,
            frameColor: "#f6f6f6",
            url: "https://openvid.dev",
            headerScale: 60,
            cornerRadius: 12,
        },
        preview: (
            <MacosGhostPreview />
        ),
    },
    {
        id: "macos-ghost-glass",
        name: "Macos Ghost Glass",
        category: "browser",
        features: {
            hasDarkMode: true,
            hasFrameColor: true,
            hasUrl: true,
            hasHeaderScale: true,
            hasCornerRadius: true,
            hasHeaderOpacity: true,
        },
        defaultConfig: {
            darkMode: false,
            frameColor: "#f6f6f6",
            url: "https://openvid.dev",
            headerScale: 60,
            cornerRadius: 12,
        },
        preview: (
            <MacosGhostGlassPreview />
        ),
    },
    {
        id: "macos-container-glass",
        name: "Macos Container Glass",
        category: "browser",
        features: {
            ...DEFAULT_MOCKUP_FEATURES,
            hasCornerRadius: true,
            hasHeaderScale: true,
        },
        defaultConfig: {
            cornerRadius: 12,
            headerScale: 70,
        },
        preview: (
            <MacosContainerGlassPreview />
        ),
    },
    {
        id: "brave",
        name: "Brave",
        category: "browser",
        features: {
            hasDarkMode: true,
            hasFrameColor: true,
            hasUrl: true,
            hasHeaderScale: true,
            hasCornerRadius: true,
            hasHeaderOpacity: true,
        },
        defaultConfig: {
            darkMode: false,
            frameColor: "#f6f6f6",
            url: "https://openvid.dev",
            headerScale: 60,
            cornerRadius: 12,
        },
        preview: (
            <BravePreview />
        ),
    },
    {
        id: "brave-glass",
        name: "Brave Glass",
        category: "browser",
        features: {
            hasDarkMode: true,
            hasFrameColor: true,
            hasUrl: true,
            hasHeaderScale: true,
            hasCornerRadius: true,
            hasHeaderOpacity: true,
        },
        defaultConfig: {
            darkMode: false,
            frameColor: "#f6f6f6",
            url: "https://openvid.dev",
            headerScale: 60,
            cornerRadius: 12,
        },
        preview: (
            <BraveGlassPreview />
        ),
    },
    {
        id: "browser-tab-glass",
        name: "Browser Tab Glass",
        category: "browser",
        features: {
            hasDarkMode: false,
            hasFrameColor: false,
            hasUrl: true,
            hasHeaderScale: true,
            hasCornerRadius: true,
            hasHeaderOpacity: false,
        },
        defaultConfig: {
            darkMode: false,
            url: "https://openvid.dev",
            headerScale: 60,
            cornerRadius: 12,
        },
        preview: (
            <BrowserTabGlassPreview />
        ),
    },
    {
        id: "chrome",
        name: "Chrome",
        category: "browser",
        features: {
            hasDarkMode: true,
            hasFrameColor: true,
            hasUrl: true,
            hasHeaderScale: true,
            hasCornerRadius: true,
            hasHeaderOpacity: true,
        },
        defaultConfig: {
            darkMode: false,
            frameColor: "#f6f6f6",
            url: "https://openvid.dev",
            headerScale: 60,
            cornerRadius: 12,
        },
        preview: (
            <ChromePreview />
        ),
    },
    {
        id: "chrome-glass",
        name: "Chrome Glass",
        category: "browser",
        features: {
            hasDarkMode: true,
            hasFrameColor: true,
            hasUrl: true,
            hasHeaderScale: true,
            hasCornerRadius: true,
            hasHeaderOpacity: true,
        },
        defaultConfig: {
            darkMode: false,
            frameColor: "#f6f6f6",
            url: "https://openvid.dev",
            headerScale: 60,
            cornerRadius: 12,
        },
        preview: (
            <ChromeGlassPreview />
        ),
    },

    // device Mockups
    {
        id: "iphone-slim",
        name: "iPhone Slim",
        category: "device",
        features: {
            hasDarkMode: true,
            hasFrameColor: true,
            hasUrl: false,
            hasHeaderScale: true,
            hasCornerRadius: true,
            hasHeaderOpacity: true,
        },
        defaultConfig: {
            darkMode: true,
            frameColor: "#262626",
            headerScale: 60,
            cornerRadius: 28,
        },
        preview: (
            <IphoneSlimPreview />
        ),
    },
    {
        id: "glass-curve",
        name: "Glass Curve",
        category: "device",
        features: {
            hasDarkMode: true,
            hasFrameColor: false,
            hasUrl: false,
            hasHeaderScale: true,
            hasCornerRadius: true,
            hasHeaderOpacity: true,
        },
        defaultConfig: {
            darkMode: false,
            headerScale: 60,
            cornerRadius: 28,
            headerOpacity: 30,
        },
        preview: (
            <GlassCurvePreview />
        ),
    },
    {
        id: "glass-full",
        name: "Glass Full",
        category: "device",
        features: {
            hasDarkMode: true,
            hasFrameColor: false,
            hasUrl: false,
            hasHeaderScale: true,
            hasCornerRadius: true,
            hasHeaderOpacity: true,
        },
        defaultConfig: {
            darkMode: false,
            headerScale: 60,
            cornerRadius: 28,
            headerOpacity: 30,
        },
        preview: (
            <GlassFullPreview />
        ),
    },
    {
        id: "hard-shell",
        name: "Hard Shell",
        category: "device",
        features: {
            hasDarkMode: true,
            hasFrameColor: false,
            hasUrl: false,
            hasHeaderScale: true,
            hasCornerRadius: true,
            hasHeaderOpacity: false,
        },
        defaultConfig: {
            darkMode: false,
            headerScale: 60,
            cornerRadius: 28,
        },
        preview: (
            <HardShellPreview />
        ),
    },
    {
        id: "s24-ultra",
        name: "S24 Ultra",
        category: "device",
        features: {
            hasDarkMode: true,
            hasFrameColor: true,
            hasUrl: false,
            hasHeaderScale: true,
            hasCornerRadius: true,
            hasHeaderOpacity: false,
        },
        defaultConfig: {
            darkMode: true,
            frameColor: "#262626",
            headerScale: 60,
            cornerRadius: 28,
        },
        preview: (
            <S24UltraPreview />
        ),
    },
    {
        id: "macbook-photo",
        name: "MacBook",
        category: "device",
        features: {
            ...DEFAULT_MOCKUP_FEATURES,
        },
        defaultConfig: {},
        preview: (<MacBookPreview />),
    },

    // IDE Mockups
    {
        id: "vscode",
        name: "VS CODE",
        category: "ide",
        features: {
            hasDarkMode: true,
            hasFrameColor: true,
            hasUrl: true,
            hasHeaderScale: true,
            hasCornerRadius: true,
            hasHeaderOpacity: true,
        },
        defaultConfig: {
            darkMode: true,
            frameColor: "#1e1e1e",
            url: "https://openvid.dev",
            headerScale: 60,
            cornerRadius: 8,
        },
        preview: (
            <VSCodePreview />
        ),
    },
    {
        id: "macos-dark-ide",
        name: "VSCODE macos",
        category: "ide",
        features: {
            hasDarkMode: true,
            hasFrameColor: true,
            hasUrl: true,
            hasHeaderScale: true,
            hasCornerRadius: true,
            hasHeaderOpacity: true,
        },
        defaultConfig: {
            darkMode: true,
            frameColor: "#1e1e1e",
            url: "https://openvid.dev",
            headerScale: 60,
            cornerRadius: 8,
        },
        preview: (
            <MacosDarkPreview />
        ),
    },
    {
        id: "macos-ghost-ide",
        name: "Macos Ghost",
        category: "ide",
        features: {
            hasDarkMode: true,
            hasFrameColor: true,
            hasUrl: true,
            hasHeaderScale: true,
            hasCornerRadius: true,
            hasHeaderOpacity: true,
        },
        defaultConfig: {
            darkMode: true,
            frameColor: "#1e1e1e",
            url: "https://openvid.dev",
            headerScale: 60,
            cornerRadius: 8,
        },
        preview: (
            <MacosGhostIdePreview />
        ),
    },
];

export const MOCKUP_CATEGORIES = [
    { id: "all" as const, label: "Todos", icon: "ph:grid-four-bold" },
    { id: "browser" as const, label: "Browser", icon: "hugeicons:ai-browser", bgUrl: "/images/mockups/bg-browser.avif" },
    { id: "device" as const, label: "device", icon: "ph:device-device-bold", bgUrl: "/images/mockups/bg-device.avif" },
    { id: "ide" as const, label: "IDE", icon: "ph:code-bold", bgUrl: "/images/mockups/bg-ide.avif" },
];
