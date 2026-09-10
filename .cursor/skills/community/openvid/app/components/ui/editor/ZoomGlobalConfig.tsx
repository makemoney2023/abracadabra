"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ZoomFragment } from "@/types/zoom.types";
import { formatZoomTime, zoomLevelToFactor } from "@/types/zoom.types";

interface ZoomGlobalConfigProps {
    fragments: ZoomFragment[];
    onSelectFragment: (fragmentId: string) => void;
    onAddFragment: () => void;
}

export function ZoomGlobalConfig({
    fragments,
    onSelectFragment,
    onAddFragment,
}: ZoomGlobalConfigProps) {
    const t = useTranslations("zoomGlobalConfig");

    return (
        <div className="p-4 flex flex-col gap-6">
            <div className="flex items-center">
                <div className="flex items-center gap-2 text-foreground font-medium">
                    <Icon icon="iconamoon:zoom-in-bold" width="20" aria-hidden="true" />
                    <span>{t("title")}</span>
                </div>
            </div>

            {fragments.length > 0 && (
                <div className="space-y-2">
                    <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
                        {t("fragments.title", { count: fragments.length })}
                    </div>
                    <div
                        className="space-y-1.5"
                        role="list"
                        aria-label={t("fragments.title", { count: fragments.length })}
                    >
                        {fragments.map((fragment, index) => (
                            <button
                                key={fragment.id}
                                onClick={() => onSelectFragment(fragment.id)}
                                className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-muted/50 border border-border hover:border-blue-500/30 hover:bg-blue-500/5 transition-all group"
                                role="listitem"
                                aria-label={`${t("fragments.label", { index: index + 1 })}, ${formatZoomTime(
                                    fragment.startTime
                                )} to ${formatZoomTime(fragment.endTime)}, ${zoomLevelToFactor(
                                    fragment.zoomLevel
                                ).toFixed(1)}× zoom`}
                            >
                                <div className="size-8 rounded-md bg-blue-500/20 flex items-center justify-center">
                                    <Icon
                                        icon="iconamoon:zoom-in-bold"
                                        width="14"
                                        className="text-blue-600 dark:text-blue-400"
                                        aria-hidden="true"
                                    />
                                </div>
                                <div className="flex flex-col items-start flex-1 min-w-0">
                                    <span className="text-xs text-foreground/90 font-medium">
                                        {t("fragments.label", { index: index + 1 })}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground font-mono">
                                        {formatZoomTime(fragment.startTime)} - {formatZoomTime(fragment.endTime)}
                                    </span>
                                </div>
                                <div className="text-[11px] text-muted-foreground/80 font-mono">
                                    {zoomLevelToFactor(fragment.zoomLevel).toFixed(1)}×
                                </div>
                                <Icon
                                    icon="ph:caret-right"
                                    width="14"
                                    className="text-muted-foreground/50 group-hover:text-muted-foreground"
                                    aria-hidden="true"
                                />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <Button
                variant="outline"
                className="w-full text-xs"
                onClick={onAddFragment}
                aria-label={t("fragments.add")}
            >
                <Icon icon="ph:plus-bold" width="14" aria-hidden="true" />
                {t("fragments.add")}
            </Button>

            <div className="text-[11px] text-muted-foreground space-y-1 pt-2 border-t border-border">
                <div className="flex items-center gap-2">
                    <kbd className="px-1.5 py-0.5 bg-muted rounded font-mono">{t("shortcuts.keys.delete")}</kbd>
                    <span>{t("shortcuts.delete")}</span>
                </div>
                <div className="flex items-center gap-2">
                    <kbd className="px-1.5 py-0.5 bg-muted rounded font-mono">{t("shortcuts.keys.esc")}</kbd>
                    <span>{t("shortcuts.esc")}</span>
                </div>
                <div className="flex items-center gap-2">
                    <kbd className="px-1.5 py-0.5 bg-muted rounded font-mono">{t("shortcuts.keys.click")}</kbd>
                    <span>{t("shortcuts.clickTrack")}</span>
                </div>
            </div>
        </div>
    );
}