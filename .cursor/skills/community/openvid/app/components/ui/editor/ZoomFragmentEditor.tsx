"use client";
import { useRef, useMemo, useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { SliderControl } from "../../../../components/ui/SliderControl";
import type { ZoomFragmentEditorProps } from "@/types/zoom.types";
import { formatZoomTime, zoomLevelToFactor, speedToTransitionMs, getFragmentHoldBounds } from "@/types/zoom.types";
import { hasMovementSpaceAvailable } from "@/lib/zoom-movement.utils";
import { TooltipAction } from "@/components/ui/tooltip-action";
import { DetailPageHeader } from "@/components/ui/DetailHeaderMenu";
import { Toggle } from "@/components/ui/toggle";
import { DirectionPad } from "@/components/ui/DirectionPad";
import { Button } from "@/components/ui/button";
import { ZoomPointOverlay } from "@/components/ui/ZoomPointOverlay";
import { MIN_MOVEMENT_TRACK_DURATION } from "./ZoomMovementTrackItem";

export function ZoomFragmentEditor({
  fragment,
  movements,
  selectedMovementId,
  onSelectMovement,
  onToggleMovement,
  onAddMovement,
  onDeleteMovement,
  onUpdateMovementPoint,
  videoUrl,
  videoThumbnail,
  getThumbnailForTime,
  videoDimensions,
  onBack,
  onDelete,
  onUpdate,
  is3DModelActive = false,
}: ZoomFragmentEditorProps) {
  const t = useTranslations("zoomFragmentEditor");
  const tCommon = useTranslations("editor");
  const focusPreviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (is3DModelActive && fragment.enable3D) onUpdate({ enable3D: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [is3DModelActive]);

  const dynamicThumbnail = useMemo(() => {
    if (!getThumbnailForTime) return videoThumbnail || null;
    // Use the fragment's start time (not the global playhead) so the preview
    // always shows the frame this zoom fragment applies to, even when the
    // playhead is in a different clip.
    const thumb = getThumbnailForTime(fragment.startTime);
    return thumb?.dataUrl || videoThumbnail || null;
  }, [getThumbnailForTime, fragment.startTime, videoThumbnail]);

  const movementEnabled = fragment.movementEnabled ?? false;
  const sortedMovements = useMemo(
    () => [...movements].sort((a, b) => a.startTime - b.startTime),
    [movements]
  );
  const activePointId = selectedMovementId ?? "origin";

  const pointChain = useMemo(() => {
    const chain: Array<{ id: string; x: number; y: number; label: string }> = [
      { id: "origin", x: fragment.focusX, y: fragment.focusY, label: "A" },
    ];
    sortedMovements.forEach((m, i) => chain.push({ id: m.id, x: m.focusX, y: m.focusY, label: String(i + 1) }));
    return chain;
  }, [fragment.focusX, fragment.focusY, sortedMovements]);

  const updatePoint = (pointId: string, x: number, y: number) => {
    if (pointId === "origin") onUpdate({ focusX: x, focusY: y });
    else onUpdateMovementPoint(pointId, x, y);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, pointId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelectMovement(pointId === "origin" ? null : pointId);
    const move = (ev: PointerEvent) => {
      if (!focusPreviewRef.current) return;
      const rect = focusPreviewRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100));
      updatePoint(pointId, x, y);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-drag-handle]")) return;
    if (!focusPreviewRef.current) return;
    const rect = focusPreviewRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    updatePoint(activePointId, x, y);
  };

  const holdBounds = useMemo(() => getFragmentHoldBounds(fragment), [fragment]);
  const holdDuration = Math.max(0, holdBounds.end - holdBounds.start);
  const isTooShort = holdDuration < MIN_MOVEMENT_TRACK_DURATION;
  const [showTooShortWarning, setShowTooShortWarning] = useState(false);
  const canAddMovement = hasMovementSpaceAvailable(sortedMovements, holdBounds.start, holdBounds.end);

  useEffect(() => {
    if (!showTooShortWarning) return;
    const id = setTimeout(() => setShowTooShortWarning(false), 3000);
    return () => clearTimeout(id);
  }, [showTooShortWarning]);

  const handleMovementToggleClick = () => {
    if (isTooShort) {
      setShowTooShortWarning(true);
      return;
    }
    onToggleMovement(!movementEnabled);
  };

  const minAllowedSpeed = useMemo(() => {
    if (!movementEnabled) return 1;
    const SPEED_MIN_MS = 150;
    const SPEED_MAX_MS = 2000;
    const fragmentDurationSec = Math.max(0, fragment.endTime - fragment.startTime);
    const maxAllowedTransitionMs = (fragmentDurationSec - MIN_MOVEMENT_TRACK_DURATION) * 1000;
    return Math.max(1, Math.min(10, 1 + (9 * (SPEED_MAX_MS - Math.max(SPEED_MIN_MS, Math.min(SPEED_MAX_MS, maxAllowedTransitionMs)))) / (SPEED_MAX_MS - SPEED_MIN_MS)));
  }, [movementEnabled, fragment.startTime, fragment.endTime]);

  const handleToggle3D = () => {
    const enabling = !(fragment.enable3D ?? false);
    if (enabling && (fragment.perspective3DAngleX === undefined || fragment.perspective3DAngleY === undefined)) {

      const baseAngleX = Math.round(((fragment.focusY - 50) / 50) * 15);
      const baseAngleY = Math.round(-((fragment.focusX - 50) / 50) * 15);

      onUpdate({
        enable3D: true,
        perspective3DAngleX: baseAngleX + 15,
        perspective3DAngleY: baseAngleY - 15,
        ...(fragment.perspective3DIntensity === undefined ? { perspective3DIntensity: 50 } : {}),
      });
      return;
    }
    onUpdate({ enable3D: enabling });
  };

  return (
    <div className="flex flex-col h-full text-foreground">
      <div className="flex items-center gap-2 p-3 border-b border-border shrink-0">
        <DetailPageHeader label={t("title")} icon="ph:arrow-left-bold" onBack={onBack} />
        <TooltipAction label={t("deleteTooltip")}>
          <button onClick={onDelete} className="ml-auto flex items-center gap-1.5 text-[11px] text-destructive/80 hover:text-destructive px-2 py-1 rounded-md transition-colors shrink-0">
            <Icon icon="ph:trash-bold" width="12" />
            {t("actions.delete")}
          </button>
        </TooltipAction>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-5">
        <div>
          <div className="flex items-center gap-2 text-xs mb-2 text-muted-foreground">
            <Icon icon="material-symbols:center-focus-strong-outline" width="16" />
            <span>{movementEnabled ? t("focusPoints.multiple") : t("focusPoints.single")}</span>
          </div>
          <div
            ref={focusPreviewRef}
            className="relative w-full squircle-element overflow-hidden bg-muted dark:bg-[#0a0a0e] border border-border select-none"
            style={{ aspectRatio: videoDimensions ? `${videoDimensions.width}/${videoDimensions.height}` : "16/9" }}
            onClick={handlePreviewClick}
          >
            {dynamicThumbnail ? (
              <img src={dynamicThumbnail} alt={t("preview.alt")} className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none" />
            ) : videoUrl ? (
              <video src={videoUrl} className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none" muted />
            ) : null}

            <ZoomPointOverlay
              points={pointChain}
              zoomLevel={fragment.zoomLevel}
              activePointId={activePointId}
              onPointPointerDown={handlePointerDown}
              markerId="preview-zoom-chain-arrowhead"
            />
          </div>
        </div>

        <div className="space-y-3 p-3 bg-muted/40 border border-border squircle-element">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon icon="mdi:vector-line" width="16" className="text-muted-foreground" />
              <div>
                <p className="text-xs font-medium text-foreground/90">{t("movement.title")}</p>
                <p className="text-[11px] text-muted-foreground">{t("movement.subtitle")}</p>
              </div>
            </div>
            <div className={isTooShort ? "opacity-50 cursor-not-allowed" : ""}>
              <Toggle
                checked={movementEnabled}
                onChange={handleMovementToggleClick}
                activeColor="bg-emerald-500"
              />
            </div>
          </div>

          {isTooShort && showTooShortWarning ? (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 squircle-element">
              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                <span>{t("movement.tooShort")}</span>
              </div>
            </div>
          ) : (
            movementEnabled && (
              <div className="space-y-3 pt-1">
                <div className="flex flex-col gap-1.5">
                  {sortedMovements.map((m) => (
                    <div
                      key={m.id}
                      className={`flex items-center justify-between pl-3 pr-2 py-1.5 rounded-lg text-[11px] font-mono border transition-colors cursor-pointer w-full ${activePointId === m.id
                        ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/40"
                        : "bg-muted/40 text-muted-foreground/80 hover:bg-muted border-border/50"
                        }`}
                      onClick={() => onSelectMovement(m.id)}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <div className={`size-1.5 rounded-full shrink-0 ${activePointId === m.id ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                        <span className="truncate">{m.name}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteMovement(m.id);
                        }}
                        className="p-1 rounded-md hover:bg-destructive/20 hover:text-destructive transition-colors shrink-0"
                        aria-label={t("movement.deleteMovement")}
                      >
                        <Icon icon="ph:x-bold" width="11" />
                      </button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onAddMovement}
                    disabled={!canAddMovement}
                    className="w-full border-dashed text-muted-foreground hover:text-foreground font-mono text-[11px] mt-1"
                  >
                    <Icon icon="ph:plus-bold" />
                    {t("movement.addMovement")}
                  </Button>
                </div>
              </div>
            )
          )}
        </div>

        {!is3DModelActive && (
          <div className="space-y-3 p-3 bg-muted/40 border border-border squircle-element">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon icon="mdi:cube-outline" width="16" className="text-muted-foreground" />
                <div>
                  <p className="text-xs font-medium text-foreground/90">{tCommon("effect3d.title")}</p>
                  <p className="text-[11px] text-muted-foreground">{tCommon("effect3d.subtitle")}</p>
                </div>
              </div>
              <Toggle checked={fragment.enable3D ?? false} onChange={handleToggle3D} activeColor="bg-gray-400" />
            </div>
            {fragment.enable3D && (
              <div className="space-y-3 pt-3 border-t border-border">
                <SliderControl icon="mdi:brightness-6" label={tCommon("effect3d.intensity")} value={fragment.perspective3DIntensity ?? 50} min={0} max={100} step={5} onChange={(value) => onUpdate({ perspective3DIntensity: value })} suffix="%" />
                {(() => {
                  const defaultAngleX = ((fragment.focusY - 50) / 50) * 15;
                  const defaultAngleY = -((fragment.focusX - 50) / 50) * 15;
                  const angleX = fragment.perspective3DAngleX ?? defaultAngleX;
                  const angleY = fragment.perspective3DAngleY ?? defaultAngleY;
                  return (
                    <DirectionPad angleX={angleX} angleY={angleY} onChange={(x, y) => onUpdate({ perspective3DAngleX: x, perspective3DAngleY: y })} accentRgb="156,163,175" label={tCommon("effect3d.direction")} hint={tCommon("effect3d.directionHint")} className="aspect-square max-w-[220px]" />
                  );
                })()}
              </div>
            )}
          </div>
        )}

        <SliderControl icon="mdi:magnify-plus-outline" label={t("sliders.zoomLevel")} value={fragment.zoomLevel} min={1} max={10} step={0.1} onChange={(value) => onUpdate({ zoomLevel: value })} />
        <SliderControl icon="mdi:speedometer" label={t("sliders.transitionSpeed")} value={Math.max(minAllowedSpeed, fragment.speed)} min={minAllowedSpeed} max={10} step={0.1} onChange={(value) => onUpdate({ speed: value })} />

        <div className="h-px bg-border" />

        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground/70">{t("info.fragmentDuration")}</span>
            <span className="font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {formatZoomTime(fragment.startTime)} - {formatZoomTime(fragment.endTime)}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground/70">{t("info.zoomFactor")}</span>
            <span className="font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">{zoomLevelToFactor(fragment.zoomLevel).toFixed(1)}×</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground/70">{t("info.transitionDuration")}</span>
            <span className="font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">{(speedToTransitionMs(fragment.speed) / 1000).toFixed(1)}s</span>
          </div>
        </div>
      </div>
    </div>
  );
}