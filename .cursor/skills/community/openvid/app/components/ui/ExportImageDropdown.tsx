"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@iconify/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import type { ImageExportFormat } from "@/types/image-project.types";

interface ImageExportProgress {
    status: "idle" | "preparing" | "rendering" | "complete" | "error";
    progress: number;
    message: string;
}

interface ExportImageDropdownProps {
    onExport: (format: ImageExportFormat, quality: number, scale: number) => void;
    exportProgress: ImageExportProgress;
    hasTransparentBackground?: boolean;
    canvasWidth?: number;
    canvasHeight?: number;
}

interface FormatOption {
    format: ImageExportFormat;
    label: string;
    description: string;
    icon: string;
    supportsTransparency: boolean;
}

interface ExportPreset {
    scale: number;
    quality: number;
    label: string;
    description: string;
    icon: string;
    recommended?: boolean;
}

const FORMAT_OPTIONS: FormatOption[] = [
    {
        format: "png",
        label: "PNG",
        description: "Sin pérdida, soporta transparencia",
        icon: "mdi:file-png-box",
        supportsTransparency: true,
    },
    {
        format: "avif",
        label: "AVIF",
        description: "Mejor compresión moderna",
        icon: "mdi:image-multiple",
        supportsTransparency: false,
    },
    {
        format: "webp",
        label: "WebP",
        description: "Compresión eficiente",
        icon: "mdi:web",
        supportsTransparency: true,
    },
    {
        format: "jpeg",
        label: "JPEG",
        description: "Compatible universal",
        icon: "mdi:file-jpg-box",
        supportsTransparency: false,
    },
];

