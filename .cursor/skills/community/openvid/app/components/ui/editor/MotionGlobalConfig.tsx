"use client";
import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { MOCKUP_MOTION_PRESETS, type MockupMotionPresetId, type MockupMotionMode, MockupMotionFragment, getMotionPresetMode } from "@/lib/mockup-motion";
import { MotionPresetIcon, MotionPresetIconStyles } from "../../../../components/ui/MotionPresetIcon";
import { Toggle } from "@/components/ui/toggle";

interface MotionGlobalConfigProps {
  fragments: MockupMotionFragment[];
  onAddOrReplacePreset: (presetId: MockupMotionPresetId) => void;
  hasMockup2D: boolean;
  hasMockup3D?: boolean;
  isGlobalMotionEnabled: boolean;
  onToggleGlobalMotion: (enabled: boolean) => void;
}

const CATEGORY_ORDER = ["Entrance", "Continue", "Exit"] as const;

export function MotionGlobalConfig({
  onAddOrReplacePreset,
  hasMockup2D,
  hasMockup3D = false,
  isGlobalMotionEnabled,
  onToggleGlobalMotion,
}: MotionGlobalConfigProps) {
  const t = useTranslations("motionMenu");

  // Derive which motion mode is active: 3D takes priority when a 3D mockup
  // is present, otherwise fall back to 2D. When neither is present we show
  // the empty state.
  const activeMode: MockupMotionMode | null = hasMockup3D
    ? "3d"
    : hasMockup2D
      ? "2d"
      : null;

  if (!activeMode) {
    return (
      <div className="p-4 flex flex-col gap-5 h-full relative">
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-foreground font-medium">
            <Icon icon="ph:film-strip-bold" width="20" aria-hidden="true" />
            <span>{t("title")}</span>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t("globalMotionLabel")}</span>
            <Toggle checked={isGlobalMotionEnabled} onChange={onToggleGlobalMotion} disabled={true} />
          </label>
        </div>
        <div className="group bg-muted/50 border border-dashed border-border squircle-element p-8 text-center transition-colors">
          <div className="w-12 h-12 rounded-full bg-muted border border-border flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform">
            <Icon icon="ph:frame-corners-bold" width="24" className="text-muted-foreground group-hover:text-foreground/80 transition-colors" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-foreground/80 mb-1">{t("empty2D.title")}</p>
          <p className="text-xs text-muted-foreground">{t("empty2D.description")}</p>
        </div>
      </div>
    );
  }

  const presetsForMode = MOCKUP_MOTION_PRESETS.filter((p) => p.mode === activeMode);

  return (
    <div className="p-4 flex flex-col gap-4 h-full relative min-h-0">
      <MotionPresetIconStyles />
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-foreground font-medium">
          <Icon icon="ph:film-strip-bold" width="20" aria-hidden="true" />
          <span>{t("title")}</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 bg-muted/60 px-1.5 py-0.5 rounded">
            {activeMode === "3d" ? "3D" : "2D"}
          </span>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{t("globalMotionLabel")}</span>
          <Toggle checked={isGlobalMotionEnabled} onChange={onToggleGlobalMotion} activeColor="bg-orange-600" />
        </label>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar -mx-1 px-1">
        <div className="flex flex-col gap-6">
          {CATEGORY_ORDER.map((category) => {
            const presets = presetsForMode.filter((p) => p.category === category);
            if (presets.length === 0) return null;
            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    {t(`categories.${category}`)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => onAddOrReplacePreset(preset.id)}
                      className="group flex flex-col gap-2 squircle-element-camera border border-border bg-card p-2 text-left transition-all duration-200 hover:scale-[1.015] hover:border-foreground/20 hover:bg-muted active:scale-[0.98]"
                    >
                      <div className="relative w-full aspect-[16/10] rounded-lg overflow-hidden">
                        <MotionPresetIcon presetId={preset.id} category={preset.category} active={false} fill forceAnimate={isGlobalMotionEnabled} />
                      </div>
                      <span className="text-[11px] leading-tight truncate text-muted-foreground transition-colors group-hover:text-foreground">
                        {t(`presets.${preset.id}`)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
