"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CAMERA_SHAPES,
  CORNER_POSITIONS,
  DEFAULT_RECORDING_SETUP,
  enumerateMediaDevices,
  requestCameraStream,
  requestMicrophoneStream,
  RECORDING_SETUP_STORAGE_KEY,
  VALID_CAMERA_SHAPES,
  VALID_CAMERA_CORNERS,
  CORNER_BUTTONS,
  type AvailableDevices,
  type CameraCorner,
  type CameraShape,
  type RecordingSetupConfig,
} from "@/types/camera.types";
import { SliderControl } from "../../../components/ui/SliderControl";
import { Toggle } from "@/components/ui/toggle";
import { BrowserPermissionUI } from "@/components/ui/BrowserPermissionUI";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { SectionToggle } from "@/components/ui/SectionToggle";

interface Props {
  open: boolean;
  onClose: () => void;
  onStart: (config: RecordingSetupConfig) => void;
}

function loadSavedSetup(): RecordingSetupConfig {
  if (typeof window === "undefined") return { ...DEFAULT_RECORDING_SETUP, systemAudio: false };
  try {
    const saved = localStorage.getItem(RECORDING_SETUP_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as RecordingSetupConfig;
      let cameraShape = (parsed.camera?.shape as string) || "";
      if (cameraShape === "rounded") {
        cameraShape = "squircle";
      }
      const resolvedShape: CameraShape = VALID_CAMERA_SHAPES.includes(cameraShape as CameraShape)
        ? (cameraShape as CameraShape)
        : DEFAULT_RECORDING_SETUP.camera.shape;
      const savedCorner = parsed.camera?.corner;
      const resolvedCorner: CameraCorner = VALID_CAMERA_CORNERS.includes(savedCorner)
        ? savedCorner
        : DEFAULT_RECORDING_SETUP.camera.corner;
      const resolvedPosition = (savedCorner === resolvedCorner && parsed.camera?.position)
        ? parsed.camera.position
        : DEFAULT_RECORDING_SETUP.camera.position;
      return {
        ...DEFAULT_RECORDING_SETUP,
        ...parsed,
        systemAudio: parsed.systemAudio ?? false,
        camera: {
          ...DEFAULT_RECORDING_SETUP.camera,
          ...parsed.camera,
          shape: resolvedShape,
          corner: resolvedCorner,
          position: resolvedPosition,
        },
        microphone: {
          ...DEFAULT_RECORDING_SETUP.microphone,
          ...parsed.microphone
        },
      };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_RECORDING_SETUP, systemAudio: false };
}

export default function RecordingSetupDialog({ open, onClose, onStart }: Props) {
  const t = useTranslations("recordingSetup");
  const [setup, setSetup] = useState<RecordingSetupConfig>(loadSavedSetup);
  const [devices, setDevices] = useState<AvailableDevices>({ cameras: [], microphones: [] });
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  
  const [cameraErrorCode, setCameraErrorCode] = useState<string | null>(null);
  const [micErrorCode, setMicErrorCode] = useState<string | null>(null);
  
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [isDraggingPreview, setIsDraggingPreview] = useState(false);

  const isPermissionDenied = cameraErrorCode === "NotAllowedError";
  const dragPreviewRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    enumerateMediaDevices().then(setDevices);
  }, [open]);

  useEffect(() => {
    if (!open || !setup.camera.enabled) {
      const timer = setTimeout(() => {
        setPreviewStream((prevStream) => {
          if (prevStream) {
            prevStream.getTracks().forEach((track) => track.stop());
          }
          return null;
        });
      }, 0);
      return () => clearTimeout(timer);
    }

    let cancelled = false;
    let acquired: MediaStream | null = null;

    requestCameraStream(setup.camera.deviceId)
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        acquired = stream;
        setPreviewStream(stream);
        setCameraErrorCode(null);
        const fresh = await enumerateMediaDevices();
        if (!cancelled) setDevices(fresh);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("Error de cámara:", err);
        const isPermissionError = err.name === "NotAllowedError" || err.message?.includes("Permission denied");
        
        if (isPermissionError) {
          setCameraErrorCode("NotAllowedError");
        } else {
          setCameraErrorCode("generic");
        }
        
        setSetup((s) => ({ ...s, camera: { ...s.camera, enabled: false } }));
      });

    return () => {
      cancelled = true;
      if (acquired) {
        acquired.getTracks().forEach((track) => track.stop());
      }
    };
  }, [open, setup.camera.enabled, setup.camera.deviceId]);

  useEffect(() => {
    if (!open || !setup.microphone.enabled) return;

    let cancelled = false;

    requestMicrophoneStream(setup.microphone.deviceId, {
      noiseSuppression: setup.microphone.noiseSuppression,
      echoCancellation: setup.microphone.echoCancellation,
    })
      .then(async (stream) => {
        stream.getTracks().forEach((track) => track.stop());
        if (cancelled) return;
        setMicErrorCode(null);
        const fresh = await enumerateMediaDevices();
        if (!cancelled) setDevices(fresh);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("Error de micrófono:", err);
        setMicErrorCode("generic");
        setSetup((s) => ({
          ...s,
          microphone: { ...s.microphone, enabled: false },
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [
    open,
    setup.microphone.enabled,
    setup.microphone.deviceId,
    setup.microphone.noiseSuppression,
    setup.microphone.echoCancellation,
  ]);

  useEffect(() => {
    const el = previewVideoRef.current;
    if (!el) return;
    el.srcObject = previewStream;
    if (previewStream) {
      el.play().catch(() => undefined);
    }
  }, [previewStream]);

  const handleStart = useCallback(() => {
    try {
      localStorage.setItem(RECORDING_SETUP_STORAGE_KEY, JSON.stringify(setup));
    } catch {
      // ignore
    }
    onStart(setup);
    onClose();
  }, [setup, onStart, onClose]);

  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!open) return null;

  const sizeMultiplier = 0.5 + (setup.camera.size - 20) / 40;
  const shapeRadiusMap: Record<CameraShape, string> = {
    circle: "50%",
    squircle: `${Math.round(20 * sizeMultiplier)}px`,
    square: `${Math.round(6 * sizeMultiplier)}px`,
  };
  const shapeRadius = shapeRadiusMap[setup.camera.shape] ?? shapeRadiusMap.square;

  const previewFrameStyle: React.CSSProperties = {
    borderRadius: shapeRadius,
    transform: setup.camera.mirror ? "scaleX(-1)" : undefined,
  };

  const cameraErrorMessage = cameraErrorCode === "NotAllowedError" 
    ? t("camera.permissionDenied") 
    : cameraErrorCode === "generic" 
      ? t("camera.errorGeneric") 
      : null;

  const micErrorMessage = micErrorCode === "generic" ? t("mic.errorGeneric") : null;

  return (
    <div className="fixed inset-0 z-9998 flex items-center justify-center bg-black/70 backdrop-blur-md px-4 py-6 pointer-events-auto">
      <div
        className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-popover dark:bg-black shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("description")}
            </p>
          </div>
          <button
            onClick={handleCancel}
            className="size-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center justify-center"
            aria-label={t("close")}
          >
            <Icon icon="material-symbols:close-rounded" className="size-5" />
          </button>
        </div>

        <div className="grid gap-0 md:grid-cols-[1.2fr_1fr] h-full">
          <div className="relative flex flex-col h-full bg-muted/40 p-6 border-b md:border-b-0 md:border-r border-border">
            <div className="relative flex flex-1 w-full items-center justify-center min-h-0">
              <div className="relative w-full overflow-hidden rounded-[10px] shadow-[0_3px_10px_rgba(0,0,0,0.5)]">
                <div className="w-full aspect-video bg-card border border-border flex flex-col overflow-hidden">
                  <div className="bg-muted flex flex-col justify-center items-center px-4 shrink-0 w-full h-7 rounded-t-[10px] border-b border-border">
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-4">
                        <div className="flex gap-1.5">
                          <div className="size-1.5 rounded-full border border-gray-400 bg-gray-400/20"></div>
                          <div className="size-1.5 rounded-full border border-gray-400 bg-gray-400/20"></div>
                          <div className="size-1.5 rounded-full border border-gray-400 bg-gray-400/20"></div>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Icon icon="lucide:arrow-left" className="size-2 hover:text-foreground transition-colors cursor-pointer" />
                          <Icon icon="lucide:arrow-right" className="size-2 text-muted-foreground/50" />
                          <Icon icon="lucide:rotate-cw" className="size-2 hover:text-foreground transition-colors cursor-pointer" />
                        </div>
                      </div>

                      <div className="flex-1 max-w-xl mx-4">
                        <div className="bg-muted/60 rounded-lg h-5 w-full flex items-center justify-between px-2 border border-border shadow-inner">
                          <Icon icon="material-symbols:lock" className="size-2.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
                          <span className="flex-1 text-center text-[9px] tracking-wide truncate px-2 text-muted-foreground leading-none">
                            openvid.dev
                          </span>
                          <Icon icon="material-symbols:star-outline" className="size-3 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-muted-foreground">
                        <Icon icon="solar:puzzle-linear" className="size-2 hover:text-foreground transition-colors cursor-pointer" />
                        <Icon icon="lucide:panel-right" className="size-2 hover:text-foreground transition-colors cursor-pointer" />
                      </div>
                    </div>
                  </div>

                  <div ref={previewContainerRef} className="flex-1 flex w-full h-full bg-muted">
                    <div
                      className="relative w-full h-full bg-linear-to-br from-muted to-muted/40 overflow-hidden"
                      style={{ containerType: "size" }}
                    >
                      <div className="absolute inset-0 grid grid-cols-4 grid-rows-3 opacity-20">
                        {Array.from({ length: 12 }).map((_, i) => (
                          <div key={i} className="border border-border" />
                        ))}
                      </div>

                      <div
                        onPointerDown={(e) => {
                          if (!setup.camera.enabled || e.button !== 0) return;
                          const container = previewContainerRef.current;
                          if (!container) return;
                          e.currentTarget.setPointerCapture(e.pointerId);
                          dragPreviewRef.current = {
                            pointerId: e.pointerId,
                            startX: e.clientX,
                            startY: e.clientY,
                            startPosX: setup.camera.position.x,
                            startPosY: setup.camera.position.y,
                          };
                          setIsDraggingPreview(true);
                        }}
                        onPointerMove={(e) => {
                          const drag = dragPreviewRef.current;
                          if (!drag || drag.pointerId !== e.pointerId) return;
                          const container = previewContainerRef.current;
                          if (!container) return;
                          const rect = container.getBoundingClientRect();
                          const dx = (e.clientX - drag.startX) / rect.width;
                          const dy = (e.clientY - drag.startY) / rect.height;
                          const nextX = Math.min(1, Math.max(0, drag.startPosX + dx));
                          const nextY = Math.min(1, Math.max(0, drag.startPosY + dy));
                          setSetup((s) => ({
                            ...s,
                            camera: { ...s.camera, position: { x: nextX, y: nextY }, corner: "custom" },
                          }));
                        }}
                        onPointerUp={(e) => {
                          const drag = dragPreviewRef.current;
                          if (!drag || drag.pointerId !== e.pointerId) return;
                          e.currentTarget.releasePointerCapture(e.pointerId);
                          dragPreviewRef.current = null;
                          setIsDraggingPreview(false);
                        }}
                        onPointerCancel={(e) => {
                          const drag = dragPreviewRef.current;
                          if (!drag || drag.pointerId !== e.pointerId) return;
                          e.currentTarget.releasePointerCapture(e.pointerId);
                          dragPreviewRef.current = null;
                          setIsDraggingPreview(false);
                        }}
                        className={`absolute ${setup.camera.enabled ? (isDraggingPreview ? "cursor-grabbing" : "cursor-grab") : ""}`}
                        style={{
                          width: `${setup.camera.size * 100}cqw`,
                          height: `${setup.camera.size * 100}cqw`,
                          left: `clamp(0px, calc(${setup.camera.position.x * 100}cqw - ${setup.camera.size * 50}cqw), calc(100cqw - ${setup.camera.size * 100}cqw))`,
                          top: `clamp(0px, calc(${setup.camera.position.y * 100}cqh - ${setup.camera.size * 50}cqw), calc(100cqh - ${setup.camera.size * 100}cqw))`,
                          transition: isDraggingPreview ? "none" : "left 120ms ease, top 120ms ease",
                          touchAction: "none",
                        }}
                      >
                        {setup.camera.enabled && previewStream ? (
                          <video
                            ref={previewVideoRef}
                            autoPlay
                            muted
                            playsInline
                            className={`size-full object-cover border-2 border-foreground/40 shadow-[0_8px_40px_rgba(0,163,255,0.25)] transition-all duration-300 ${setup.camera.shape === "squircle" ? "squircle-element-camera" : ""}`}
                            style={previewFrameStyle}
                          />
                        ) : (
                          <div
                            className={`size-full flex items-center justify-center border-2 border-dashed border-foreground/40 text-muted-foreground transition-all duration-300 ${setup.camera.shape === "squircle" ? "squircle-element-camera" : ""}`}
                            style={previewFrameStyle}
                          >
                            <Icon icon="solar:videocamera-bold" className="size-8" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 shrink-0">
              <div className="text-xs text-muted-foreground mb-2">{t("preview.initialPosition")}</div>
              <div className="grid grid-cols-4 gap-2">
                {CORNER_BUTTONS.map((c) => {
                  const active = setup.camera.corner === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() =>
                        setSetup((s) => ({
                          ...s,
                          camera: { ...s.camera, corner: c.id, position: CORNER_POSITIONS[c.id] },
                        }))
                      }
                      disabled={!setup.camera.enabled}
                      className={`group relative flex items-center justify-center aspect-video rounded-md border text-[11px] transition-all 
                        ${active ? "border-[#00A3FF] bg-[#00A3FF]/10 text-[#00A3FF]" : "border-border bg-muted text-muted-foreground hover:bg-muted"}
                        ${!setup.camera.enabled ? "opacity-40 cursor-not-allowed" : ""}`}
                    >
                      <span
                        className={`absolute size-2 rounded-full ${active ? "bg-[#00A3FF]" : "bg-muted-foreground/50"}`}
                        style={{
                          left: c.id.includes("left") ? "10%" : "auto",
                          right: c.id.includes("right") ? "10%" : "auto",
                          top: c.id.includes("top") ? "18%" : "auto",
                          bottom: c.id.includes("bottom") ? "18%" : "auto",
                        }}
                      />
                      <span className="sr-only">{t(`corners.${c.id}`)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5 text-sm overflow-y-auto max-h-[60vh] md:max-h-full">
            <SectionToggle
              icon="solar:videocamera-record-bold"
              title={t("camera.title")}
              enabled={setup.camera.enabled}
              onToggle={(v) =>
                setSetup((s) => ({ ...s, camera: { ...s.camera, enabled: v } }))
              }
              error={cameraErrorMessage}
              description={
                isPermissionDenied ? (
                  <div className="mt-0.5">
                    <HoverCard openDelay={200} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <span className="text-red-600 dark:text-red-400 font-medium border-b border-dashed border-red-400/50 cursor-help pb-0.5">
                          {t("camera.permissionDenied")}
                        </span>
                      </HoverCardTrigger>
                      <HoverCardContent
                        side="bottom"
                        align="start"
                        sideOffset={8}
                        className="w-auto p-0 border-none shadow-none bg-transparent z-9999"
                      >
                        <div className="relative">
                          <div className="absolute -top-2 left-10 w-4 h-4 bg-muted border-t border-l border-border transform rotate-45" />
                          <BrowserPermissionUI />
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </div>
                ) : (
                  t("camera.description")
                )
              }
            >
              <div className="space-y-3 pt-1">
                <Select
                  value={setup.camera.deviceId ?? "default"}
                  onValueChange={(v) =>
                    setSetup((s) => ({
                      ...s,
                      camera: { ...s.camera, deviceId: v === "default" ? null : v },
                    }))
                  }
                >
                  <SelectTrigger className="w-full bg-muted border-border text-foreground">
                    <SelectValue placeholder={t("camera.selectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent className="bg-popover dark:bg-black border-border text-foreground z-9999">
                    <SelectItem value="default">{t("camera.default")}</SelectItem>
                    {devices.cameras
                      .filter((cam) => cam.deviceId !== "")
                      .map((cam) => (
                        <SelectItem key={cam.deviceId} value={cam.deviceId}>
                          {cam.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                <div>
                  <div className="text-xs text-muted-foreground mb-1.5">{t("camera.shape")}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {CAMERA_SHAPES.map((shape) => {
                      const active = setup.camera.shape === shape.id;
                      return (
                        <button
                          key={shape.id}
                          onClick={() =>
                            setSetup((s) => ({ ...s, camera: { ...s.camera, shape: shape.id } }))
                          }
                          className={`flex flex-col items-center gap-1 px-2 py-2.5 squircle-element border text-[11px] transition-all
                            ${active ? "border-[#00A3FF] bg-[#00A3FF]/10 text-foreground" : "border-border bg-muted text-muted-foreground hover:bg-muted"}
                          `}
                        >
                          <Icon icon={shape.icon} className="size-5" />
                          {t(`shapes.${shape.id}`)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-2">
                  <SliderControl
                    label={t("camera.size")}
                    value={Math.round(setup.camera.size * 100)}
                    min={8}
                    max={40}
                    suffix="%"
                    onChange={(val) =>
                      setSetup((s) => ({ ...s, camera: { ...s.camera, size: val / 100 } }))
                    }
                  />
                </div>

                <label className="flex items-center justify-between cursor-pointer pt-2 border-t border-border">
                  <span className="text-xs text-foreground/80 flex items-center gap-2">
                    <Icon icon="solar:reflection-horisontal-bold" className="size-4" />
                    {t("camera.mirror")}
                  </span>
                  <Toggle
                    checked={setup.camera.mirror}
                    onChange={(v) =>
                      setSetup((s) => ({ ...s, camera: { ...s.camera, mirror: v } }))
                    }
                  />
                </label>
              </div>
            </SectionToggle>

            <SectionToggle
              icon="solar:microphone-3-bold"
              title={t("mic.title")}
              description={t("mic.description")}
              enabled={setup.microphone.enabled}
              onToggle={(v) =>
                setSetup((s) => ({ ...s, microphone: { ...s.microphone, enabled: v } }))
              }
              error={micErrorMessage}
            >
              <div className="pt-1">
                <Select
                  value={setup.microphone.deviceId ?? "default"}
                  onValueChange={(v) =>
                    setSetup((s) => ({
                      ...s,
                      microphone: { ...s.microphone, deviceId: v === "default" ? null : v },
                    }))
                  }
                >
                  <SelectTrigger className="w-full bg-muted border-border text-foreground">
                    <SelectValue placeholder={t("mic.selectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent className="bg-popover dark:bg-black border-border text-foreground z-9999">
                    <SelectItem value="default">{t("mic.default")}</SelectItem>
                    {devices.microphones
                      .filter((mic) => mic.deviceId !== "")
                      .map((mic) => (
                        <SelectItem key={mic.deviceId} value={mic.deviceId}>
                          {mic.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </SectionToggle>

            <label className="flex items-center justify-between cursor-pointer px-1 py-2 rounded-lg">
              <div className="flex items-start gap-2.5">
                <Icon icon="solar:volume-loud-bold" className="size-5 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-sm text-foreground font-medium">{t("systemAudio.title")}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t("systemAudio.description")}
                  </div>
                </div>
              </div>
              <Toggle
                checked={setup.systemAudio}
                onChange={(v) => setSetup((s) => ({ ...s, systemAudio: v }))}
              />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={handleCancel}>
            {t("actions.cancel")}
          </Button>
          <Button variant="primary" onClick={handleStart} className="gap-2 text-white">
            <Icon icon="material-symbols:cast-outline-rounded" className="size-4" />
            {t("actions.shareScreen")}
          </Button>
        </div>
      </div>
    </div>
  );
}