export function ExportImageDropdown({
    onExport,
    exportProgress,
    hasTransparentBackground,
    canvasWidth = 1920,
    canvasHeight = 1080,
}: ExportImageDropdownProps) {
    const t = useTranslations("editor.exportImage");
    const [isOpen, setIsOpen] = useState(false);
    const [selectedFormat, setSelectedFormat] = useState<ImageExportFormat>("png");

    const isExporting =
        exportProgress.status !== "idle" &&
        exportProgress.status !== "complete" &&
        exportProgress.status !== "error";

    const isTransparent = !!hasTransparentBackground;

    const qualityPresets = useMemo((): ExportPreset[] => {
        const isPng = selectedFormat === "png";
        const isLossy = selectedFormat === "jpeg" || selectedFormat === "webp" || selectedFormat === "avif";

        if (isPng) {
            return [
                {
                    scale: 4,
                    quality: 1,
                    label: "4K Ultra (4x)",
                    description: `${canvasWidth * 4} × ${canvasHeight * 4}`,
                    icon: "mdi:image-size-select-large",
                },
                {
                    scale: 2,
                    quality: 1,
                    label: "HD Retina (2x)",
                    description: `${canvasWidth * 2} × ${canvasHeight * 2}`,
                    icon: "mdi:image-multiple-outline",
                    recommended: true,
                },
                {
                    scale: 1,
                    quality: 1,
                    label: "Original (1x)",
                    description: `${canvasWidth} × ${canvasHeight}`,
                    icon: "mdi:image-outline",
                },
            ];
        }

        if (isLossy) {
            return [
                {
                    scale: 4,
                    quality: 0.95,
                    label: "4K Alta Calidad (4x)",
                    description: `${canvasWidth * 4} × ${canvasHeight * 4} · 95%`,
                    icon: "mdi:image-size-select-large",
                },
                {
                    scale: 2,
                    quality: 0.95,
                    label: "HD Alta Calidad (2x)",
                    description: `${canvasWidth * 2} × ${canvasHeight * 2} · 95%`,
                    icon: "mdi:image-multiple-outline",
                    recommended: true,
                },
                {
                    scale: 1,
                    quality: 0.95,
                    label: "Original Alta (1x)",
                    description: `${canvasWidth} × ${canvasHeight} · 95%`,
                    icon: "mdi:image-outline",
                },
                {
                    scale: 1,
                    quality: 0.8,
                    label: "Original Media (1x)",
                    description: `${canvasWidth} × ${canvasHeight} · 80%`,
                    icon: "mdi:image-outline",
                },
                {
                    scale: 1,
                    quality: 0.6,
                    label: "Original Comprimida (1x)",
                    description: `${canvasWidth} × ${canvasHeight} · 60%`,
                    icon: "mdi:image-outline",
                },
            ];
        }

        return [];
    }, [selectedFormat, canvasWidth, canvasHeight]);

    const handleExport = useCallback(
        (preset: ExportPreset) => {
            setIsOpen(false);
            onExport(selectedFormat, preset.quality, preset.scale);
        },
        [onExport, selectedFormat]
    );

    const showTransparencyWarning = isTransparent && selectedFormat === "jpeg";

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="primary"
                    className="px-3 py-2 text-sm gap-2 min-w-27.5 text-white"
                    size="sm"
                    disabled={isExporting}
                    aria-label={isExporting ? t("exporting") : t("button")}
                >
                    {isExporting ? (
                        <>
                            <Icon icon="svg-spinners:180-ring-with-bg" width="18" aria-hidden="true" />
                            <span className="truncate">
                                {t("exporting")}
                                {exportProgress.progress > 0 && (
                                    <span className="tabular-nums opacity-80"> {Math.round(exportProgress.progress)}%</span>
                                )}
                            </span>
                        </>
                    ) : (
                        <>
                            <Icon icon="icon-park-outline:export" width="18" aria-hidden="true" />
                            {t("button")}
                        </>
                    )}
                </Button>
            </PopoverTrigger>

            <PopoverContent
                align="end"
                className="w-80 bg-popover dark:bg-black border-border text-foreground shadow-2xl p-0 squircle-element-camera overflow-hidden z-999999"
            >
                <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-muted/50">
                    <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                        {t("title") || "Formato"}
                    </span>
                    {isTransparent && (
                        <div className="flex items-center gap-2 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 backdrop-blur-md">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400/90">
                                {t("transparent")}
                            </span>
                        </div>
                    )}
                </div>

                <div className="p-4 grid grid-cols-4 gap-3">
                    {FORMAT_OPTIONS.map((opt) => {
                        const isSelected = selectedFormat === opt.format;
                        const disabled = isTransparent && !opt.supportsTransparency;

                        return (
                            <button
                                key={opt.format}
                                onClick={() => !disabled && setSelectedFormat(opt.format)}
                                disabled={disabled}
                                className={`relative flex flex-col items-center gap-2 transition-all duration-300 group ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                                    }`}
                                aria-label={`${opt.label} format - ${opt.description}`}
                                aria-pressed={isSelected}
                            >
                                <div
                                    className={`relative size-12 squircle-element flex items-center justify-center transition-all duration-300 border overflow-hidden ${isSelected
                                        ? "border-transparent scale-105 text-white"
                                        : "border-border hover:border-foreground/30"
                                        }`}
                                    style={isSelected ? {
                                        background: "radial-gradient(circle at 50% 0%, #555555 0%, #121212 75%)",
                                        boxShadow: "inset 0 1.01rem 0.2rem -1rem #fff, 0 0 0 1px #fff4, 0 4px 4px 0 #0004, 0 0 0 1px #333",
                                    } : undefined}
                                >
                                    <Icon
                                        icon={opt.icon}
                                        width="22"
                                        className={`${isSelected ? "text-white" : "text-muted-foreground/60 group-hover:text-muted-foreground"}`}
                                        aria-hidden="true"
                                    />

                                    {isSelected && (
                                        <div className="absolute -top-3 -left-1 size-8 bg-white rounded-full blur-[5px] rotate-45 opacity-50 pointer-events-none" />
                                    )}
                                </div>

                                <span
                                    className={`text-[9px] font-bold tracking-tighter ${isSelected ? "text-foreground" : "text-muted-foreground"
                                        }`}
                                >
                                    {opt.label}
                                </span>
                            </button>

                        );
                    })}
                </div>

                <div className="px-2 pb-2">
                    <div className="bg-muted/50 squircle-element border border-border overflow-hidden max-h-100 overflow-y-auto custom-scrollbar">
                        {qualityPresets.map((preset, i) => (
                            <button
                                key={i}
                                onClick={() => handleExport(preset)}
                                className="w-full flex items-center justify-between p-4 hover:bg-muted transition-colors border-b border-border last:border-0 group"
                                aria-label={`Export ${preset.label} - ${preset.description}`}
                            >
                                <div className="flex flex-col items-start gap-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[13px] font-medium text-foreground/90 group-hover:text-foreground">
                                            {preset.label}
                                        </span>
                                        {preset.recommended && (
                                            <span className="border border-blue-500/30 text-blue-600 dark:text-blue-400 text-[9px] px-2 py-0.5 rounded-full font-bold tracking-   ">
                                                {t("recommended") || "Rec"}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[11px] font-mono text-muted-foreground/40">
                                        {preset.description}
                                    </span>
                                </div>

                            </button>
                        ))}
                    </div>
                </div>

                {showTransparencyWarning && (
                    <div className="p-3 bg-red-500/10 text-center">
                        <p className="text-[9px] uppercase tracking-widest text-red-600 dark:text-red-400 font-bold">
                            {t("noTransparency") || "Sin Transparencia"}
                        </p>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}