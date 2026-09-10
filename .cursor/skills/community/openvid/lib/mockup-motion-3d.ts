export type Mockup3DMotionPresetId =
  | "none"
  | "orbit-entrance"
  | "flick-exit"
  | "hero-reveal"
  | "macro-pan"
  | "screen-glide"
  | "float-hold"
  | "spiral-drop";
export const MOCKUP_3D_MOTION_PRESETS: {
  id: Mockup3DMotionPresetId;
  category: "Entrance" | "Continue" | "Exit";
}[] = [
    { id: "orbit-entrance", category: "Entrance" },
    { id: "hero-reveal", category: "Entrance" },

    { id: "macro-pan", category: "Continue" },
    { id: "screen-glide", category: "Continue" },
    { id: "float-hold", category: "Continue" },

    { id: "flick-exit", category: "Exit" },
    { id: "spiral-drop", category: "Exit" },
  ];

export interface Mockup3DMotionConfig {
  presetId: Mockup3DMotionPresetId;
  intensity: number;
  speed: number;
}

export const DEFAULT_MOCKUP_3D_MOTION_CONFIG: Mockup3DMotionConfig = {
  presetId: "none",
  intensity: 50,
  speed: 50,
};

/**
 * Transform payload consumed by the 3D stage. All rotations are in RADIANS,
 * position offsets are in scene units (the model is scaled at scale=0.004 in
 * the iPhone viewer, so a position offset of ~0.2 roughly equals one body
 * width), and scale is a uniform multiplier on top of the base scale.
 */
export interface Mockup3DMotionTransform {
  /** Euler rotation applied additively to the root group (radians). */
  rotX: number;
  rotY: number;
  rotZ: number;
  /** Position offset added to the root group (scene units). */
  posX: number;
  posY: number;
  posZ: number;
  /** Uniform scale multiplier (1 = no change). */
  scale: number;
  /** Opacity [0..1] — applied to materials when < 1. */
  opacity: number;
}

