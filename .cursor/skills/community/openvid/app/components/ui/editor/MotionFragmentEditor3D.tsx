"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { SliderControl } from "../../../../components/ui/SliderControl";
import { Toggle } from "@/components/ui/toggle";
import {
  MockupMotionFragment,
  DEFAULT_3D_MOTION_CUSTOM_OFFSETS,
  type Mockup3DMotionCustomOffsets,
} from "@/lib/mockup-motion";
import {
  MotionPresetIconStyles,
} from "../../../../components/ui/MotionPresetIcon";
import { PositionPad } from "@/components/ui/PositionPad";
import { TooltipAction } from "@/components/ui/tooltip-action";
import { DetailPageHeader } from "@/components/ui/DetailHeaderMenu";

interface MotionFragmentEditor3DProps {
  fragment: MockupMotionFragment;
  isGlobalMotionEnabled: boolean;
  onUpdate: (updates: Partial<MockupMotionFragment>) => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * Dedicated editor for 3D motion fragments.
 *
 * 3D motion offsets (Mockup3DMotionCustomOffsets) are applied additively on
 * top of the preset's base animation by apply3DMotionCustomOffsets() in
 * lib/mockup-motion-3d.ts:
 *
 *   scale = base.scale * custom.zoomMultiplier
 *   posX  = base.posX * sign + custom.positionX      (scene units)
 *   posY  = base.posY * sign + custom.positionY      (scene units)
 *   rotX  = base.rotX * sign + custom.rotateX * DEG  (degrees → radians)
 *   rotY  = base.rotY * sign + custom.rotateY * DEG  (degrees → radians)
 *   rotZ  = base.rotZ * sign + custom.rotateZ * DEG  (degrees → radians)
 *
 * Where sign = custom.reverse ? -1 : 1.
 *
 * The model is scaled at ~0.004 in the viewer, so a position offset of ~0.2
 * roughly equals one body width.
 *
 * Instead, the position offsets are controlled via a PositionPad (drag to set
 * X/Y simultaneously) and rotation/scale/reverse use dedicated sliders. This
 * avoids DirectionPad (CSS perspective preview that doesn't match real 3D
 * geometry) and the blur slider (motion blur on 3D geometry requires
 * post-processing).
 */
export function MotionFragmentEditor3D({
  fragment,
  onUpdate,
  onDelete,
  onClose,
}: MotionFragmentEditor3DProps) {
  const t = useTranslations("motionMenu");
  const custom = fragment.custom3D ?? DEFAULT_3D_MOTION_CUSTOM_OFFSETS;

  const updateCustom = (partial: Partial<Mockup3DMotionCustomOffsets>) => {
    onUpdate({ custom3D: { ...custom, ...partial } });
  };

  const hasCustomChanges =
    custom.positionX !== 0 ||
    custom.positionY !== 0 ||
    custom.zoomMultiplier !== 1 ||
    custom.rotateX !== 0 ||
    custom.rotateY !== 0 ||
    custom.rotateZ !== 0 ||
    custom.reverse;

  return (
    <div className="flex flex-col h-full text-foreground">
      <MotionPresetIconStyles />

      <div className="flex items-center gap-2 p-3 border-b border-border shrink-0">
        <DetailPageHeader label={t("title")} icon="ph:arrow-left-bold" onBack={onClose} />
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 bg-muted/60 px-1.5 py-0.5 rounded shrink-0">
          3D
        </span>
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
        {/* Preset intensity & speed */}
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

        {/* Rotation offsets (degrees, applied additively to base animation) */}
        <div className="space-y-3 p-3 bg-muted/40 border border-border squircle-element">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:rotate-3d-variant" width="16" className="text-muted-foreground" />
            <div>
              <p className="text-xs font-medium text-foreground/90">{t("customize3D.rotationTitle")}</p>
              <p className="text-[11px] text-muted-foreground">{t("customize3D.rotationSubtitle")}</p>
            </div>
          </div>

          <SliderControl
            icon="mdi:rotate-x"
            label={t("customize3D.rotateXLabel")}
            value={custom.rotateX}
            min={-180}
            max={180}
            onChange={(v: number) => updateCustom({ rotateX: v })}
            suffix="°"
          />
          <SliderControl
            icon="mdi:rotate-y"
            label={t("customize3D.rotateYLabel")}
            value={custom.rotateY}
            min={-180}
            max={180}
            onChange={(v: number) => updateCustom({ rotateY: v })}
            suffix="°"
          />
          <SliderControl
            icon="mdi:rotate-z"
            label={t("customize3D.rotateZLabel")}
            value={custom.rotateZ}
            min={-180}
            max={180}
            onChange={(v: number) => updateCustom({ rotateZ: v })}
            suffix="°"
          />
        </div>

        {/* Position offsets (scene units, applied additively to base animation) */}
        <div className="space-y-3 p-3 bg-muted/40 border border-border squircle-element">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:axis-arrow" width="16" className="text-muted-foreground" />
            <div>
              <p className="text-xs font-medium text-foreground/90">{t("customize3D.positionTitle")}</p>
              <p className="text-[11px] text-muted-foreground">{t("customize3D.positionSubtitle")}</p>
            </div>
          </div>

          <PositionPad
            x={Math.round(custom.positionX * 100)}
            y={Math.round(custom.positionY * 100)}
            onChange={(x, y) => updateCustom({ positionX: x / 100, positionY: y / 100 })}
            range={30}
            accentRgb="249,115,22"
            label={t("customize3D.positionLabel")}
            hint={t("customize3D.positionHint")}
          />
        </div>

        {/* Scale multiplier (uniform, applied multiplicatively) */}
        <div className="space-y-3 p-3 bg-muted/40 border border-border squircle-element">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:resize" width="16" className="text-muted-foreground" />
            <div>
              <p className="text-xs font-medium text-foreground/90">{t("customize3D.scaleTitle")}</p>
              <p className="text-[11px] text-muted-foreground">{t("customize3D.scaleSubtitle")}</p>
            </div>
          </div>

          <SliderControl
            icon="mdi:magnify"
            label={t("customize3D.scaleLabel")}
            value={Math.round(custom.zoomMultiplier * 100)}
            min={50}
            max={200}
            onChange={(v: number) => updateCustom({ zoomMultiplier: v / 100 })}
            suffix="%"
          />
        </div>

        {/* Reverse direction toggle */}
        <label className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted/40 border border-border">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Icon icon="mdi:flip-horizontal" width="14" />
            {t("customize.reverseLabel")}
          </span>
          <Toggle
            checked={custom.reverse}
            onChange={(v: boolean) => updateCustom({ reverse: v })}
            activeColor="bg-orange-600"
          />
        </label>

        {hasCustomChanges && (
          <button
            onClick={() => onUpdate({ custom3D: { ...DEFAULT_3D_MOTION_CUSTOM_OFFSETS } })}
            className="self-start text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          >
            {t("customize.resetButton")}
          </button>
        )}
      </div>
    </div>
  );
}
