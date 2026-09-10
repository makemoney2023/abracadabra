import type { MockupConfig } from "@/types/mockup.types";

export interface MockupCanvasContext {
    ctx: CanvasRenderingContext2D;
    x: number;
    y: number;
    width: number;
    height: number;
    config: MockupConfig;
    cornerRadius: number;
    shadowBlur: number;
}

export interface MockupDrawResult {
    contentX: number;
    contentY: number;
    contentWidth: number;
    contentHeight: number;
    contentRadius?: number;
}
