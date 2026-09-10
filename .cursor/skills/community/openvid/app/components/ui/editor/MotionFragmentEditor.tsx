"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { SliderControl } from "../../../../components/ui/SliderControl";
import { Toggle } from "@/components/ui/toggle";
import {
  MockupMotionFragment,
  DEFAULT_MOTION_CUSTOM_OFFSETS,
  type MotionCustomOffsets,
  MOTION_PRESET_3D_IDS,
  DEFAULT_3D_MOTION_CUSTOM_OFFSETS,
  type Mockup3DMotionCustomOffsets,
} from "@/lib/mockup-motion";
import {
  MotionPresetIconStyles,
} from "../../../../components/ui/MotionPresetIcon";
import { DirectionPad } from "@/components/ui/DirectionPad";
import { PositionPad } from "@/components/ui/PositionPad";
import { TooltipAction } from "@/components/ui/tooltip-action";
import { DetailPageHeader } from "@/components/ui/DetailHeaderMenu";

interface MotionFragmentEditorProps {
  fragment: MockupMotionFragment;
  isGlobalMotionEnabled: boolean;
  onUpdate: (updates: Partial<MockupMotionFragment>) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function MotionFragmentEditor({
  fragment,
  onUpdate,
  onDelete,
  onClose,
}: MotionFragmentEditorProps) {
  const t = useTranslations("motionMenu");

  // Detect whether this fragment belongs to a 3D preset. 3D presets use a
  // separate custom-offsets object (custom3D) that lacks the `blur` field
  // since motion blur is not applicable to real 3D geometry.
  const is3D = MOTION_PRESET_3D_IDS.has(fragment.presetId);

  const custom2D = fragment.custom ?? DEFAULT_MOTION_CUSTOM_OFFSETS;
  const custom3D = fragment.custom3D ?? DEFAULT_3D_MOTION_CUSTOM_OFFSETS;

  // Unified accessor so the JSX below doesn't need to branch at every
  // control. `blur` is always 0 in 3D mode.
  const custom = is3D
    ? { ...custom3D, blur: 0 }
    : custom2D;

  const updateCustom = (partial: Partial<MotionCustomOffsets>) => {
    if (is3D) {
      const { blur: _blur, ...rest } = partial;
      onUpdate({ custom3D: { ...custom3D, ...(rest as Partial<Mockup3DMotionCustomOffsets>) } });
    } else {
      onUpdate({ custom: { ...custom2D, ...partial } });
    }
  };

  const hasCustomChanges =
    custom.positionX !== 0 ||
    custom.positionY !== 0 ||
    custom.zoomMultiplier !== 1 ||
    custom.rotateX !== 0 ||
    custom.rotateY !== 0 ||
    custom.rotateZ !== 0 ||
    (!is3D && custom.blur !== 0) ||
    custom.reverse;

  const resetCustom = () => {
    if (is3D) {
      onUpdate({ custom3D: { ...DEFAULT_3D_MOTION_CUSTOM_OFFSETS } });
    } else {
      onUpdate({ custom: { ...DEFAULT_MOTION_CUSTOM_OFFSETS } });
    }
  };

  return (
    <div className="flex flex-col h-full text-foreground">
      <MotionPresetIconStyles />

      <div className="flex items-center gap-2 p-3 border-b border-border shrink-0">
        <DetailPageHeader label={t("title")} icon="ph:arrow-left-bold" onBack={onClose} />
        {is3D && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 bg-muted/60 px-1.5 py-0.5 rounded shrink-0">
            3D
          </span>
        )}
        <TooltipAction label={t("deleteTooltip")}>
          <button
            onClick={onDelete}
            className="ml-auto flex items-center gap-1.5 text-[11px] text-destructive/80 hover:text-destructive px-2 py-1 rounded-md transition-colors shrink-0"
          >
            <Icon icon="ph:trash-bold" width="12" />
            {t("actions.delete")}
          </button>
        </TooltipAction>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-5">
        <div className="flex flex-col gap-4">
          <SliderControl
            icon="mdi:tune-variant"
            label={t("controls.intensity")}
            value={fragment.intensity}
            min={0}
            max={100}
            onChange={(v: number) => onUpdate({ intensity: v })}
          />
          <SliderControl
            icon="mdi:speedometer"
            label={t("controls.speed")}
            value={fragment.speed}
            min={0}
            max={100}
            onChange={(v: number) => onUpdate({ speed: v })}
          />
        </div>

        <div className="space-y-3 p-3 bg-muted/40 border border-border squircle-element">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:tune" width="16" className="text-muted-foreground" />
            <div>
              <p className="text-xs font-medium text-foreground/90">{t("customize.title")}</p>
              <p className="text-[11px] text-muted-foreground">{t("customize.subtitle")}</p>
            </div>
          </div>

          <PositionPad
            x={custom.positionX}
            y={custom.positionY}
            onChange={(x, y) => updateCustom({ positionX: x, positionY: y })}
            scale={custom.zoomMultiplier}
            rotateZ={custom.rotateZ}
            blur={custom.blur}
            accentRgb="249,115,22"
            label={t("customize.positionLabel")}
            hint={t("customize.positionHint")}
          />
          <DirectionPad
            angleX={custom.rotateX}
            angleY={custom.rotateY}
            onChange={(rx, ry) => updateCustom({ rotateX: rx, rotateY: ry })}
            accentRgb="249,115,22"
            label={t("customize.tiltLabel")}
            hint={t("customize.tiltHint")}
            className="aspect-square max-w-[220px]"
          />
          <SliderControl
            icon="mdi:magnify"
            label={t("customize.zoomLabel")}
            value={Math.round(custom.zoomMultiplier * 100)}
            min={50}
            max={200}
            onChange={(v: number) => updateCustom({ zoomMultiplier: v / 100 })}
            suffix="%"
          />
          <SliderControl
            icon="mdi:axis-z-rotate-clockwise"
            label={t("customize.rotateZLabel")}
            value={custom.rotateZ}
            min={-45}
            max={45}
            onChange={(v: number) => updateCustom({ rotateZ: v })}
          />
          {!is3D && (
            <SliderControl
              icon="mdi:blur"
              label={t("customize.blurLabel")}
              value={custom.blur}
              min={0}
              max={20}
              onChange={(v: number) => updateCustom({ blur: v })}
            />
          )}
          <label className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted/40 border border-border">
            <span className="text-xs text-muted-foreground">{t("customize.reverseLabel")}</span>
            <Toggle
              checked={custom.reverse}
              onChange={(v: boolean) => updateCustom({ reverse: v })}
              activeColor="bg-orange-600"
            />
          </label>
          {hasCustomChanges && (
            <button
              onClick={resetCustom}
              className="self-start text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
            >
              {t("customize.resetButton")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
