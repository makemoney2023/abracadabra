"use client";

import { useTranslations } from 'next-intl';
import { ELEMENT_ROW_HEIGHT } from '@/types/timeline.types';

interface LabelSidebarProps {
    audioLaneCount?: number;
    motionTracksCount?: number;
    elementLaneCount?: number;
    showMovementRow?: boolean;
}

export default function LabelSidebar({
    audioLaneCount = 0,
    motionTracksCount = 0,
    elementLaneCount = 0,
    showMovementRow = false,
}: LabelSidebarProps) {
    const t = useTranslations('labelSidebar');

    return (
        <div className="sticky left-0 w-14 shrink-0 border-r border-border flex flex-col bg-background z-30">
            <div className="h-5.5 border-b border-border" />

            <div className="h-14 flex-1 flex items-center px-3">
                <span className="text-[9px] uppercase font-semibold tracking-wider text-muted-foreground">
                    {t('video')}
                </span>
            </div>

            <div
                className="flex items-center px-3 border-t border-border"
                style={{ height: ELEMENT_ROW_HEIGHT }}
            >
                <span className="text-[9px] uppercase font-semibold tracking-wider text-muted-foreground">
                    {t('zoom')}
                </span>
            </div>

            {showMovementRow && (
                <div
                    className="flex items-center px-3 border-t border-dashed border-emerald-500/20 bg-emerald-500/5"
                    style={{ height: ELEMENT_ROW_HEIGHT }}
                >
                    <span className="text-[9px] uppercase font-semibold tracking-wider text-emerald-600/70 dark:text-emerald-400/70">
                        {t('movement')}
                    </span>
                </div>
            )}

            {elementLaneCount > 0 && (
                <div
                    className="flex items-center px-3 border-t border-border bg-muted/40"
                    style={{ height: elementLaneCount * ELEMENT_ROW_HEIGHT }}
                >
                    <span className="text-[9px] uppercase font-semibold tracking-wider text-muted-foreground">
                        {t('elements')}
                    </span>
                </div>
            )}

            {audioLaneCount > 0 && (
                <div
                    className="flex items-center px-3 border-t border-border bg-muted/40"
                    style={{ height: audioLaneCount * ELEMENT_ROW_HEIGHT }}
                >
                    <span className="text-[9px] uppercase font-semibold tracking-wider text-muted-foreground">
                        {t('audio')}
                    </span>
                </div>
            )}

            {motionTracksCount > 0 && (
                <div
                    className="flex items-center px-3 border-t border-border bg-muted/40"
                    style={{ height: ELEMENT_ROW_HEIGHT }}
                >
                    <span className="text-[9px] uppercase font-semibold tracking-wider text-muted-foreground">
                        {t('motion')}
                    </span>
                </div>
            )}
        </div>
    );
}