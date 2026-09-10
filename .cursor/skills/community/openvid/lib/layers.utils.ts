import { CanvasElement, SvgElement, TextElement } from "@/types/canvas-elements.types";

export function buildLayerNames(elements: CanvasElement[]): Map<string, string> {
    const typeCounts = new Map<string, number>();
    for (const el of elements) {
        if (el.type !== "text") {
            const key = el.type === "image" ? "image" : (el as SvgElement).svgId || "forma";
            typeCounts.set(key, (typeCounts.get(key) ?? 0) + 1);
        }
    }
    const typeIndexes = new Map<string, number>();
    const names = new Map<string, string>();
    for (const el of elements) {
        if (el.type === "text") {
            names.set(el.id, (el as TextElement).content?.slice(0, 24) || "Texto");
        } else if (el.type === "image") {
            const idx = (typeIndexes.get("image") ?? 0) + 1;
            typeIndexes.set("image", idx);
            names.set(el.id, `Imagen-${idx}`);
        } else {
            const svgKey = (el as SvgElement).svgId || "forma";
            const total = typeCounts.get(svgKey) ?? 1;
            const idx = (typeIndexes.get(svgKey) ?? 0) + 1;
            typeIndexes.set(svgKey, idx);
            const base = svgKey.charAt(0).toUpperCase() + svgKey.slice(1);
            names.set(el.id, total > 1 ? `${base}-${idx}` : base);
        }
    }
    return names;
}

export function buildGroupNumbers(elements: CanvasElement[]): Map<string, number> {
    const map = new Map<string, number>();
    let n = 0;
    for (const el of elements) {
        if (el.groupId && !map.has(el.groupId)) map.set(el.groupId, ++n);
    }
    return map;
}

export const VIDEO_SENTINEL = "__video__";
export const MOBILE_QUERY = "(max-width: 639px)";

export function subscribeToMobileQuery(callback: () => void) {
    const mq = window.matchMedia(MOBILE_QUERY);
    mq.addEventListener("change", callback);
    return () => mq.removeEventListener("change", callback);
}
export function getIsMobileSnapshot() {
    return window.matchMedia(MOBILE_QUERY).matches;
}
export function getIsMobileServerSnapshot() {
    return false;
}