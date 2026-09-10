"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Mockup3DStage, type Mockup3DStageProps } from "./Mockup3DStage";
import { GetMediaMaskStyles } from "@/lib/media-mask.utils";
import { PHONE_W, PHONE_H, parseShadowColor } from "@/lib/phone3d.utils";
import { LAPTOP_W, LAPTOP_H } from "./Laptop3DViewer";
import type { ImageDeviceId } from "@/types/mockup.types";

type OverlayMode =
  | { kind: "inset"; inset: number; pointerEvents: "auto" | "none" }
  | { kind: "fixed"; pointerEvents: "auto" | "none" }
  | { kind: "centered"; size: number; pointerEvents: "auto" | "none" };

interface DeviceLayout {
  width: number;
  height: number;
  marginTop?: string;
  marginLeft?: string;
  marginRight?: string;
  marginBottom?: string;
  overlay: OverlayMode;
  maskInset: number;
}

const DEVICE_LAYOUT: Record<ImageDeviceId, DeviceLayout> = {
  "iphone-13-pro-max": {
    width: 480, height: 1000,
    marginTop: "100px", marginRight: "0",
    overlay: { kind: "inset", inset: 400, pointerEvents: "none" },
    maskInset: 400,
  },
  "double_iphone_13_pro": {
    width: PHONE_W, height: PHONE_H,
    marginTop: "220px", marginLeft: "140px",
    overlay: { kind: "inset", inset: 400, pointerEvents: "auto" },
    maskInset: 400,
  },
  "laptop": {
    width: LAPTOP_W, height: LAPTOP_H,
    marginTop: "250px",
    overlay: { kind: "fixed", pointerEvents: "none" },
    maskInset: 0,
  },
  "iphone-17-pro-max": {
    width: 480, height: 1000,
    marginTop: "100px", marginLeft: "170px",
    overlay: { kind: "inset", inset: 400, pointerEvents: "none" },
    maskInset: 400,
  },
  "ipad_mini_6_2021": {
    width: 750, height: 1000,
    marginTop: "100px", marginLeft: "100px",
    overlay: { kind: "inset", inset: 300, pointerEvents: "none" },
    maskInset: 300,
  },
  "iphone": {
    width: PHONE_W, height: PHONE_H,
    marginTop: "220px", marginLeft: "140px",
    overlay: { kind: "centered", size: 1400, pointerEvents: "auto" },
    maskInset: 300,
  },
  "phone": {
    width: PHONE_W, height: PHONE_H,
    marginTop: "220px", marginLeft: "140px",
    overlay: { kind: "centered", size: 1400, pointerEvents: "auto" },
    maskInset: 300,
  },
};

interface FrameProps extends Mockup3DStageProps {
  device: ImageDeviceId;
}

