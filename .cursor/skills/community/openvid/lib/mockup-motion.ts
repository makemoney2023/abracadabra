import { getDefault3DFragmentDuration, type Mockup3DMotionPresetId } from "./mockup-motion-3d";

export type MockupMotionPresetId =
  | "none"
  | "focus-in"
  | "cinematic-showcase"
  | "isometric-lift"
  | "macro-track"
  | "depth-emerge"
  | "whip-showcase"
  | "exit-fade-down"
  | "exit-scale-blur"
  | "spatial-roam"
  | "rise-crash"
  | "crane-sweep"
  | "z-spin-reveal"
  | "orbit-entrance"
  | "flick-exit"
  | "hero-reveal"
  | "macro-pan"
  | "screen-glide"
  | "float-hold"
  | "spiral-drop";

export type MockupMotionMode = "2d" | "3d";

export interface MockupMotionPresetDef {
  id: MockupMotionPresetId;
  category: "Entrance" | "Continue" | "Exit";
  mode: MockupMotionMode;
}

export const MOCKUP_MOTION_PRESETS: MockupMotionPresetDef[] = [
  { id: "focus-in", category: "Entrance", mode: "2d" },
  { id: "depth-emerge", category: "Entrance", mode: "2d" },
  { id: "z-spin-reveal", category: "Entrance", mode: "2d" },
  { id: "isometric-lift", category: "Entrance", mode: "2d" },
  { id: "cinematic-showcase", category: "Continue", mode: "2d" },
  { id: "macro-track", category: "Continue", mode: "2d" },
  { id: "whip-showcase", category: "Continue", mode: "2d" },
  { id: "spatial-roam", category: "Continue", mode: "2d" },
  { id: "crane-sweep", category: "Continue", mode: "2d" },
  { id: "rise-crash", category: "Continue", mode: "2d" },
  { id: "exit-fade-down", category: "Exit", mode: "2d" },
  { id: "exit-scale-blur", category: "Exit", mode: "2d" },
  { id: "orbit-entrance", category: "Entrance", mode: "3d" },
  { id: "flick-exit", category: "Exit", mode: "3d" },
  { id: "hero-reveal", category: "Entrance", mode: "3d" },
  { id: "macro-pan", category: "Continue", mode: "3d" },
  { id: "screen-glide", category: "Continue", mode: "3d" },
  { id: "float-hold", category: "Continue", mode: "3d" },
  { id: "spiral-drop", category: "Exit", mode: "3d" },
];

/** IDs that belong to 3D mode (used for routing to the 3D sampler). */
export const MOTION_PRESET_3D_IDS: ReadonlySet<MockupMotionPresetId> = new Set(
  MOCKUP_MOTION_PRESETS.filter((p) => p.mode === "3d").map((p) => p.id)
);

export function getMotionPresetMode(id: MockupMotionPresetId): MockupMotionMode {
  return MOCKUP_MOTION_PRESETS.find((p) => p.id === id)?.mode ?? "2d";
}

export interface MockupMotionConfig {
  presetId: MockupMotionPresetId;
  intensity: number;
  speed: number;
}

export const DEFAULT_MOCKUP_MOTION_CONFIG: MockupMotionConfig = {
  presetId: "none",
  intensity: 50,
  speed: 50,
};

export interface MockupMotionTransform {
  scale: number;
  translateXPct: number;
  translateYPct: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  opacity: number;
  blurPx: number;
  perspectivePx: number;
}

