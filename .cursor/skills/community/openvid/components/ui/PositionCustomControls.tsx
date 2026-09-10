"use client";

import { Icon } from "@iconify/react";
import { SliderControl } from "./SliderControl";

export interface PositionCustomControlsLabels {
  perspective: string;
  scale: string;
  rotationXY: string;
  rotationZ: string;
  vertical: string;
  reset: string;
}

export interface PositionCustomControlsProps {
  scale?: number;
  onScaleChange?: (v: number) => void;
  scaleMin?: number;
  scaleMax?: number;
  rotateX: number;
  rotateY: number;
  onRotationXYChange: (rotateX: number, rotateY: number) => void;
  rotateZ: number;
  onRotateZChange: (v: number) => void;
  perspective?: number;
  onPerspectiveChange?: (v: number) => void;
  verticalValue?: number;
  verticalMin?: number;
  verticalMax?: number;
  onVerticalChange?: (v: number) => void;
  onReset?: () => void;
  labels: PositionCustomControlsLabels;
}

export function PositionCustomControls({
  scale,
  onScaleChange,
  scaleMin = 50,
  scaleMax = 150,
  rotateX,
  rotateY,
  onRotationXYChange,
  rotateZ,
  onRotateZChange,
  perspective,
  onPerspectiveChange,
  verticalValue,
  verticalMin = -10,
  verticalMax = 100,
  onVerticalChange,
  onReset,
  labels,
}: PositionCustomControlsProps) {
  return (
    <div className="space-y-4">
      {onPerspectiveChange && (
        <SliderControl
          icon="mdi:cube-outline"
          label={labels.perspective}
          value={perspective ?? 600}
          min={200}
          max={1000}
          step={50}
          onChange={onPerspectiveChange}
          suffix="px"
        />
      )}

      {onScaleChange && (
        <SliderControl
          icon="mdi:resize"
          label={labels.scale}
          value={Math.round((scale ?? 1) * 100)}
          min={scaleMin}
          max={scaleMax}
          step={5}
          onChange={(value) => onScaleChange(value / 100)}
          suffix="%"
        />
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Icon icon="mdi:rotate-3d-variant" width={12} />
          <span>{labels.rotationXY}</span>
        </div>
        <div
          className="relative w-full aspect-square bg-muted/30 rounded-lg border border-border cursor-crosshair overflow-hidden hover:bg-muted/50 transition-colors"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
            const rY = Math.round(-x * 45);
            const rX = Math.round(y * 45);
            onRotationXYChange(rX, rY);
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-full h-px bg-muted-foreground/15" />
            <div className="h-full w-px bg-muted-foreground/15 absolute" />
          </div>
          <div
            className="absolute bg-foreground border border-foreground/40 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.25)] flex items-center justify-center pointer-events-auto transition-all duration-75 cursor-grab"
            style={{
              width: "14px",
              height: "14px",
              left: `${50 + (-rotateY / 45) * 50}%`,
              top: `${50 + (rotateX / 45) * 50}%`,
              transform: "translate(-50%, -50%) scale(1)",
            }}
          />
        </div>
      </div>

      <SliderControl
        icon="mdi:axis-z-rotate-clockwise"
        label={labels.rotationZ}
        value={rotateZ}
        min={-45}
        max={45}
        step={5}
        onChange={onRotateZChange}
        suffix="°"
      />

      {onVerticalChange && (
        <SliderControl
          icon="mdi:arrow-up-down"
          label={labels.vertical}
          value={verticalValue ?? 0}
          min={verticalMin}
          max={verticalMax}
          step={1}
          onChange={onVerticalChange}
          suffix="%"
        />
      )}

      {onReset && (
        <button
          onClick={onReset}
          className="w-full mt-4 px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted/60 text-[11px] text-muted-foreground hover:text-foreground transition-all flex items-center justify-center gap-2 border border-border"
        >
          <Icon icon="mdi:restore" width={14} />
          {labels.reset}
        </button>
      )}
    </div>
  );
}