export function Mockup3DFrame({ device, rootRef: externalRootRef, ...stageProps }: FrameProps) {
  const layout = DEVICE_LAYOUT[device];
  const internalRootRef = useRef<THREE.Group | null>(null);
  const rootRef = externalRootRef ?? internalRootRef;
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const [grabbing, setGrabbing] = useState(false);
  const [modelHovered, setModelHovered] = useState(false);

  const shadowIntensity = stageProps.shadowIntensity ?? 0;
  const shadowColor = stageProps.shadowColor ?? "#000000";
  const t = Math.max(0, Math.min(1, shadowIntensity));
  const tEased = t * t;
  const computedBlur = tEased * 60;
  const computedOpacity = tEased * 0.7;
  const shadowRgba = shadowColor.startsWith("#") ? parseShadowColor(shadowColor, computedOpacity) : shadowColor;
  const hasShadow = t > 0.01;

  const maskStyle = GetMediaMaskStyles(stageProps.imageMaskConfig ?? null, {
    inset: layout.maskInset,
    deviceWidth: layout.width,
    deviceHeight: layout.height,
  });

  const hitsModel = (clientX: number, clientY: number): boolean => {
    const canvas = canvasElRef.current;
    const cam = cameraRef.current;
    const model = rootRef.current;
    if (!canvas || !cam || !model) return false;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycasterRef.current.setFromCamera(new THREE.Vector2(x, y), cam);
    return raycasterRef.current.intersectObject(model, true).length > 0;
  };

  const handleMount = (canvas: HTMLCanvasElement) => {
    canvasElRef.current = canvas;
    stageProps.onMount?.(canvas);
  };

  useEffect(() => {
    const onWinPointerUp = () => setGrabbing(false);
    window.addEventListener("pointerup", onWinPointerUp);
    return () => window.removeEventListener("pointerup", onWinPointerUp);
  }, []);

  const hoverRafRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (hoverRafRef.current !== null) cancelAnimationFrame(hoverRafRef.current);
    };
  }, []);

  const overlayStyle: React.CSSProperties =
    layout.overlay.kind === "inset"
      ? { position: "absolute", inset: `-${layout.overlay.inset}px`, zIndex: 2, overflow: "visible" }
      : layout.overlay.kind === "fixed"
        ? { position: "absolute", left: 0, top: 0, width: layout.width, height: layout.height, zIndex: 2, overflow: "visible" }
        : {
          position: "absolute", top: "50%", left: "50%",
          width: layout.overlay.size, height: layout.overlay.size,
          transform: "translate(-50%, -50%)", zIndex: 2, overflow: "visible",
        };

  return (
    <div
      style={{
        display: "inline-block",
        transformOrigin: "top center",
        width: layout.width,
        height: layout.height + (hasShadow ? computedBlur * 0.8 : 0),
        marginTop: layout.marginTop,
        marginLeft: layout.marginLeft,
        marginRight: layout.marginRight,
        marginBottom: layout.marginBottom,
      }}
    >
      <div style={{ position: "relative", width: layout.width, height: layout.height }}>
        {hasShadow && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              bottom: -(computedBlur * 0.5),
              left: `${20 + tEased * 5}%`,
              width: `${60 - tEased * 10}%`,
              height: Math.max(4, computedBlur * 0.55),
              borderRadius: "50%",
              background: shadowRgba,
              filter: `blur(${Math.max(2, computedBlur * 0.6)}px)`,
              zIndex: 0,
              pointerEvents: "none",
            }}
          />
        )}
        <div
          style={{
            ...overlayStyle,
            cursor: grabbing ? "grabbing" : modelHovered ? "grab" : "default",
            transition: "filter 0.15s ease",
            pointerEvents: layout.overlay.pointerEvents,
            ...maskStyle,
          }}
          onPointerDownCapture={(e) => {
            const hit = hitsModel(e.clientX, e.clientY);
            if (!hit) {
              stageProps.onSelectChange?.(false);
              e.stopPropagation();
              return;
            }
            stageProps.onSelectChange?.(true);
            setGrabbing(true);
          }}
          onPointerMove={(e) => {
            if (grabbing || hoverRafRef.current !== null) return;
            const clientX = e.clientX;
            const clientY = e.clientY;
            hoverRafRef.current = requestAnimationFrame(() => {
              hoverRafRef.current = null;
              const hit = hitsModel(clientX, clientY);
              if (hit !== modelHovered) {
                setModelHovered(hit);
                stageProps.onHoverChange?.(hit);
              }
            });
          }}
          onPointerUp={() => setGrabbing(false)}
          onPointerLeave={() => {
            setGrabbing(false);
            if (modelHovered) {
              setModelHovered(false);
              stageProps.onHoverChange?.(false);
            }
          }}
        >
          <Mockup3DStage
            {...stageProps}
            device={device}
            rootRef={rootRef}
            cameraRef={cameraRef}
            onMount={handleMount}
            isHovered={modelHovered}
          />
        </div>
      </div>
    </div>
  );
}