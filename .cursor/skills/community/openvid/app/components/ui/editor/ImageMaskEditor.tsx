"use client";

import { Icon } from "@iconify/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SliderControl } from "../../../../components/ui/SliderControl";
import {
    Popover,
    PopoverTrigger,
    PopoverContent,
    PopoverHeader,
    PopoverTitle,
} from "@/components/ui/popover";
import type { ImageMaskConfig } from "@/types/photo.types";
import { ImageMaskEditorProps, MaskPreset, MASK_PRESETS } from "@/types/ImageMask.types";
import { TooltipAction } from "@/components/ui/tooltip-action";
import { useTranslations } from "next-intl";
import { GetMediaMaskStyles } from "@/lib/media-mask.utils";

export function ImageMaskEditor({
    maskConfig,
    onMaskConfigChange,
    canvasImageUrl
}: ImageMaskEditorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<"presets" | "custom">("presets");

    const t = useTranslations("editor.imageMask");

    const isPresetActive = (preset: MaskPreset) => {
        if (preset.id === "none") {
            return !maskConfig.enabled || (!maskConfig.top && !maskConfig.bottom && !maskConfig.left && !maskConfig.right && !maskConfig.angle);
        }

        if (!maskConfig.enabled) return false;

        const isEqual = (a: unknown, b: unknown) => JSON.stringify(a || null) === JSON.stringify(b || null);

        return (
            isEqual(maskConfig.top, preset.config.top) &&
            isEqual(maskConfig.bottom, preset.config.bottom) &&
            isEqual(maskConfig.left, preset.config.left) &&
            isEqual(maskConfig.right, preset.config.right) &&
            maskConfig.angle === preset.config.angle
        );
    };

    const handlePresetClick = (preset: MaskPreset) => {
        if (preset.id === "none") {
            onMaskConfigChange({ enabled: false });
            return;
        }

        onMaskConfigChange({
            enabled: preset.config.enabled ?? true,
            top: undefined,
            bottom: undefined,
            left: undefined,
            right: undefined,
            angle: undefined,
            angleFrom: undefined,
            angleTo: undefined,
            ...preset.config,
        });
    };

    const getPreviewMaskStyles = (presetConfig: Partial<ImageMaskConfig>) => {
        if (!presetConfig.enabled) return {};
        return GetMediaMaskStyles({
            enabled: true,
            top: presetConfig.top,
            bottom: presetConfig.bottom,
            left: presetConfig.left,
            right: presetConfig.right,
            angle: presetConfig.angle,
            angleFrom: presetConfig.angleFrom,
            angleTo: presetConfig.angleTo,
        });
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <TooltipAction label={t("tooltip")}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className={`gap-2 text-xs transition-all duration-200 ${maskConfig.enabled
                            ? "bg-gradient-radial-primary text-cyan-600 dark:text-cyan-500 border border-cyan-600/50! dark:border-cyan-500/50!"
                            : ""
                            }`}
                        size="sm"
                    >
                        <Icon icon="material-symbols:gradient-outline" width="16" />
                        {t("trigger")}
                        <Icon icon="lucide:chevron-down" width="14" className="ml-auto opacity-50 shrink-0" />
                    </Button>
                </PopoverTrigger>
            </TooltipAction>

            <PopoverContent align="end" className="w-100 bg-popover dark:bg-black border-border shadow-2xl p-0 squircle-element-camera overflow-hidden">
                <div className="flex flex-col">
                    <PopoverHeader className="px-4 py-3 border-b border-border bg-muted/40">
                        <div className="flex items-center justify-between">
                            <PopoverTitle className="text-xs font-semibold text-popover-foreground/90 tracking-wide uppercase flex items-center gap-2">
                                <Icon icon="material-symbols:gradient-outline" width="14" className="text-blue-600 dark:text-blue-400" aria-hidden="true" />
                                {t("title")}
                            </PopoverTitle>
                        </div>
                    </PopoverHeader>

                    <div className="flex border-b border-border bg-muted/40">
                        <button
                            onClick={() => setActiveTab("presets")}
                            className={`flex-1 px-4 py-2.5 text-xs font-medium transition-all ${activeTab === "presets"
                                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-500 bg-blue-500/5"
                                : "text-muted-foreground hover:text-popover-foreground hover:bg-muted"
                                }`}
                        >
                            <Icon icon="mdi:palette-outline" width="14" className="inline mr-1.5" />
                            {t("tabs.presets")}
                        </button>
                        <button
                            onClick={() => setActiveTab("custom")}
                            className={`flex-1 px-4 py-2.5 text-xs font-medium transition-all ${activeTab === "custom"
                                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-500 bg-blue-500/5"
                                : "text-muted-foreground hover:text-popover-foreground hover:bg-muted"
                                }`}
                        >
                            <Icon icon="mdi:tune" width="14" className="inline mr-1.5" />
                            {t("tabs.custom")}
                        </button>
                    </div>

                    <div className="p-4 max-h-96 overflow-y-auto custom-scrollbar">
                        {activeTab === "presets" ? (
                            <div className="grid grid-cols-2 gap-3 w-full">
                                {MASK_PRESETS.map((preset) => {
                                    const active = isPresetActive(preset);
                                    const previewStyles = getPreviewMaskStyles(preset.config);

                                    return (
                                        <button
                                            key={preset.id}
                                            onClick={() => handlePresetClick(preset)}
                                            className={`group relative flex flex-col squircle-element border transition-all overflow-hidden ${active
                                                ? "border-blue-500 bg-blue-500/10"
                                                : "border-border hover:border-foreground/30 bg-muted/40 hover:bg-muted"
                                                }`}
                                        >
                                            <div className="relative w-full aspect-video bg-zinc-900">
                                                <div className="absolute inset-0 flex items-center justify-center p-3 bg-zinc-950 overflow-hidden">
                                                    <div className="absolute top-0 inset-x-0 h-40 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.05)_0%,transparent_75%)] pointer-events-none" />
                                                    <div
                                                        className="w-full h-full squircle-element bg-[#EAEAEA]"
                                                        style={previewStyles}
                                                    />
                                                </div>

                                                {!canvasImageUrl && (
                                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                        <Icon
                                                            icon={preset.icon}
                                                            width="28"
                                                            className={`transition-colors ${active ? "text-blue-400" : "text-white/70 group-hover:text-blue-400"}`}
                                                        />
                                                    </div>
                                                )}

                                                <div className="absolute bottom-1.5 left-1.5 z-10 bg-black/70 backdrop-blur-md px-1.5 py-0.5 rounded border border-white/5 pointer-events-none max-w-[85%]">
                                                    <span className={`text-[11px] font-medium tracking-wide block truncate transition-colors ${active ? "text-blue-400" : "text-white/85"}`}>
                                                        {t(`presets.${preset.id}`)}
                                                    </span>
                                                </div>

                                                {active && (
                                                    <div className="absolute top-2 right-2 z-30 size-4 rounded-full bg-cyan-500 flex items-center justify-center shadow-xl">
                                                        <Icon icon="mdi:check" width="10" className="text-white" />
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-medium text-muted-foreground">{t("controls.top")}</label>
                                        <button
                                            onClick={() => onMaskConfigChange({
                                                ...maskConfig,
                                                top: maskConfig.top ? undefined : { from: 0, to: 30 },
                                            })}
                                            className="text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
                                        >
                                            {maskConfig.top ? t("controls.remove") : t("controls.add")}
                                        </button>
                                    </div>
                                    {maskConfig.top && (
                                        <>
                                            <SliderControl
                                                label={t("controls.from")}
                                                value={maskConfig.top.from}
                                                onChange={(value) => onMaskConfigChange({
                                                    ...maskConfig,
                                                    top: { ...maskConfig.top!, from: value },
                                                })}
                                                min={0}
                                                max={100}
                                                step={1}
                                                suffix="%"
                                            />
                                            <SliderControl
                                                label={t("controls.to")}
                                                value={maskConfig.top.to ?? 100}
                                                onChange={(value) => onMaskConfigChange({
                                                    ...maskConfig,
                                                    top: { ...maskConfig.top!, to: value },
                                                })}
                                                min={0}
                                                max={100}
                                                step={1}
                                                suffix="%"
                                            />
                                        </>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <hr className="border-border" />
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-medium text-muted-foreground">{t("controls.bottom")}</label>
                                        <button
                                            onClick={() => onMaskConfigChange({
                                                ...maskConfig,
                                                bottom: maskConfig.bottom ? undefined : { from: 0, to: 30 },
                                            })}
                                            className="text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
                                        >
                                            {maskConfig.bottom ? t("controls.remove") : t("controls.add")}
                                        </button>
                                    </div>
                                    {maskConfig.bottom && (
                                        <>
                                            <SliderControl
                                                label={t("controls.from")}
                                                value={maskConfig.bottom.from}
                                                onChange={(value) => onMaskConfigChange({
                                                    ...maskConfig,
                                                    bottom: { ...maskConfig.bottom!, from: value },
                                                })}
                                                min={0}
                                                max={100}
                                                step={1}
                                                suffix="%"
                                            />
                                            <SliderControl
                                                label={t("controls.to")}
                                                value={maskConfig.bottom.to ?? 100}
                                                onChange={(value) => onMaskConfigChange({
                                                    ...maskConfig,
                                                    bottom: { ...maskConfig.bottom!, to: value },
                                                })}
                                                min={0}
                                                max={100}
                                                step={1}
                                                suffix="%"
                                            />
                                        </>
                                    )}
                                </div>
                                <hr className="border-border" />
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-medium text-muted-foreground">{t("controls.left")}</label>
                                            <button
                                                onClick={() => onMaskConfigChange({
                                                    ...maskConfig,
                                                    left: maskConfig.left ? undefined : { from: 0, to: 20 },
                                                })}
                                                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
                                            >
                                                {maskConfig.left ? "x" : "+"}
                                            </button>
                                        </div>
                                        {maskConfig.left && (
                                            <SliderControl
                                                label={t("controls.from")}
                                                value={maskConfig.left.from}
                                                onChange={(value) => onMaskConfigChange({
                                                    ...maskConfig,
                                                    left: { ...maskConfig.left!, from: value },
                                                })}
                                                min={0}
                                                max={100}
                                                step={1}
                                                suffix="%"
                                            />
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-medium text-muted-foreground">{t("controls.right")}</label>
                                            <button
                                                onClick={() => onMaskConfigChange({
                                                    ...maskConfig,
                                                    right: maskConfig.right ? undefined : { from: 0, to: 20 },
                                                })}
                                                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
                                            >
                                                {maskConfig.right ? "x" : "+"}
                                            </button>
                                        </div>
                                        {maskConfig.right && (
                                            <SliderControl
                                                label={t("controls.from")}
                                                value={maskConfig.right.from}
                                                onChange={(value) => onMaskConfigChange({
                                                    ...maskConfig,
                                                    right: { ...maskConfig.right!, from: value },
                                                })}
                                                min={0}
                                                max={100}
                                                step={1}
                                                suffix="%"
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}