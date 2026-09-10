import { ImageMaskConfig } from "./photo.types";

export interface ImageMaskEditorProps {
    maskConfig: ImageMaskConfig;
    onMaskConfigChange: (config: ImageMaskConfig) => void;
    canvasImageUrl?: string | null;
}

export interface MaskPreset {
    id: string;
    label: string;
    icon: string;
    config: Partial<ImageMaskConfig>;
}

export const MASK_PRESETS: MaskPreset[] = [
    {
        id: "none",
        label: "Sin máscara",
        icon: "mdi:image-outline",
        config: { enabled: false },
    },
    {
        id: "fade-top",
        label: "Fade Top",
        icon: "mdi:arrow-down-thin",
        config: {
            enabled: true,
            top: { from: 0, to: 30 },
        },
    },
    {
        id: "fade-bottom",
        label: "Fade Bottom",
        icon: "mdi:arrow-up-thin",
        config: {
            enabled: true,
            bottom: { from: 0, to: 30 },
        },
    },
    {
        id: "fade-sides",
        label: "Fade Sides",
        icon: "mdi:arrow-expand-horizontal",
        config: {
            enabled: true,
            left: { from: 0, to: 20 },
            right: { from: 0, to: 20 },
        },
    },
    {
        id: "vignette",
        label: "Vignette",
        icon: "mdi:circle-outline",
        config: {
            enabled: true,
            top: { from: 0, to: 25 },
            bottom: { from: 0, to: 25 },
            left: { from: 0, to: 25 },
            right: { from: 0, to: 25 },
        },
    },
    {
        id: "angle-45",
        label: "Diagonal 45°",
        icon: "mdi:slash-forward",
        config: {
            enabled: true,
            angle: 45,
            angleFrom: 60,
            angleTo: 90,
        },
    },
];