export const REST_MOCKUP_MOTION: MockupMotionTransform = {
  scale: 1,
  translateXPct: 0,
  translateYPct: 0,
  rotateX: 0,
  rotateY: 0,
  rotateZ: 0,
  opacity: 1,
  blurPx: 0,
  perspectivePx: 0,
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function easeOutBack(t: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

function easeOutQuint(t: number) {
  return 1 - (1 - t) ** 5;
}

function speedToDurationSec(speed: number): number {
  return lerp(1.4, 0.35, clamp01(speed / 100));
}

export function sampleMockupMotion(
  config: MockupMotionConfig,
  currentTime: number,
  clipDurationSec: number
): MockupMotionTransform {
  const { presetId, intensity, speed } = config;
  const i = clamp01(intensity / 100);

  if (presetId === "none" || clipDurationSec <= 0) return REST_MOCKUP_MOTION;

  switch (presetId) {
    case "focus-in": {
      const dur = Math.min(speedToDurationSec(speed), clipDurationSec);
      const t = clamp01(currentTime / dur);
      const eased = easeOutCubic(t);
      const startBlur = lerp(6, 22, i);

      return {
        ...REST_MOCKUP_MOTION,
        scale: lerp(1.06, 1, eased),
        blurPx: lerp(startBlur, 0, eased),
        opacity: lerp(0.3, 1, easeOutCubic(clamp01(t * 2))),
      };
    }

    case "z-spin-reveal": {
      const speedT = clamp01(speed / 100);
      const animationEnd = lerp(0.95, 0.85, speedT);
      const p = clamp01(currentTime / clipDurationSec);

      const xRot0 = lerp(45, 60, i);
      const yRot0 = lerp(10, 20, i);
      const zRot0 = lerp(-85, -95, i);
      const zoomStart = lerp(0.7, 0.8, i);

      let scale = 1;
      let tiltX = 0;
      let tiltY = 0;
      let tiltZ = 0;

      if (p <= animationEnd) {
        const lp = easeInOutCubic(clamp01(p / animationEnd));
        scale = lerp(zoomStart, 1, lp);
        tiltX = lerp(xRot0, 0, lp);
        tiltY = lerp(yRot0, 0, lp);
        tiltZ = lerp(zRot0, 0, lp);
      }

      const tiltRatio = clamp01(Math.abs(tiltX) / (xRot0 || 1));
      const perspective = lerp(2000, 1000, tiltRatio);

      return {
        ...REST_MOCKUP_MOTION,
        scale,
        translateXPct: 0,
        translateYPct: 0,
        rotateX: tiltX,
        rotateY: tiltY,
        rotateZ: tiltZ,
        perspectivePx: perspective,
      };
    }

    case "cinematic-showcase": {
      const speedT = clamp01(speed / 100);
      const impactEnd = lerp(0.12, 0.05, speedT);
      const panEnd = lerp(0.68, 0.55, speedT);
      const p = clamp01(currentTime / clipDurationSec);

      const zoomStart = lerp(1.5, 2.4, i);
      const zoomPan = lerp(1.15, 1.35, i);
      const tiltX0 = lerp(2, 6, i);
      const tiltY0 = lerp(4, 10, i);
      const anchorX0 = lerp(0.25, 0.4, i);
      const anchorY0 = lerp(0.2, 0.35, i);
      const anchorX1 = lerp(0.05, 0.15, i);
      const anchorY1 = lerp(0.04, 0.12, i);

      let scale: number;
      let anchorX: number;
      let anchorY: number;
      let tiltX: number;
      let tiltY: number;
      let blur = 0;

      if (p <= impactEnd) {
        const lp = easeOutCubic(clamp01(p / Math.max(impactEnd, 0.0001)));
        scale = lerp(zoomStart * 1.04, zoomStart, lp);
        anchorX = anchorX0;
        anchorY = anchorY0;
        tiltX = lerp(tiltX0 * 1.1, tiltX0, lp);
        tiltY = lerp(tiltY0 * 1.1, tiltY0, lp);
      } else if (p <= panEnd) {
        const lp = easeInOutCubic(clamp01((p - impactEnd) / (panEnd - impactEnd)));
        scale = lerp(zoomStart, zoomPan, lp);
        anchorX = lerp(anchorX0, anchorX1, lp);
        anchorY = lerp(anchorY0, anchorY1, lp);
        tiltX = lerp(tiltX0, tiltX0 * 0.4, lp);
        tiltY = lerp(tiltY0, tiltY0 * 0.4, lp);
        blur = Math.sin(Math.PI * lp) * lerp(1.5, 4, i);
      } else {
        const lp = easeOutQuint(clamp01((p - panEnd) / (1 - panEnd)));
        scale = lerp(zoomPan, 1, lp);
        anchorX = lerp(anchorX1, 0, lp);
        anchorY = lerp(anchorY1, 0, lp);
        tiltX = lerp(tiltX0 * 0.4, 0, lp);
        tiltY = lerp(tiltY0 * 0.4, 0, lp);
        blur = 0;
      }

      const translateXPct = scale * anchorX * 100;
      const translateYPct = scale * anchorY * 100;
      const tiltRatio = clamp01((Math.abs(tiltX) + Math.abs(tiltY)) / (tiltX0 + tiltY0 || 1));
      const perspective = lerp(2500, 1500, tiltRatio);

      return {
        ...REST_MOCKUP_MOTION,
        scale,
        translateXPct,
        translateYPct,
        rotateX: tiltX,
        rotateY: tiltY,
        blurPx: blur,
        perspectivePx: perspective,
      };
    }

    case "depth-emerge": {
      const dur = Math.min(speedToDurationSec(speed) * 1.3, clipDurationSec);
      const t = clamp01(currentTime / dur);
      const emergeEnd = 0.45;
      const blurFadeEnd = 0.55;

      const startScale = lerp(0.35, 0.15, i);
      const startBlur = lerp(12, 28, i);
      const startRotateX = lerp(25, 55, i);
      const startRotateY = lerp(-20, -45, i);
      const startOpacity = 0;

      let scale: number;
      let blur: number;
      let rotX: number;
      let rotY: number;
      let opacity: number;

      if (t <= emergeEnd) {
        const lp = easeOutCubic(clamp01(t / emergeEnd));
        scale = lerp(startScale, 1.08, lp);
        blur = lerp(startBlur, 0, easeOutCubic(clamp01(t / blurFadeEnd)));
        rotX = lerp(startRotateX, 8, lp);
        rotY = lerp(startRotateY, -8, lp);
        opacity = lerp(startOpacity, 1, easeOutCubic(clamp01(t * 2.2)));
      } else {
        const lp = easeOutBack(clamp01((t - emergeEnd) / (1 - emergeEnd)));
        scale = lerp(1.08, 1, lp);
        blur = 0;
        rotX = lerp(8, 0, lp);
        rotY = lerp(-8, 0, lp);
        opacity = 1;
      }

      const tiltRatio = clamp01(
        (Math.abs(rotX) + Math.abs(rotY)) / (startRotateX + Math.abs(startRotateY) || 1)
      );
      const perspective = lerp(1800, 900, tiltRatio);

      return {
        ...REST_MOCKUP_MOTION,
        scale,
        rotateX: rotX,
        rotateY: rotY,
        blurPx: blur,
        opacity,
        perspectivePx: perspective,
      };
    }

    case "isometric-lift": {
      const speedT = clamp01(speed / 100);
      const liftEnd = lerp(0.75, 0.6, speedT);
      const p = clamp01(currentTime / clipDurationSec);

      const xRot0 = lerp(35, 60, i);
      const zRot0 = lerp(-15, -40, i);
      const yRot0 = lerp(10, 25, i);
      const zoomStart = lerp(1.1, 1.45, i);

      let scale = 1;
      let tiltX = 0;
      let tiltY = 0;
      let tiltZ = 0;
      let translateYPct = 0;

      if (p <= liftEnd) {
        const lp = easeInOutCubic(clamp01(p / liftEnd));
        scale = lerp(zoomStart, 1.05, lp);
        tiltX = lerp(xRot0, xRot0 * 0.15, lp);
        tiltY = lerp(yRot0, yRot0 * 0.15, lp);
        tiltZ = lerp(zRot0, 0, lp);
      } else {
        const lp = easeOutQuint(clamp01((p - liftEnd) / (1 - liftEnd)));
        scale = lerp(1.05, 1, lp);
        tiltX = lerp(xRot0 * 0.15, 0, lp);
        tiltY = lerp(yRot0 * 0.15, 0, lp);
        tiltZ = 0;
        translateYPct = 0;
      }

      const tiltRatio = clamp01(Math.abs(tiltX) / (xRot0 || 1));
      const perspective = lerp(2000, 1100, tiltRatio);

      return {
        ...REST_MOCKUP_MOTION,
        scale,
        translateXPct: 0,
        translateYPct,
        rotateX: tiltX,
        rotateY: tiltY,
        rotateZ: tiltZ,
        perspectivePx: perspective,
      };
    }

    case "macro-track": {
      const speedT = clamp01(speed / 100);
      const trackEnd = lerp(0.75, 0.6, speedT);
      const p = clamp01(currentTime / clipDurationSec);

      const zoom0 = lerp(2.2, 3.2, i);
      const xRot0 = lerp(45, 65, i);
      const zRot0 = lerp(8, 22, i);
      const anchorX0 = lerp(0.3, 0.45, i);
      const anchorY0 = lerp(0.35, 0.48, i);
      const anchorX1 = lerp(-0.05, -0.1, i);
      const anchorY1 = lerp(-0.05, -0.1, i);

      let scale = 1;
      let anchorX = 0;
      let anchorY = 0;
      let tiltX = 0;
      let tiltZ = 0;

      if (p <= trackEnd) {
        const lp = easeInOutCubic(clamp01(p / trackEnd));
        scale = lerp(zoom0, zoom0 * 0.6, lp);
        anchorX = lerp(anchorX0, anchorX1, lp);
        anchorY = lerp(anchorY0, anchorY1, lp);
        tiltX = lerp(xRot0, xRot0 * 0.3, lp);
        tiltZ = lerp(zRot0, zRot0 * 0.2, lp);
      } else {
        const lp = easeOutQuint(clamp01((p - trackEnd) / (1 - trackEnd)));
        scale = lerp(zoom0 * 0.6, 1, lp);
        anchorX = lerp(anchorX1, 0, lp);
        anchorY = lerp(anchorY1, 0, lp);
        tiltX = lerp(xRot0 * 0.3, 0, lp);
        tiltZ = lerp(zRot0 * 0.2, 0, lp);
      }

      const perspective = 2500;

      return {
        ...REST_MOCKUP_MOTION,
        scale,
        translateXPct: scale * anchorX * 100,
        translateYPct: scale * anchorY * 100,
        rotateX: tiltX,
        rotateY: 0,
        rotateZ: tiltZ,
        blurPx: 0,
        perspectivePx: perspective,
      };
    }

    case "spatial-roam": {
      const speedT = clamp01(speed / 100);
      const i = clamp01(intensity / 100);
      const p = clamp01(currentTime / clipDurationSec);

      const act1 = lerp(0.12, 0.10, speedT);
      const act2 = lerp(0.32, 0.28, speedT);
      const act3 = lerp(0.42, 0.36, speedT);
      const act4 = lerp(0.60, 0.52, speedT);
      const act5 = lerp(0.70, 0.62, speedT);
      const act6 = lerp(0.85, 0.78, speedT);
      const heroScale = lerp(1.02, 1.05, i);
      const orbitScale = lerp(1.1, 1.2, i);
      const macroScale = lerp(1.6, 1.85, i);
      const tiltXMax = lerp(20, 35, i);
      const tiltYMax = lerp(20, 35, i);

      const ptBottomRight = { x: -lerp(0.15, 0.22, i), y: -lerp(0.15, 0.22, i) };
      const ptTopRight = { x: -lerp(0.15, 0.22, i), y: lerp(0.15, 0.22, i) };
      const ptTopLeft = { x: lerp(0.15, 0.22, i), y: lerp(0.15, 0.22, i) };
      const ptBottomLeft = { x: lerp(0.15, 0.22, i), y: -lerp(0.15, 0.22, i) };
      const ptCenter = { x: 0, y: 0 };

      const easeInOutCubic = (t: number) => t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
      const smootherStep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
      const lensBreath = 1 + Math.sin(currentTime * Math.PI * 1.5) * 0.015 * i;

      let scale = 1;
      let anchorX = 0;
      let anchorY = 0;
      let tiltX = 0;
      let tiltY = 0;
      let tiltZ = 0;
      let blur = 0;

      if (p <= act1) {
        const t = clamp01(p / act1);
        const lp = smootherStep(t);

        scale = lerp(1.2, macroScale, lp);
        anchorX = lerp(0, ptBottomRight.x, lp);
        anchorY = lerp(0, ptBottomRight.y, lp);

        tiltX = lerp(0, tiltXMax, lp);
        tiltY = lerp(0, -tiltYMax, lp);
        blur = lerp(lerp(10, 20, i), 0, easeInOutCubic(t));

      } else if (p <= act2) {
        const t = clamp01((p - act1) / (act2 - act1));

        scale = macroScale * lensBreath;
        anchorX = ptBottomRight.x;
        anchorY = lerp(ptBottomRight.y, ptTopRight.y, t);

        tiltX = tiltXMax;
        tiltY = lerp(-tiltYMax, -tiltYMax * 0.6, t);

      } else if (p <= act3) {
        const t = clamp01((p - act2) / (act3 - act2));
        const lp = easeInOutCubic(t);
        const arc = Math.sin(t * Math.PI);

        scale = lerp(macroScale, macroScale * 0.85, lp) - (arc * 0.15);
        anchorX = lerp(ptTopRight.x, ptTopLeft.x, lp);
        anchorY = lerp(ptTopRight.y, ptTopLeft.y, lp);

        tiltX = lerp(tiltXMax, tiltXMax * 0.5, lp) + (arc * 15);
        tiltY = lerp(-tiltYMax * 0.6, tiltYMax, lp);
        tiltZ = arc * lerp(6, 12, i);
        blur = arc * lerp(12, 24, i);

      } else if (p <= act4) {
        const t = clamp01((p - act3) / (act4 - act3));
        const lp = smootherStep(t);

        scale = lerp(macroScale * 0.85, orbitScale, lp) * lensBreath;
        anchorX = lerp(ptTopLeft.x, ptCenter.x, lp);
        anchorY = lerp(ptTopLeft.y, ptCenter.y, lp);

        tiltX = lerp(tiltXMax * 0.5, -tiltXMax * 0.5, lp);
        tiltY = lerp(tiltYMax, -tiltYMax * 0.2, lp);

      } else if (p <= act5) {
        const t = clamp01((p - act4) / (act5 - act4));
        const lp = easeInOutCubic(t);

        scale = lerp(orbitScale, macroScale, lp);
        anchorX = lerp(ptCenter.x, ptBottomLeft.x, lp);
        anchorY = lerp(ptCenter.y, ptBottomLeft.y, lp);

        tiltX = lerp(-tiltXMax * 0.5, tiltXMax * 0.8, lp);
        tiltY = lerp(-tiltYMax * 0.2, tiltYMax, lp);
        blur = Math.sin(t * Math.PI) * lerp(4, 10, i);

      } else if (p <= act6) {
        const t = clamp01((p - act5) / (act6 - act5));

        scale = macroScale * lensBreath;
        anchorX = lerp(ptBottomLeft.x, ptCenter.x, t);
        anchorY = lerp(ptBottomLeft.y, ptCenter.y - lerp(0.05, 0.1, i), t);

        tiltX = lerp(tiltXMax * 0.8, tiltXMax, t);
        tiltY = lerp(tiltYMax, 0, t);

      } else {
        const t = clamp01((p - act6) / (1 - act6));
        const lp = smootherStep(t);

        scale = lerp(macroScale, heroScale, lp);
        anchorX = lerp(0, 0, lp);
        anchorY = lerp(ptCenter.y - lerp(0.05, 0.1, i), 0, lp);

        tiltX = lerp(tiltXMax, 0, lp);
        tiltY = 0;
        tiltZ = 0;
      }

      const translateXPct = scale * anchorX * 100;
      const translateYPct = scale * anchorY * 100;

      const tiltRatio = clamp01((Math.abs(tiltX) + Math.abs(tiltY)) / (tiltXMax + tiltYMax || 1));
      const perspective = lerp(3200, 1100, tiltRatio);

      return {
        ...REST_MOCKUP_MOTION,
        scale,
        translateXPct,
        translateYPct,
        rotateX: tiltX,
        rotateY: tiltY,
        rotateZ: tiltZ,
        blurPx: blur,
        perspectivePx: perspective,
      };
    }

    case "crane-sweep": {
      const speedT = clamp01(speed / 100);
      const i = clamp01(intensity / 100);
      const p = clamp01(currentTime / clipDurationSec);
      const a1 = lerp(0.12, 0.09, speedT);
      const a2 = lerp(0.30, 0.25, speedT);
      const a3 = lerp(0.44, 0.38, speedT);
      const a4 = lerp(0.54, 0.47, speedT);
      const a5 = lerp(0.68, 0.62, speedT);
      const a6 = lerp(0.84, 0.78, speedT);

      const cenitalScale = lerp(0.88, 0.98, i);
      const heroScale = lerp(1.02, 1.08, i);
      const macroScale = lerp(1.50, 1.80, i);

      const cenitalTiltX = -lerp(55, 82, i);
      const hoverTiltX = -lerp(18, 32, i);
      const levelTiltX = lerp(2, 5, i);

      const tiltYMax = lerp(16, 28, i);

      const ptCenter = { x: 0, y: 0 };
      const ptRightFeature = { x: -lerp(0.18, 0.28, i), y: lerp(0.02, 0.06, i) };
      const ptLeftFeature = { x: lerp(0.18, 0.28, i), y: lerp(-0.02, -0.06, i) };
      const smoothStep = (t: number): number => t * t * (3 - 2 * t);
      const smootherStep = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
      const easeInOutCubic = (t: number): number =>
        t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
      const easeOutExpo = (t: number): number => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      const hSeed = currentTime * lerp(0.6, 1.4, i);
      const hAmp = lerp(0.06, 0.16, i);
      const handX = Math.sin(hSeed * 2.7) * Math.cos(hSeed * 1.3) * hAmp;
      const handY = Math.sin(hSeed * 1.9) * Math.cos(hSeed * 4.3) * hAmp;
      const handRot = Math.sin(hSeed * 3.9) * 0.035 * (i * 0.5 + 0.5);
      const breath = 1 + Math.sin(currentTime * Math.PI * 2 * lerp(0.20, 0.45, i)) * lerp(0.003, 0.008, i);
      const orbitRollMax = lerp(4, 10, i);
      const motionBlurMax = lerp(8, 20, i);

      const h0 = {
        s: cenitalScale, x: 0, y: 0,
        tx: cenitalTiltX, ty: 0, tz: 0, blur: 0
      };
      const h1 = {
        s: cenitalScale, x: 0, y: 0,
        tx: cenitalTiltX * 0.85, ty: tiltYMax * 0.10, tz: 0, blur: 0
      };
      const h2 = {
        s: heroScale, x: lerp(0.04, 0.10, i), y: lerp(0.02, 0.05, i),
        tx: hoverTiltX, ty: tiltYMax * 0.35, tz: 0, blur: 0
      };
      const h3 = {
        s: macroScale, x: ptRightFeature.x, y: ptRightFeature.y,
        tx: levelTiltX, ty: -tiltYMax * 0.25, tz: 0, blur: 0
      };
      const h4 = {
        s: macroScale * 0.92, x: ptLeftFeature.x, y: ptLeftFeature.y,
        tx: levelTiltX * 0.8, ty: tiltYMax * 0.30, tz: 0, blur: 0
      };
      const h5 = {
        s: macroScale, x: ptLeftFeature.x + lerp(0.01, 0.03, i), y: ptLeftFeature.y,
        tx: levelTiltX * 0.6, ty: tiltYMax * 0.20, tz: 0, blur: 0
      };


      const h6 = {
        s: heroScale, x: 0, y: 0,
        tx: lerp(5, 12, i), ty: -lerp(10, 18, i), tz: 0, blur: 0
      };


      const h7_end = {
        s: heroScale * lerp(1.1, 1.18, i),
        x: 0,
        y: 0,
        tx: lerp(25, 38, i),
        ty: -lerp(20, 32, i),
        tz: 0,
        blur: 0
      };




      let scale: number;
      let anchorX: number;
      let anchorY: number;
      let tiltX: number;
      let tiltY: number;
      let tiltZ: number;
      let blur: number;

      if (p <= a1) {

        const t = clamp01(p / a1);
        const lp = easeOutCubic(t);
        scale = lerp(h0.s, h1.s, lp) * breath;
        anchorX = lerp(h0.x, h1.x, lp);
        anchorY = lerp(h0.y, h1.y, lp);
        tiltX = lerp(h0.tx, h1.tx, lp);
        tiltY = lerp(h0.ty, h1.ty, lp);
        tiltZ = handRot * 0.2;
        blur = 0;

      } else if (p <= a2) {

        const t = clamp01((p - a1) / (a2 - a1));
        const lp = smootherStep(t);
        scale = lerp(h1.s, h2.s, lp) * breath;
        anchorX = lerp(h1.x, h2.x, lp);
        anchorY = lerp(h1.y, h2.y, lp);
        tiltX = lerp(h1.tx, h2.tx, lp);
        tiltY = lerp(h1.ty, h2.ty, lp);
        tiltZ = handRot * 0.4;
        blur = 0;

      } else if (p <= a3) {

        const t = clamp01((p - a2) / (a3 - a2));
        const lp = smoothStep(t);
        scale = lerp(h2.s, h3.s, lp) * breath;
        anchorX = lerp(h2.x, h3.x, lp);
        anchorY = lerp(h2.y, h3.y, lp);
        tiltX = lerp(h2.tx, h3.tx, lp);
        tiltY = lerp(h2.ty, h3.ty, lp);
        tiltZ = handRot * 0.5;
        blur = 0;

      } else if (p <= a4) {

        const t = clamp01((p - a3) / (a4 - a3));
        const lp = easeInOutCubic(t);
        const arc = Math.sin(Math.PI * lp);
        const arcAsym = Math.sin(Math.PI * Math.pow(lp, 0.8));

        scale = lerp(h3.s, h4.s, lp) * lerp(1, 0.88, arc);

        const midX = (h3.x + h4.x) * 0.5;
        const midY = Math.max(h3.y, h4.y) + lerp(0.04, 0.10, i);
        const u = 1 - lp;
        anchorX = u * u * h3.x + 2 * u * lp * midX + lp * lp * h4.x;
        anchorY = u * u * h3.y + 2 * u * lp * midY + lp * lp * h4.y;

        const flare = arcAsym * lerp(0.55, 1.0, i);
        tiltX = lerp(h3.tx, h4.tx, lp) + flare * hoverTiltX * 0.5;
        tiltY = lerp(h3.ty, h4.ty, lp) + flare * tiltYMax * 0.6;
        tiltZ = arc * orbitRollMax + handRot * 0.2;
        blur = arcAsym * motionBlurMax;

      } else if (p <= a5) {

        const t = clamp01((p - a4) / (a5 - a4));
        const lp = smoothStep(t);
        scale = lerp(h4.s, h5.s, lp) * breath;

        const driftT = lp * Math.PI * 1.1;
        const driftX = Math.sin(driftT) * lerp(0.006, 0.016, i);
        const driftY = Math.cos(driftT * 0.6) * lerp(0.004, 0.012, i);

        anchorX = lerp(h4.x, h5.x, lp) + driftX;
        anchorY = lerp(h4.y, h5.y, lp) + driftY;
        tiltX = lerp(h4.tx, h5.tx, lp) + driftX * lerp(10, 24, i);
        tiltY = lerp(h4.ty, h5.ty, lp) + driftY * lerp(8, 16, i);
        tiltZ = handRot * 0.4;
        blur = lerp(lerp(2, 5, i), 0, lp);

      } else if (p <= a6) {

        const t = clamp01((p - a5) / (a6 - a5));
        const lp = smootherStep(t);
        scale = lerp(h5.s, h6.s, lp) * breath;
        anchorX = lerp(h5.x, h6.x, lp);
        anchorY = lerp(h5.y, h6.y, lp);
        tiltX = lerp(h5.tx, h6.tx, lp);
        tiltY = lerp(h5.ty, h6.ty, lp);
        tiltZ = handRot * 0.3;
        blur = 0;

      } else {

        const t = clamp01((p - a6) / (1 - a6));
        const lp = easeOutExpo(t);
        scale = lerp(h6.s, h7_end.s, lp) * breath;
        anchorX = lerp(h6.x, h7_end.x, lp);
        anchorY = lerp(h6.y, h7_end.y, lp);
        tiltX = lerp(h6.tx, h7_end.tx, lp);
        tiltY = lerp(h6.ty, h7_end.ty, lp);


        const finalSettle = 1 - lp;
        tiltZ = handRot * 0.2 * finalSettle;
        blur = 0;
      }

      const inWhip = (p > a3 && p < a4);
      const isSettling = p > a6;
      if (!inWhip) {
        const noiseMultiplier = isSettling ? 1 - clamp01((p - a6) / (1 - a6)) : 1;
        anchorX += handX * 0.001 * noiseMultiplier;
        anchorY += handY * 0.001 * noiseMultiplier;
      }

      const translateXPct = scale * anchorX * 100;
      const translateYPct = scale * anchorY * 100;

      const tiltMag = Math.abs(tiltX) + Math.abs(tiltY);
      const tiltNorm = clamp01(tiltMag / (Math.abs(cenitalTiltX) + tiltYMax || 1));
      const perspective = lerp(3500, 900, tiltNorm);

      return {
        ...REST_MOCKUP_MOTION,
        scale,
        translateXPct,
        translateYPct,
        rotateX: tiltX,
        rotateY: tiltY,
        rotateZ: tiltZ,
        opacity: 1,
        blurPx: blur,
        perspectivePx: perspective,
      };
    }

    case "rise-crash": {
      const speedT = clamp01(speed / 100);
      const i = clamp01(intensity / 100);
      const p = clamp01(currentTime / clipDurationSec);

      const act1 = lerp(0.12, 0.10, speedT);
      const act2 = lerp(0.30, 0.26, speedT);
      const act3 = lerp(0.44, 0.38, speedT);
      const act4 = lerp(0.62, 0.56, speedT);
      const act5 = lerp(0.74, 0.68, speedT);
      const act6 = lerp(0.90, 0.84, speedT);

      const heroScale = lerp(1.02, 1.08, i);
      const macroScale = lerp(1.55, 1.85, i);
      const crashScale = lerp(1.35, 1.65, i);

      const tiltXMax = lerp(22, 38, i);
      const tiltYMax = lerp(14, 26, i);

      const ptTop = { x: lerp(0.06, 0.12, i), y: lerp(0.18, 0.32, i) };
      const ptBottom = { x: lerp(-0.08, -0.16, i), y: -lerp(0.18, 0.32, i) };
      const ptCenter = { x: 0, y: 0 };

      const easeInOutCubic = (t: number): number =>
        t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
      const smootherStep = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

      let scale = 1;
      let anchorX = 0;
      let anchorY = 0;
      let tiltX = 0;
      let tiltY = 0;
      let tiltZ = 0;
      let blur = 0;

      if (p <= act1) {
        const t = clamp01(p / act1);
        const lp = smootherStep(t);
        scale = lerp(heroScale, macroScale, lp);
        anchorX = lerp(0, ptTop.x, lp);
        anchorY = lerp(0, ptTop.y, lp);
        tiltX = lerp(tiltXMax, tiltXMax * 0.25, lp);
        tiltY = lerp(0, tiltYMax * 0.3, lp);
        blur = 0;

      } else if (p <= act2) {
        const t = clamp01((p - act1) / (act2 - act1));
        scale = macroScale;
        anchorX = ptTop.x;
        anchorY = lerp(ptTop.y, ptTop.y + lerp(0.02, 0.05, i), t);
        tiltX = tiltXMax * 0.25;
        tiltY = lerp(tiltYMax * 0.3, tiltYMax * 0.15, t);

      } else if (p <= act3) {
        const t = clamp01((p - act2) / (act3 - act2));
        const lp = easeInOutCubic(t);
        const arc = Math.sin(t * Math.PI);
        scale = lerp(macroScale, crashScale, lp) * lerp(1, 0.88, arc);
        anchorX = lerp(ptTop.x, ptBottom.x, lp);
        anchorY = lerp(ptTop.y, ptBottom.y, lp);
        tiltX = lerp(tiltXMax * 0.25, -tiltXMax * 0.6, lp) + arc * lerp(8, 18, i);
        tiltY = lerp(tiltYMax * 0.15, -tiltYMax * 0.4, lp);
        tiltZ = arc * lerp(-5, -12, i);
        blur = arc * lerp(14, 28, i);

      } else if (p <= act4) {
        const t = clamp01((p - act3) / (act4 - act3));
        const lp = smootherStep(t);
        scale = lerp(crashScale, macroScale, lp);
        anchorX = lerp(ptBottom.x, ptBottom.x + lerp(0.02, 0.06, i), lp);
        anchorY = ptBottom.y;
        tiltX = lerp(-tiltXMax * 0.6, -tiltXMax * 0.35, lp);
        tiltY = lerp(-tiltYMax * 0.4, -tiltYMax * 0.2, lp);
        blur = lerp(lerp(3, 6, i), 0, lp);

      } else if (p <= act5) {
        const t = clamp01((p - act4) / (act5 - act4));
        const lp = easeInOutCubic(t);
        const arc = Math.sin(t * Math.PI);
        scale = lerp(macroScale, macroScale * 1.05, lp) * lerp(1, 0.92, arc);
        anchorX = lerp(ptBottom.x + lerp(0.02, 0.06, i), ptCenter.x, lp);
        anchorY = lerp(ptBottom.y, ptCenter.y, lp);
        tiltX = lerp(-tiltXMax * 0.35, 0, lp) + arc * tiltXMax * 0.25;
        tiltY = lerp(-tiltYMax * 0.2, 0, lp) + arc * tiltYMax * 0.2;
        tiltZ = arc * lerp(4, 10, i);
        blur = arc * lerp(10, 20, i);

      } else if (p <= act6) {
        const t = clamp01((p - act5) / (act6 - act5));
        const lp = smootherStep(t);
        scale = lerp(macroScale * 1.05, heroScale, lp);
        anchorX = lerp(ptCenter.x, 0, lp);
        anchorY = lerp(ptCenter.y, 0, lp);
        tiltX = lerp(0, tiltXMax, lp);
        tiltY = 0;
        tiltZ = 0;
        blur = 0;

      } else {
        const t = clamp01((p - act6) / (1 - act6));
        const lp = smootherStep(t);
        scale = heroScale;
        anchorX = 0;
        anchorY = 0;
        tiltX = tiltXMax;
        tiltY = 0;
        tiltZ = 0;
        blur = 0;
      }

      const translateXPct = scale * anchorX * 100;
      const translateYPct = scale * anchorY * 100;
      const tiltRatio = clamp01((Math.abs(tiltX) + Math.abs(tiltY)) / (tiltXMax + tiltYMax || 1));
      const perspective = lerp(3200, 1100, tiltRatio);

      return {
        ...REST_MOCKUP_MOTION,
        scale,
        translateXPct,
        translateYPct,
        rotateX: tiltX,
        rotateY: tiltY,
        rotateZ: tiltZ,
        blurPx: blur,
        perspectivePx: perspective,
      };
    }

    case "whip-showcase": {
      const speedT = clamp01(speed / 100);
      const i = clamp01(intensity / 100);
      const a1 = lerp(0.12, 0.08, speedT);
      const a2 = lerp(0.28, 0.22, speedT);
      const a3 = lerp(0.44, 0.36, speedT);
      const a4 = lerp(0.52, 0.44, speedT);
      const a5 = lerp(0.68, 0.60, speedT);
      const a6 = lerp(0.80, 0.72, speedT);
      const a7 = lerp(0.90, 0.84, speedT);
      const p = clamp01(currentTime / clipDurationSec);

      const anchorHero = { x: 0, y: 0 };
      const anchorFeatA = { x: lerp(0.26, 0.16, i), y: lerp(-0.14, -0.30, i) };
      const anchorFeatB = { x: lerp(-0.18, -0.28, i), y: lerp(0.18, 0.34, i) };
      const zoomHero = lerp(1.02, 1.08, i);
      const zoomFeatA = lerp(1.40, 1.95, i);
      const zoomFeatB = lerp(1.52, 2.20, i);
      const zoomMacro = lerp(1.65, 2.35, i);
      const heroTiltX = lerp(10, 16, i);
      const heroTiltY = lerp(14, 24, i);
      const featATiltX = lerp(2, 4, i);
      const featATiltY = lerp(2.5, 5.5, i);
      const featBTiltX = lerp(1.5, 3.5, i);
      const featBTiltY = lerp(2, 5, i);

      const handoffA = {
        scale: zoomFeatA,
        anchorX: anchorFeatA.x,
        anchorY: anchorFeatA.y,
        tiltX: featATiltX,
        tiltY: featATiltY,
      };

      const handoffAEnd = {
        scale: zoomFeatA * lerp(1.01, 1.03, i),
        anchorX: anchorFeatA.x + lerp(0.03, 0.08, i),
        anchorY: anchorFeatA.y + lerp(0.015, 0.04, i),
        tiltX: featATiltX * lerp(0.7, 0.5, i),
        tiltY: featATiltY * lerp(0.7, 0.5, i),
      };

      const handoffBEnd = {
        scale: zoomMacro * lerp(1.005, 1.015, i),
        anchorX: anchorFeatB.x + lerp(0.008, 0.02, i),
        anchorY: anchorFeatB.y + lerp(0.004, 0.012, i),
        tiltX: featBTiltX * 0.4,
        tiltY: featBTiltY * 0.4,
      };

      const handoff6End = {
        scale: zoomHero * lerp(1.06, 1.12, i),
        anchorX: lerp(0.04, 0.10, i),
        anchorY: lerp(0.01, 0.03, i),
        tiltX: heroTiltX * lerp(0.85, 0.95, i),
        tiltY: heroTiltY * lerp(0.85, 0.95, i),
      };

      const handoff7End = {
        scale: zoomHero * lerp(1.02, 1.06, i),
        anchorX: -lerp(0.04, 0.10, i),
        anchorY: lerp(0.005, 0.015, i),
        tiltX: heroTiltX * lerp(0.9, 1.0, i),
        tiltY: heroTiltY * lerp(0.9, 1.0, i),
      };

      const smoothStep = (t: number): number => t * t * (3 - 2 * t);
      const smootherStep = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
      const easeInOutQuart = (t: number): number =>
        t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
      const easeOutBack = (t: number, o: number = 1.70158): number =>
        1 + (o + 1) * Math.pow(t - 1, 3) + o * Math.pow(t - 1, 2);

      const hSeed = currentTime * lerp(0.8, 1.8, i);
      const hAmp = lerp(0.08, 0.20, i);
      const handX = Math.sin(hSeed * 3.1) * Math.cos(hSeed * 1.7) * hAmp;
      const handY = Math.sin(hSeed * 2.3) * Math.cos(hSeed * 5.1) * hAmp;
      const handRot = Math.sin(hSeed * 4.7) * 0.04 * (i * 0.5 + 0.5);
      const breath = 1 + Math.sin(currentTime * Math.PI * 2 * lerp(0.28, 0.55, i)) * lerp(0.003, 0.010, i);
      const whipRollMax = lerp(2.5, 6.5, i);
      const motionBlurMax = lerp(6, 18, i);

      let scale: number;
      let anchorX: number;
      let anchorY: number;
      let tiltX: number;
      let tiltY: number;
      let tiltZ: number;
      let blur: number;

      if (p <= a1) {
        const t = clamp01(p / a1);
        const lp = easeOutCubic(t);

        scale = zoomHero;
        anchorX = anchorHero.x;
        anchorY = anchorHero.y;
        tiltX = lerp(heroTiltX * 1.2, heroTiltX, lp);
        tiltY = lerp(heroTiltY * 1.15, heroTiltY, lp);
        tiltZ = handRot * 0.3;
        blur = 0;

      } else if (p <= a2) {
        const t = clamp01((p - a1) / (a2 - a1));
        const lp = smootherStep(t);

        scale = lerp(zoomHero, handoffA.scale, lp) * breath;
        anchorX = lerp(anchorHero.x, handoffA.anchorX, lp);
        anchorY = lerp(anchorHero.y, handoffA.anchorY, lp);
        tiltX = lerp(heroTiltX, handoffA.tiltX, lp);
        tiltY = lerp(heroTiltY, handoffA.tiltY, lp);
        tiltZ = handRot * 0.6;
        blur = 0;

      } else if (p <= a3) {
        const t = clamp01((p - a2) / (a3 - a2));
        const lp = smoothStep(t);

        scale = lerp(handoffA.scale, handoffAEnd.scale, lp) * breath;
        anchorX = lerp(handoffA.anchorX, handoffAEnd.anchorX, lp);
        anchorY = lerp(handoffA.anchorY, handoffAEnd.anchorY, lp);
        tiltX = lerp(handoffA.tiltX, handoffAEnd.tiltX, lp);
        tiltY = lerp(handoffA.tiltY, handoffAEnd.tiltY, lp);
        tiltZ = handRot;
        blur = 0;

      } else if (p <= a4) {
        const t = clamp01((p - a3) / (a4 - a3));
        const lp = easeInOutQuart(t);

        const arc = Math.sin(Math.PI * lp);
        const arcAsym = Math.sin(Math.PI * Math.pow(lp, 0.8));
        const zoomSuck = 1 - arc * 0.05;

        scale = lerp(handoffAEnd.scale, zoomFeatB, lp) * zoomSuck;

        const midX = (handoffAEnd.anchorX + anchorFeatB.x) * 0.5 + lerp(0.03, 0.08, i);
        const midY = (handoffAEnd.anchorY + anchorFeatB.y) * 0.5 - lerp(0.02, 0.05, i);
        const u = 1 - lp;
        anchorX = u * u * handoffAEnd.anchorX + 2 * u * lp * midX + lp * lp * anchorFeatB.x;
        anchorY = u * u * handoffAEnd.anchorY + 2 * u * lp * midY + lp * lp * anchorFeatB.y;

        const flare = arcAsym * lerp(0.45, 0.85, i);
        tiltX = lerp(handoffAEnd.tiltX, featBTiltX, lp) + flare * heroTiltX * 0.4;
        tiltY = lerp(handoffAEnd.tiltY, featBTiltY, lp) + flare * heroTiltY * 0.4;
        tiltZ = arc * -whipRollMax + handRot * 0.2;
        blur = arcAsym * motionBlurMax;

      } else if (p <= a5) {
        const t = clamp01((p - a4) / (a5 - a4));
        const lp = smoothStep(t);

        scale = lerp(zoomFeatB, handoffBEnd.scale, lp) * breath;

        const microT = lp * Math.PI * 1.2;
        const microX = Math.sin(microT) * lerp(0.006, 0.018, i);
        const microY = Math.sin(microT * 0.7) * lerp(0.004, 0.012, i);

        anchorX = lerp(anchorFeatB.x, handoffBEnd.anchorX, lp) + microX;
        anchorY = lerp(anchorFeatB.y, handoffBEnd.anchorY, lp) + microY;

        tiltX = lerp(featBTiltX, handoffBEnd.tiltX, lp) + microX * lerp(10, 22, i);
        tiltY = lerp(featBTiltY, handoffBEnd.tiltY, lp) - microY * lerp(6, 14, i);
        tiltZ = handRot * 0.5;
        blur = 0;

      } else if (p <= a6) {
        const t = clamp01((p - a5) / (a6 - a5));
        const lp = easeOutCubic(t);

        scale = lerp(handoffBEnd.scale, handoff6End.scale, lp) * breath;

        anchorX = lerp(handoffBEnd.anchorX, handoff6End.anchorX, lp);
        anchorY = lerp(handoffBEnd.anchorY, handoff6End.anchorY, lp);

        tiltX = lerp(handoffBEnd.tiltX, handoff6End.tiltX, lp);
        tiltY = lerp(handoffBEnd.tiltY, handoff6End.tiltY, lp);
        tiltZ = handRot * 0.6;
        blur = 0;

      } else if (p <= a7) {
        const t = clamp01((p - a6) / (a7 - a6));
        const lp = smoothStep(t);

        scale = lerp(handoff6End.scale, handoff7End.scale, lp) * breath;

        anchorX = lerp(handoff6End.anchorX, handoff7End.anchorX, lp);
        anchorY = lerp(handoff6End.anchorY, handoff7End.anchorY, lp);

        tiltX = lerp(handoff6End.tiltX, handoff7End.tiltX, lp);
        tiltY = lerp(handoff6End.tiltY, handoff7End.tiltY, lp);
        tiltZ = handRot + (anchorX - handoff6End.anchorX) * lerp(2, 5, i);
        blur = 0;

      } else {
        const t = clamp01((p - a7) / (1 - a7));
        const lp = easeOutCubic(t);

        scale = lerp(handoff7End.scale, zoomHero, lp) * breath;
        anchorX = lerp(handoff7End.anchorX, anchorHero.x, lp);
        anchorY = lerp(handoff7End.anchorY, anchorHero.y, lp);
        tiltX = lerp(handoff7End.tiltX, heroTiltX, lp);
        tiltY = lerp(handoff7End.tiltY, heroTiltY, lp);
        tiltZ = handRot * 0.3;
        blur = 0;
      }


      const inWhip = (p > a3 && p < a4);
      if (!inWhip) {
        anchorX += handX * 0.001;
        anchorY += handY * 0.001;
      }


      const translateXPct = scale * anchorX * 100;
      const translateYPct = scale * anchorY * 100;

      const tiltMag = Math.abs(tiltX) + Math.abs(tiltY);
      const tiltNorm = clamp01(tiltMag / (heroTiltX + heroTiltY || 1));
      const perspective = lerp(3000, 1200, tiltNorm);

      return {
        ...REST_MOCKUP_MOTION,
        scale,
        translateXPct,
        translateYPct,
        rotateX: tiltX,
        rotateY: tiltY,
        rotateZ: tiltZ,
        opacity: 1,
        blurPx: blur,
        perspectivePx: perspective,
      };
    }

    case "exit-fade-down": {
      const dur = Math.min(speedToDurationSec(speed), clipDurationSec);
      const startAt = Math.max(0, clipDurationSec - dur);
      const t = clamp01((currentTime - startAt) / dur);
      const eased = easeOutCubic(t);
      const distance = lerp(6, 24, i);

      return {
        ...REST_MOCKUP_MOTION,
        translateYPct: lerp(0, distance, eased),
        opacity: lerp(1, 0, eased),
      };
    }

    case "exit-scale-blur": {
      const dur = Math.min(speedToDurationSec(speed), clipDurationSec);
      const startAt = Math.max(0, clipDurationSec - dur);
      const t = clamp01((currentTime - startAt) / dur);
      const eased = easeOutCubic(t);

      return {
        ...REST_MOCKUP_MOTION,
        scale: lerp(1, lerp(1.02, 1.25, i), eased),
        blurPx: lerp(0, lerp(4, 16, i), eased),
        opacity: lerp(1, 0, eased),
      };
    }

    default:
      return REST_MOCKUP_MOTION;
  }
}

const ENTRANCE_EXIT_PADDING = 1.4;
const DEFAULT_CONTINUOUS_DURATION = 3;

const SMALL_DURATION_PRESETS = new Set<MockupMotionPresetId>([
  "cinematic-showcase",
  "isometric-lift",
  "macro-track",
  "z-spin-reveal"
]);

const LONG_DURATION_PRESETS = new Set<MockupMotionPresetId>([
  "whip-showcase",
  "rise-crash"
]);

const EXTRA_LONG_DURATION_PRESETS = new Set<MockupMotionPresetId>([
  "spatial-roam",
  "crane-sweep"
]);

export function getDefaultFragmentDuration(
  presetId: MockupMotionPresetId,
  speed: number
): number {

  if (EXTRA_LONG_DURATION_PRESETS.has(presetId)) {
    return lerp(12, 10.0, clamp01(speed / 100));
  }

  if (LONG_DURATION_PRESETS.has(presetId)) {
    return lerp(12, 6.0, clamp01(speed / 100));
  }

  if (SMALL_DURATION_PRESETS.has(presetId)) {
    return lerp(7, 4.5, clamp01(speed / 100));
  }

  const category = getMotionPresetCategory(presetId);

  if (category === "Entrance" || category === "Exit") {
    return speedToDurationSec(speed) * ENTRANCE_EXIT_PADDING;
  }

  return DEFAULT_CONTINUOUS_DURATION;
}

export function buildMockupMotionCss(m: MockupMotionTransform): string {
  return [
    `translate(${m.translateXPct}%, ${m.translateYPct}%)`,
    `scale(${m.scale})`,
    m.rotateX !== 0 ? `rotateX(${m.rotateX}deg)` : "",
    m.rotateY !== 0 ? `rotateY(${m.rotateY}deg)` : "",
    m.rotateZ !== 0 ? `rotateZ(${m.rotateZ}deg)` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export interface MotionCustomOffsets {
  positionX: number;
  positionY: number;
  zoomMultiplier: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  blur: number;
  reverse: boolean;
}

export const DEFAULT_MOTION_CUSTOM_OFFSETS: MotionCustomOffsets = {
  positionX: 0,
  positionY: 0,
  zoomMultiplier: 1,
  rotateX: 0,
  rotateY: 0,
  rotateZ: 0,
  blur: 0,
  reverse: false,
};

export interface MockupMotionFragment extends MockupMotionConfig {
  id: string;
  startTime: number;
  endTime: number;
  custom?: MotionCustomOffsets;
  /** Custom offsets for 3D presets. Only used when presetId is a 3D preset. */
  custom3D?: import("./mockup-motion-3d").Mockup3DMotionCustomOffsets;
}

export function getMotionPresetCategory(
  id: MockupMotionPresetId
): (typeof MOCKUP_MOTION_PRESETS)[number]["category"] {
  return MOCKUP_MOTION_PRESETS.find((p) => p.id === id)?.category ?? "Continue";
}

function applyMotionCustomOffsets(
  base: MockupMotionTransform,
  custom: MotionCustomOffsets | undefined
): MockupMotionTransform {
  if (!custom) return base;

  const sign = custom.reverse ? -1 : 1;

  return {
    ...base,
    scale: base.scale * custom.zoomMultiplier,
    translateXPct: base.translateXPct * sign + custom.positionX,
    translateYPct: base.translateYPct * sign + custom.positionY,
    rotateX: base.rotateX * sign + custom.rotateX,
    rotateY: base.rotateY * sign + custom.rotateY,
    rotateZ: base.rotateZ * sign + custom.rotateZ,
    blurPx: Math.max(0, base.blurPx + custom.blur),
  };
}

export function sampleFragmentMotion(
  fragment: MockupMotionFragment,
  currentTime: number
): MockupMotionTransform {
  if (currentTime < fragment.startTime || currentTime > fragment.endTime) {
    return REST_MOCKUP_MOTION;
  }

  const localTime = currentTime - fragment.startTime;
  const localDuration = fragment.endTime - fragment.startTime;

  // 3D presets produce CSS-compatible values by mapping the 3D transform
  // back into the 2D transform space so the existing CSS pipeline keeps
  // working. The real 3D application happens in Mockup3DStage via
  // sampleCombined3DMotion.
  if (MOTION_PRESET_3D_IDS.has(fragment.presetId)) {
    return REST_MOCKUP_MOTION;
  }

  const base = sampleMockupMotion(
    { presetId: fragment.presetId, intensity: fragment.intensity, speed: fragment.speed },
    localTime,
    localDuration
  );

  return applyMotionCustomOffsets(base, fragment.custom);
}

export function sampleCombinedMockupMotion(
  fragments: MockupMotionFragment[],
  currentTime: number
): MockupMotionTransform {
  const active = fragments.filter(
    (f) => currentTime >= f.startTime && currentTime <= f.endTime
  );

  if (active.length === 0) return REST_MOCKUP_MOTION;

  return active.reduce<MockupMotionTransform>(
    (acc, fragment) => {
      const t = sampleFragmentMotion(fragment, currentTime);
      return {
        scale: acc.scale * t.scale,
        translateXPct: acc.translateXPct + t.translateXPct,
        translateYPct: acc.translateYPct + t.translateYPct,
        rotateX: acc.rotateX + t.rotateX,
        rotateY: acc.rotateY + t.rotateY,
        rotateZ: acc.rotateZ + t.rotateZ,
        opacity: acc.opacity * t.opacity,
        blurPx: Math.max(acc.blurPx, t.blurPx),
        perspectivePx: Math.max(acc.perspectivePx, t.perspectivePx),
      };
    },
    { ...REST_MOCKUP_MOTION }
  );
}

export function findValidMotionPlacement(
  presetId: MockupMotionPresetId,
  speed: number,
  hintTime: number,
  existingFragments: MockupMotionFragment[],
  clipDurationSec: number
): { startTime: number; endTime: number } | null {
  const is3D = MOTION_PRESET_3D_IDS.has(presetId);
  const defaultDur = is3D
    ? getDefault3DFragmentDuration(presetId as Mockup3DMotionPresetId, speed)
    : getDefaultFragmentDuration(presetId, speed);
  const duration = Math.min(defaultDur, clipDurationSec);
  if (duration <= 0 || clipDurationSec <= 0) return null;

  const category = getMotionPresetCategory(presetId);
  const sorted = [...existingFragments].sort((a, b) => a.startTime - b.startTime);

  const overlaps = (start: number, end: number) =>
    sorted.some((f) => start < f.endTime && end > f.startTime);

  const tryPlace = (start: number) => {
    const end = start + duration;
    if (start < 0 || end > clipDurationSec) return null;
    return overlaps(start, end) ? null : { startTime: start, endTime: end };
  };

  const preferredStart =
    category === "Entrance"
      ? 0
      : category === "Exit"
        ? Math.max(0, clipDurationSec - duration)
        : Math.max(0, Math.min(hintTime - duration / 2, clipDurationSec - duration));

  const direct = tryPlace(preferredStart);
  if (direct) return direct;

  const gaps: { start: number; end: number }[] = [];
  let cursor = 0;

  for (const f of sorted) {
    if (f.startTime > cursor) gaps.push({ start: cursor, end: f.startTime });
    cursor = Math.max(cursor, f.endTime);
  }

  if (cursor < clipDurationSec) gaps.push({ start: cursor, end: clipDurationSec });

  const fitting = gaps.filter((g) => g.end - g.start >= duration);
  if (fitting.length === 0) return null;

  fitting.sort((a, b) => {
    const da = Math.min(
      Math.abs(a.start - preferredStart),
      Math.abs(a.end - duration - preferredStart)
    );
    const db = Math.min(
      Math.abs(b.start - preferredStart),
      Math.abs(b.end - duration - preferredStart)
    );
    return da - db;
  });

  const gap = fitting[0];
  const start = Math.max(gap.start, Math.min(preferredStart, gap.end - duration));

  return { startTime: start, endTime: start + duration };
}

// Re-export 3D helpers so consumers can import everything from one module.
export {
  getDefault3DFragmentDuration,
  sampleCombined3DMotion,
  type Mockup3DMotionTransform,
  type Mockup3DMotionCustomOffsets,
  DEFAULT_3D_MOTION_CUSTOM_OFFSETS,
  REST_MOCKUP_3D_MOTION,
} from "./mockup-motion-3d";