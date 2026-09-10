"use client";

import { useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@iconify/react";
import { SliderControl } from "../../../../components/ui/SliderControl";
import { HANDLE_R, ImageDeviceId, PAD_H, X_HALF, Y_HALF } from "@/types/mockup.types";
import { Button } from "@/components/ui/button";
import { DetailPageHeader } from "@/components/ui/DetailHeaderMenu";
import { Position3DPresetsEditor } from "@/components/ui/Position3DPresetsEditor";
import { ENVIRONMENT_OPTIONS, type EnvironmentPreset } from "@/lib/viewer-controls3d";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";

function PositionPad({
    x,
    y,
    onChangeX,
    onChangeY,
    onDragStart,
    backgroundUrl,
    backgroundColorCss,
}: {
    x: number;
    y: number;
    onChangeX: (v: number) => void;
    onChangeY: (v: number) => void;
    onDragStart?: () => void;
    backgroundUrl?: string | null;
    backgroundColorCss?: string | null;
}) {
    const padRef = useRef<HTMLDivElement>(null);
    const dragging = useRef(false);
    const rectCache = useRef<DOMRect | null>(null);
    const [isDraggingState, setIsDraggingState] = useState(false);

    const cx = Math.max(-X_HALF, Math.min(X_HALF, x));
    const cy = Math.max(-Y_HALF, Math.min(Y_HALF, y));
    const pctX = (cx + X_HALF) / (X_HALF * 2);
    const hy = ((cy + Y_HALF) / (Y_HALF * 2)) * PAD_H;

    const fromEvent = useCallback(
        (e: React.PointerEvent) => {
            if (!rectCache.current) return;
            const rect = rectCache.current;
            const currentWidth = rect.width;
            const rx = Math.max(0, Math.min(currentWidth, e.clientX - rect.left));
            const ry = Math.max(0, Math.min(PAD_H, e.clientY - rect.top));
            onChangeX(Math.round((rx / currentWidth) * X_HALF * 2 - X_HALF));
            onChangeY(Math.round((ry / PAD_H) * Y_HALF * 2 - Y_HALF));
        },
        [onChangeX, onChangeY]
    );

    const bgLayerStyle: React.CSSProperties = backgroundUrl
        ? {
            backgroundImage: `url('${backgroundUrl}')`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
        }
        : backgroundColorCss
            ? backgroundColorCss.startsWith("#") || backgroundColorCss.startsWith("rgb")
                ? { backgroundColor: backgroundColorCss }
                : {
                    backgroundImage: backgroundColorCss,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                }
            : {};

    return (
        <div className="relative group w-full cursor-default">
            <div
                ref={padRef}
                className={`relative w-full rounded-[14px] overflow-hidden select-none border shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)] transition-all duration-200 ${isDraggingState
                        ? "border-cyan-500/40 ring-1 ring-cyan-500/20"
                        : "border-border"
                    }`}
                style={{ height: PAD_H }}
                onPointerDown={(e) => {
                    dragging.current = true;
                    setIsDraggingState(true);
                    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                    if (padRef.current) {
                        rectCache.current = padRef.current.getBoundingClientRect();
                    }
                    onDragStart?.();
                    fromEvent(e);
                }}
                onPointerMove={(e) => {
                    if (dragging.current) {
                        fromEvent(e);
                    }
                }}
                onPointerUp={() => {
                    dragging.current = false;
                    setIsDraggingState(false);
                    rectCache.current = null;
                }}
            >
                <div className="absolute inset-0 pointer-events-none" style={bgLayerStyle} />
                <div className="absolute inset-0 pointer-events-none bg-black/40" />
                {isDraggingState && (
                    <div className="absolute inset-0 pointer-events-none rounded-[14px] ring-2 ring-cyan-400/30 animate-pulse" />
                )}
                <div className="absolute inset-0 pointer-events-none opacity-10 bg-[radial-gradient(#a1a1aa_1px,transparent_1px)] bg-size-[14px_14px]" />
                <div
                    className="absolute top-0 bottom-0 w-px bg-linear-to-b from-transparent via-white/10 to-transparent -translate-x-1/2"
                    style={{ left: "50%" }}
                />
                <div
                    className="absolute left-0 right-0 h-px bg-linear-to-r from-transparent via-white/10 to-transparent -translate-y-1/2"
                    style={{ top: "50%" }}
                />
                <div
                    className="absolute pointer-events-none bg-white/10 transition-opacity -translate-x-1/2"
                    style={{ left: `${pctX * 100}%`, top: 0, bottom: 0, width: "1px" }}
                />
                <div
                    className="absolute pointer-events-none bg-white/10 transition-opacity -translate-y-1/2"
                    style={{ top: hy, left: 0, right: 0, height: "1px" }}
                />
                <div
                    className={`absolute bg-white border border-white/40 rounded-full shadow-[0_0_20px_4px_rgba(255,255,255,0.12),0_4px_12px_rgba(0,0,0,0.6)] mix-blend-screen flex items-center justify-center pointer-events-auto transition-transform duration-75`}
                    style={{
                        width: HANDLE_R * 3,
                        height: HANDLE_R * 3,
                        left: `${pctX * 100}%`,
                        top: hy,
                        transform: `translate(-50%, -50%) ${isDraggingState ? "scale(1.25)" : "scale(1)"
                            }`,
                        cursor: isDraggingState ? "grabbing" : "grab",
                    }}
                />
            </div>
        </div>
    );
}

export interface ActiveDeviceTpl {
    id: ImageDeviceId;
    title: string;
    accentColor: string;
    icon: string;
    modelUrl: string;
    posterUrl?: string;
}

export interface Mockup3dMenuProps {
    activeDeviceTpl: ActiveDeviceTpl | null;
    imagePhoneDevice: string;
    isLaptop: boolean;
    imagePhoneScale: number;
    setImagePhoneScale: (v: number) => void;
    imagePhoneOpening: number;
    setImagePhoneOpening: (v: number) => void;
    imagePhoneShadow: number;
    setImagePhoneShadow: (v: number) => void;
    setImagePhoneShadowColor: (v: string) => void;
    imagePhoneX: number;
    setImagePhoneX: (v: number) => void;
    imagePhoneY: number;
    setImagePhoneY: (v: number) => void;
    setImagePhoneRotX: (v: number) => void;
    setImagePhoneRotY: (v: number) => void;
    backgroundUrl?: string | null;
    backgroundColorCss?: string | null;
    onBack: () => void;
    onRemove: () => void;
    imagePhoneRotX: number;
    imagePhoneRotY: number;
    imagePhoneRotZ: number;
    setImagePhoneRotZ: (v: number) => void;
    imagePhonePresetId: string;
    setImagePhonePresetId: (id: string) => void;
    mediaType: "video" | "image";
    viewer3DAutoRotate: boolean;
    setViewer3DAutoRotate: (v: boolean) => void;
    viewer3DRotationSpeed: number;
    setViewer3DRotationSpeed: (v: number) => void;
    viewer3DGlow: number;
    setViewer3DGlow: (v: number) => void;
    viewer3DEnvironment: EnvironmentPreset;
    setViewer3DEnvironment: (v: EnvironmentPreset) => void;
}

export function Mockup3dMenu({
    activeDeviceTpl,
    imagePhoneDevice,
    isLaptop,
    imagePhoneScale,
    setImagePhoneScale,
    imagePhoneOpening,
    setImagePhoneOpening,
    imagePhoneShadow,
    setImagePhoneShadow,
    setImagePhoneShadowColor,
    imagePhoneX,
    setImagePhoneX,
    imagePhoneY,
    setImagePhoneY,
    setImagePhoneRotX,
    setImagePhoneRotY,
    backgroundUrl,
    backgroundColorCss,
    onBack,
    onRemove,
    imagePhoneRotX,
    imagePhoneRotY,
    imagePhoneRotZ,
    setImagePhoneRotZ,
    imagePhonePresetId,
    setImagePhonePresetId,
    mediaType,
    viewer3DAutoRotate,
    setViewer3DAutoRotate,
    viewer3DRotationSpeed,
    setViewer3DRotationSpeed,
    viewer3DGlow,
    setViewer3DGlow,
    viewer3DEnvironment,
    setViewer3DEnvironment,
}: Mockup3dMenuProps) {
    const t = useTranslations("mockupMenu");

    const handleReset = useCallback(() => {
        setImagePhoneX(0);
        setImagePhoneY(0);
        setImagePhoneScale(0.9);
        const defaultRotX = imagePhoneDevice === "laptop" ? 43.23 : -58.23;
        const defaultRotY = imagePhoneDevice === "laptop" ? -37.82 : -29.82;
        setImagePhoneRotX(defaultRotX);
        setImagePhoneRotY(defaultRotY);
        setImagePhoneRotZ(0);

        if (imagePhoneDevice === "laptop") {
            setImagePhoneOpening(1);
            setImagePhoneShadow(0.7);
        } else if (imagePhoneDevice === "double_iphone_13_pro") {
            setImagePhoneRotX(-30.23);
            setImagePhoneRotY(-60.82);
        } else if (imagePhoneDevice === "iphone-13-pro-max") {
            setImagePhoneScale(1.6);
        } else {
            setImagePhoneShadow(0.4);
        }
        setImagePhoneShadowColor("#000000");
        setImagePhonePresetId("custom");
    }, [
        imagePhoneDevice,
        setImagePhoneX,
        setImagePhoneY,
        setImagePhoneScale,
        setImagePhoneRotX,
        setImagePhoneRotY,
        setImagePhoneRotZ,
        setImagePhoneOpening,
        setImagePhoneShadow,
        setImagePhoneShadowColor,
        setImagePhonePresetId,
    ]);

    return (
        <>
            <div className="flex items-center gap-2 p-3 border-b border-border shrink-0">
                <DetailPageHeader label={t("device3DTitle")} icon="mage:box-3d" onBack={onBack} />
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-6">

                <div className="flex items-center justify-between pb-1">
                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                        {t("configuration")}
                    </span>
                    <button
                        type="button"
                        onClick={handleReset}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors"
                    >
                        <Icon icon="lucide:rotate-ccw" width="11" />
                        {t("reset")}
                    </button>
                </div>

                {mediaType === "video" && (
                    <div className="flex flex-col gap-2">
                        <Position3DPresetsEditor
                            device={imagePhoneDevice}
                            isLaptop={isLaptop}
                            selectedPresetId={imagePhonePresetId}
                            onSelectPreset={(preset) => {
                                setImagePhoneX(preset.x);
                                setImagePhoneY(preset.y);
                                setImagePhoneScale(preset.scale);
                                setImagePhoneRotX(preset.rotateX);
                                setImagePhoneRotY(preset.rotateY);
                                setImagePhoneRotZ(preset.rotateZ);
                                setImagePhonePresetId(preset.id);
                                if ("imagePhoneOpening" in preset) {
                                    setImagePhoneOpening(preset.imagePhoneOpening);
                                }
                            }}
                            rotateX={imagePhoneRotX}
                            rotateY={imagePhoneRotY}
                            onRotationXYChange={(rX, rY) => {
                                setImagePhoneRotX(rX);
                                setImagePhoneRotY(rY);
                            }}
                            rotateZ={imagePhoneRotZ}
                            onRotateZChange={setImagePhoneRotZ}
                            onCustomReset={handleReset}
                        />
                    </div>
                )}

                <div className="flex flex-col gap-3 pt-2">
                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                        {t("position")}
                    </span>

                    <PositionPad
                        x={imagePhoneX}
                        y={imagePhoneY}
                        onChangeX={setImagePhoneX}
                        onChangeY={setImagePhoneY}
                        backgroundUrl={backgroundUrl}
                        backgroundColorCss={backgroundColorCss}
                    />

                    <SliderControl
                        icon="solar:scale-linear"
                        label={t("scale")}
                        value={Math.round(imagePhoneScale * 100)}
                        min={30}
                        max={300}
                        step={1}
                        onChange={(v) => setImagePhoneScale(v / 100)}
                        suffix="%"
                    />
                </div>

                <div className="flex flex-col gap-3 pt-4 border-t border-border">
                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                        {t("modelProperties") || "Propiedades del Modelo"}
                    </span>

                    {isLaptop && (
                        <SliderControl
                            icon="material-symbols:laptop-chromebook-outline"
                            label={t("laptopOpening")}
                            value={Math.round(imagePhoneOpening * 100)}
                            min={0}
                            max={100}
                            step={1}
                            onChange={(v) => setImagePhoneOpening(v / 100)}
                            suffix="%"
                        />
                    )}

                    <SliderControl
                        icon="mdi:blur"
                        label={t("shadow")}
                        value={Math.round(imagePhoneShadow * 100)}
                        min={0}
                        max={100}
                        step={1}
                        onChange={(v) => setImagePhoneShadow(v / 100)}
                        suffix="%"
                    />
                </div>

                <div className="flex flex-col gap-3 pt-4 border-t border-border">
                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                        {t("lightingAndEnvironment") || "Entorno e Iluminación"}
                    </span>

                    <div className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-medium text-muted-foreground">
                            {t("environment")}
                        </span>
                        <Select
                            value={viewer3DEnvironment}
                            onValueChange={(val) => setViewer3DEnvironment(val as EnvironmentPreset)}
                        >
                            <SelectTrigger className="w-full bg-muted/50 border-border text-foreground/80 h-9" textSize="xs">
                                <SelectValue placeholder={t("environment")} />
                            </SelectTrigger>
                            <SelectContent>
                                {ENVIRONMENT_OPTIONS.map((opt) => (
                                    <SelectItem key={opt} value={opt} textSize="xs">
                                        {t(`environments.${opt}`)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <SliderControl
                        icon="mdi:white-balance-sunny"
                        label={t("glow")}
                        value={Math.round(viewer3DGlow * 100)}
                        min={0}
                        max={500}
                        step={10}
                        onChange={(v) => setViewer3DGlow(v / 100)}
                        suffix="%"
                    />
                </div>

                <div className="flex flex-col gap-3 pt-4 border-t border-border">
                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                        {t("presentation") || "Animación y Exhibición"}
                    </span>

                    <div
                        className={`flex items-center justify-between px-3 py-2 squircle-element border transition-all ${viewer3DAutoRotate
                                ? "bg-blue-500/10 border-blue-500/40 text-blue-600 dark:text-blue-300"
                                : "bg-muted/50 border-border text-muted-foreground hover:border-muted-foreground/50"
                            }`}
                    >
                        <span className="flex items-center gap-2 text-[12px] font-medium">
                            <Icon icon="mdi:orbit-variant" width="14" />
                            {t("autoRotate")}
                        </span>
                        <Toggle checked={viewer3DAutoRotate} onChange={setViewer3DAutoRotate} />
                    </div>

                    {viewer3DAutoRotate && (
                        <SliderControl
                            icon="mdi:speedometer"
                            label={t("rotationSpeed")}
                            value={viewer3DRotationSpeed}
                            min={0.1}
                            max={10}
                            step={0.1}
                            onChange={setViewer3DRotationSpeed}
                        />
                    )}
                </div>

                <div className="pt-2">
                    <Button onClick={onRemove} variant="outline" className="w-full text-xs">
                        <Icon icon="ph:trash-bold" width="13" aria-hidden="true" />
                        {t("removeFrame")}
                    </Button>
                </div>

            </div>
        </>
    );
}