export const REST_MOCKUP_3D_MOTION: Mockup3DMotionTransform = {
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  posX: 0,
  posY: 0,
  posZ: 0,
  scale: 1,
  opacity: 1,
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const DEG = Math.PI / 180;

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

function easeOutBack(t: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

function easeOutQuint(t: number) {
  return 1 - (1 - t) ** 5;
}

function speedToDurationSec(speed: number): number {
  return lerp(1.6, 0.5, clamp01(speed / 100));
}

export function sampleMockup3DMotion(
  config: Mockup3DMotionConfig,
  currentTime: number,
  clipDurationSec: number
): Mockup3DMotionTransform {
  const { presetId, intensity, speed } = config;
  const i = clamp01(intensity / 100);

  if (presetId === "none" || clipDurationSec <= 0) return REST_MOCKUP_3D_MOTION;

  switch (presetId) {
    /**
     * ORBIT ENTRANCE — the model sweeps in from a dramatic three-quarter
     * angle while rising on the Y axis, then settles into its resting pose.
     * Feels like a hero product reveal on a turntable.
     */
    case "orbit-entrance": {
      const dur = Math.min(speedToDurationSec(speed) * 1.2, clipDurationSec);
      const t = clamp01(currentTime / dur);
      const eased = easeOutCubic(t);

      const startRotY = lerp(140, 220, i) * DEG;
      const startRotX = lerp(20, 40, i) * DEG;
      const startRotZ = lerp(-12, -24, i) * DEG;
      const startY = lerp(0.12, 0.28, i);
      const startScale = lerp(0.65, 0.4, i);

      const settleRot = easeOutBack(clamp01(t));
      const rotY = lerp(startRotY, 0, eased);
      const rotX = lerp(startRotX, 0, settleRot);
      const rotZ = lerp(startRotZ, 0, eased);
      const posY = lerp(startY, 0, eased);
      const scale = lerp(startScale, 1, settleRot);

      return {
        ...REST_MOCKUP_3D_MOTION,
        rotX,
        rotY,
        rotZ,
        posY,
        scale,
        opacity: easeOutCubic(clamp01(t * 2.2)),
      };
    }

    /**
     * FLICK EXIT — the model quickly tilts, rotates, and accelerates away
     * while fading out. Mirrors the physical "swipe away" gesture.
     */
    case "flick-exit": {
      const dur = Math.min(speedToDurationSec(speed), clipDurationSec);
      const startAt = Math.max(0, clipDurationSec - dur);
      const t = clamp01((currentTime - startAt) / dur);
      const eased = easeOutQuint(t);

      const exitRotY = lerp(60, 140, i) * DEG;
      const exitRotX = lerp(-15, -35, i) * DEG;
      const exitRotZ = lerp(8, 20, i) * DEG;
      const exitX = lerp(0.15, 0.4, i);
      const exitY = lerp(0.05, 0.18, i);
      const exitScale = lerp(0.92, 0.75, i);

      return {
        ...REST_MOCKUP_3D_MOTION,
        rotX: lerp(0, exitRotX, eased),
        rotY: lerp(0, exitRotY, eased),
        rotZ: lerp(0, exitRotZ, eased),
        posX: lerp(0, exitX, eased),
        posY: lerp(0, exitY, eased),
        scale: lerp(1, exitScale, eased),
        opacity: lerp(1, 0, eased),
      };
    }

    case "hero-reveal": {
      const dur = Math.min(speedToDurationSec(speed) * 1.5, clipDurationSec);
      const t = clamp01(currentTime / dur);
      const eased = easeOutCubic(t);
      const settleRot = easeOutBack(clamp01(t));


      const startRotY = lerp(160, 220, i) * DEG;
      const startRotX = lerp(-15, -45, i) * DEG;
      const startScale = lerp(1.2, 1.6, i);
      const startZ = lerp(-0.1, -0.4, i);

      return {
        ...REST_MOCKUP_3D_MOTION,
        rotY: lerp(startRotY, 0, settleRot),
        rotX: lerp(startRotX, 0, eased),
        scale: lerp(startScale, 1, eased),
        posZ: lerp(startZ, 0, eased),
        opacity: easeOutCubic(clamp01(t * 3)),
      };
    }

    case "macro-pan": {
      const p = clamp01(currentTime / clipDurationSec);
      const eased = easeInOutCubic(p);

      const zoom = lerp(1.25, 1.6, i);

      const panDistY = lerp(0.15, 0.35, i);
      const panDistX = lerp(0.08, 0.20, i);

      const startY = -panDistY;
      const endY = panDistY;

      const startX = -panDistX;
      const endX = panDistX;

      const baseRotY = lerp(-55, -75, i) * DEG;
      const tiltY = lerp(baseRotY - (8 * DEG), baseRotY + (8 * DEG), eased);

      const tiltX = lerp(12 * DEG, 0 * DEG, eased);

      return {
        ...REST_MOCKUP_3D_MOTION,
        scale: zoom,

        posY: lerp(startY, endY, eased),

        posX: lerp(startX, endX, eased),

        rotY: tiltY,
        rotX: tiltX,

        rotZ: Math.sin(eased * Math.PI) * (lerp(0.5, 2.5, i) * DEG),

        opacity: 1,
      };
    }
    
    case "screen-glide": {
      const p = clamp01(currentTime / clipDurationSec);
      const eased = easeInOutCubic(p);

      const zoom = lerp(1.15, 1.5, i);
      const panDistY = lerp(0.08, 0.22, i);
      const panFromY = panDistY * 0.85;
      const panToY = -panDistY;
      const driftX = lerp(0.015, 0.05, i);
      const tiltY = lerp(3, 9, i) * DEG;
      const tiltX = lerp(1, 3.5, i) * DEG;

      return {
        ...REST_MOCKUP_3D_MOTION,
        scale: zoom,
        posY: lerp(panFromY, panToY, eased),
        posX: Math.sin(eased * Math.PI) * driftX,
        rotY: lerp(tiltY, -tiltY, eased),
        rotX: lerp(-tiltX, tiltX, eased),
        opacity: 1,
      };
    }

    case "float-hold": {
      const p = clamp01(currentTime / clipDurationSec);
      const env = Math.min(1, Math.min(p / 0.15, (1 - p) / 0.15) * 4);
      const envelope = clamp01(env);
      const zoomEnd = lerp(1.06, 1.2, i);
      const zoom = lerp(1, zoomEnd, easeInOutCubic(p));

      const w = Math.PI * lerp(0.35, 0.6, i);
      const ampX = lerp(0.015, 0.05, i) * envelope;
      const ampY = lerp(0.012, 0.04, i) * envelope;
      const ampRotY = lerp(2.5, 8, i) * DEG * envelope;
      const ampRotX = lerp(1.5, 5, i) * DEG * envelope;

      return {
        ...REST_MOCKUP_3D_MOTION,
        scale: zoom,
        posX: Math.sin(currentTime * w) * ampX,
        posY: Math.cos(currentTime * w * 0.75) * ampY,
        rotY: Math.sin(currentTime * w * 0.8) * ampRotY,
        rotX: Math.cos(currentTime * w * 0.6) * ampRotX,
        rotZ: Math.sin(currentTime * w * 0.5) * ampRotX * 0.3,
        opacity: 1,
      };
    }

    case "spiral-drop": {
      const dur = Math.min(speedToDurationSec(speed) * 1.1, clipDurationSec);
      const startAt = Math.max(0, clipDurationSec - dur);
      const t = clamp01((currentTime - startAt) / dur);
      const eased = easeOutQuint(t);

      const dropY = lerp(-0.15, -0.5, i);
      const spinZ = lerp(45, 120, i) * DEG;
      const spinY = lerp(20, 60, i) * DEG;
      const spinX = lerp(10, 40, i) * DEG;
      const scaleDown = lerp(0.85, 0.5, i);

      return {
        ...REST_MOCKUP_3D_MOTION,
        posY: lerp(0, dropY, eased),
        rotZ: lerp(0, spinZ, eased),
        rotY: lerp(0, spinY, eased),
        rotX: lerp(0, spinX, eased),
        scale: lerp(1, scaleDown, eased),
        opacity: lerp(1, 0, eased),
      };
    }

    default:
      return REST_MOCKUP_3D_MOTION;
  }
}

const ENTRANCE_EXIT_PADDING = 1.4;
const DEFAULT_CONTINUOUS_DURATION = 3;

const SMALL_DURATION_PRESETS_3D = new Set<Mockup3DMotionPresetId>(["orbit-entrance"]);

const LONG_DURATION_PRESETS_3D = new Set<Mockup3DMotionPresetId>([
  "macro-pan",
  "screen-glide",
  "float-hold",
]);

export function getDefault3DFragmentDuration(
  presetId: Mockup3DMotionPresetId,
  speed: number
): number {
  if (LONG_DURATION_PRESETS_3D.has(presetId)) {
    return lerp(10, 6.0, clamp01(speed / 100));
  }

  if (SMALL_DURATION_PRESETS_3D.has(presetId)) {
    return lerp(6, 3.5, clamp01(speed / 100));
  }

  const category = get3DMotionPresetCategory(presetId);

  if (category === "Entrance" || category === "Exit") {
    return speedToDurationSec(speed) * ENTRANCE_EXIT_PADDING;
  }

  return DEFAULT_CONTINUOUS_DURATION;
}

export interface Mockup3DMotionCustomOffsets {
  positionX: number;
  positionY: number;
  zoomMultiplier: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  reverse: boolean;
}

export const DEFAULT_3D_MOTION_CUSTOM_OFFSETS: Mockup3DMotionCustomOffsets = {
  positionX: 0,
  positionY: 0,
  zoomMultiplier: 1,
  rotateX: 0,
  rotateY: 0,
  rotateZ: 0,
  reverse: false,
};

export function get3DMotionPresetCategory(
  id: Mockup3DMotionPresetId
): (typeof MOCKUP_3D_MOTION_PRESETS)[number]["category"] {
  return MOCKUP_3D_MOTION_PRESETS.find((p) => p.id === id)?.category ?? "Continue";
}

function apply3DMotionCustomOffsets(
  base: Mockup3DMotionTransform,
  custom: Mockup3DMotionCustomOffsets | undefined
): Mockup3DMotionTransform {
  if (!custom) return base;

  const sign = custom.reverse ? -1 : 1;

  return {
    ...base,
    scale: base.scale * custom.zoomMultiplier,
    posX: base.posX * sign + custom.positionX,
    posY: base.posY * sign + custom.positionY,
    rotX: base.rotX * sign + custom.rotateX * DEG,
    rotY: base.rotY * sign + custom.rotateY * DEG,
    rotZ: base.rotZ * sign + custom.rotateZ * DEG,
  };
}

export interface Mockup3DMotionFragment extends Mockup3DMotionConfig {
  id: string;
  startTime: number;
  endTime: number;
  custom3D?: Mockup3DMotionCustomOffsets;
}

export function sample3DFragmentMotion(
  fragment: Mockup3DMotionFragment,
  currentTime: number
): Mockup3DMotionTransform {
  if (currentTime < fragment.startTime || currentTime > fragment.endTime) {
    return REST_MOCKUP_3D_MOTION;
  }

  const localTime = currentTime - fragment.startTime;
  const localDuration = fragment.endTime - fragment.startTime;

  const base = sampleMockup3DMotion(
    { presetId: fragment.presetId, intensity: fragment.intensity, speed: fragment.speed },
    localTime,
    localDuration
  );

  return apply3DMotionCustomOffsets(base, fragment.custom3D);
}

export function sampleCombined3DMotion(
  fragments: Mockup3DMotionFragment[],
  currentTime: number
): Mockup3DMotionTransform {
  const active = fragments.filter(
    (f) => currentTime >= f.startTime && currentTime <= f.endTime
  );

  if (active.length === 0) return REST_MOCKUP_3D_MOTION;

  return active.reduce<Mockup3DMotionTransform>(
    (acc, fragment) => {
      const t = sample3DFragmentMotion(fragment, currentTime);
      return {
        rotX: acc.rotX + t.rotX,
        rotY: acc.rotY + t.rotY,
        rotZ: acc.rotZ + t.rotZ,
        posX: acc.posX + t.posX,
        posY: acc.posY + t.posY,
        posZ: acc.posZ + t.posZ,
        scale: acc.scale * t.scale,
        opacity: acc.opacity * t.opacity,
      };
    },
    { ...REST_MOCKUP_3D_MOTION }
  );
}

export function findValid3DMotionPlacement(
  presetId: Mockup3DMotionPresetId,
  speed: number,
  hintTime: number,
  existingFragments: Mockup3DMotionFragment[],
  clipDurationSec: number
): { startTime: number; endTime: number } | null {
  const duration = Math.min(getDefault3DFragmentDuration(presetId, speed), clipDurationSec);
  if (duration <= 0 || clipDurationSec <= 0) return null;

  const category = get3DMotionPresetCategory(presetId);
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
