import { useControls } from "leva";
import { useEffect } from "react";

export type EnvironmentPreset = "sunset" | "dawn" | "night" | "warehouse" | "forest" | "apartment" | "studio" | "city" | "park" | "lobby";

interface ViewerControlsOptions {
    defaultEnvironment?: EnvironmentPreset;
    defaultGlow?: number;
}

export const HDRI_FILES: Record<EnvironmentPreset, string> = {
    apartment: "/hdri/lebombo_1k.hdr",
    city: "/hdri/potsdamer_platz_1k.hdr",
    dawn: "/hdri/kiara_1_dawn_1k.hdr",
    forest: "/hdri/forest_slope_1k.hdr",
    lobby: "/hdri/st_fagans_interior_1k.hdr",
    night: "/hdri/dikhololo_night_1k.hdr",
    park: "/hdri/rooitou_park_1k.hdr",
    studio: "/hdri/studio_small_03_1k.hdr",
    sunset: "/hdri/venice_sunset_1k.hdr",
    warehouse: "/hdri/empty_warehouse_01_1k.hdr",
};

export const ENVIRONMENT_OPTIONS = [
  "sunset", "dawn", "night", "warehouse", "forest",
  "apartment", "studio", "city", "park", "lobby",
] as const;

export function sphericalCameraPos(
  rotX: number,
  rotY: number,
  radius = 1.5
): [number, number, number] {
  const DEG = Math.PI / 180;
  const phi = Math.PI / 2 - rotX * DEG;
  const theta = rotY * DEG;
  const x = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.cos(theta);
  return [x, y, z];
}

export interface Viewer3DControls {
    autoRotate: boolean;
    rotationSpeed: number;
    glow: number;
    environment: EnvironmentPreset;
}

export function ViewerControls3D({ defaultEnvironment = "studio", defaultGlow = 1.0 }: ViewerControlsOptions = {}): Viewer3DControls {
  const [controls, set] = useControls("Configuration 3D", () => ({
    autoRotate: false,
    rotationSpeed: { value: 3.5, min: 0.1, max: 10, step: 0.1 },
    glow: { value: defaultGlow, min: 0.0, max: 5.0, step: 0.1 },
    environment: { options: ENVIRONMENT_OPTIONS, value: defaultEnvironment }
  }));
  useEffect(() => {
    set({ environment: defaultEnvironment, glow: defaultGlow });
  }, [defaultEnvironment, defaultGlow, set]);
  return controls as Viewer3DControls;
}