import type { MockupConfig } from "@/types/mockup.types";
import {
    type MockupDrawResult,
    drawMacosMockup,
    drawMacosGlassMockup,
    drawVSCodeMockup,
    drawIPhoneSlimMockup,
} from "./mockup-canvas";
import { drawMacosGhostMockup } from "./mockup-canvas/macos-ghost";
import { drawGlassUIContainerMockup } from "./mockup-canvas/glass-ui-container";
import { drawMacosGhostGlassMockup } from "./mockup-canvas/macos-ghost-glass";
import { drawMacosContainerGlassMockup } from "./mockup-canvas/macos-container-glass";
import { drawBraveMockup } from "./mockup-canvas/brave";
import { drawBraveGlassMockup } from "./mockup-canvas/brave-glass";
import { drawBrowserTabGlassMockup } from "./mockup-canvas/browser-tab-glass";
import { drawChromeMockup } from "./mockup-canvas/chrome";
import { drawChromeGlassMockup } from "./mockup-canvas/chrome-glass";
import { drawMacosDarkIdeMockup } from "./mockup-canvas/macos-dark-ide";
import { drawMacosGhostIdeMockup } from "./mockup-canvas/macos-ghost-ide";
import { drawGlassCurveMockup } from "./mockup-canvas/glass-curve";
import { drawGlassFullMockup } from "./mockup-canvas/glass-full";
import { drawHardShellMockup } from "./mockup-canvas/hard-shell";
import { drawS24UltraMockup } from "./mockup-canvas/s24-ultra";
import { drawOutlineMockup } from "./mockup-canvas/outline";
import { drawMacBookMockup } from "./mockup-canvas/macbook";

interface MockupCanvasContext {
    ctx: CanvasRenderingContext2D;
    x: number;
    y: number;
    width: number;
    height: number;
    config: MockupConfig;
    cornerRadius: number;
    shadowBlur: number;
}

export function drawMockupToCanvas(
    ctx: CanvasRenderingContext2D,
    mockupId: string,
    config: MockupConfig,
    x: number, y: number, width: number, height: number,
    cornerRadius: number,
    shadowBlur: number = 0,
    canvasWidth: number = 1920,
    canvasHeight: number = 1080
): MockupDrawResult {

    // Important: all mockup calculations are done in a 1280x720 space to maintain proportions, then scaled to the actual canvas size. This ensures the mockup design stays consistent regardless of canvas size or export resolution.
    const canvasLongSide = Math.max(canvasWidth, canvasHeight);
    const scale = (canvasLongSide / 1280) * 1.2;

    ctx.save();
    ctx.scale(scale, scale);

    const context: MockupCanvasContext = {
        ctx,
        x: x / scale,
        y: y / scale,
        width: width / scale,
        height: height / scale,
        config,
        cornerRadius: cornerRadius / scale,
        shadowBlur: shadowBlur / scale,
    };

    let rawResult: MockupDrawResult;

    switch (mockupId) {
        case "macos":
            rawResult = drawMacosMockup(context);
            break;
        case "macos-glass":
            rawResult = drawMacosGlassMockup(context);
            break;
        case "outline":
            rawResult = drawOutlineMockup(context);
            break;
        case "glass-ui-container":
            rawResult = drawGlassUIContainerMockup(context);
            break;
        case "macos-ghost":
            rawResult = drawMacosGhostMockup(context);
            break;
        case "macos-ghost-glass":
            rawResult = drawMacosGhostGlassMockup(context);
            break;
        case "macos-container-glass":
            rawResult = drawMacosContainerGlassMockup(context);
            break;
        case "brave":
            rawResult = drawBraveMockup(context);
            break;
        case "brave-glass":
            rawResult = drawBraveGlassMockup(context);
            break;
        case "browser-tab-glass":
            rawResult = drawBrowserTabGlassMockup(context);
            break;
        case "chrome":
            rawResult = drawChromeMockup(context);
            break;
        case "chrome-glass":
            rawResult = drawChromeGlassMockup(context);
            break;
        case "vscode":
            rawResult = drawVSCodeMockup(context);
            break;
        case "macos-dark-ide":
            rawResult = drawMacosDarkIdeMockup(context);
            break;
        case "macos-ghost-ide":
            rawResult = drawMacosGhostIdeMockup(context);
            break;
        case "iphone-slim":
            rawResult = drawIPhoneSlimMockup(context);
            break;
        case "glass-curve":
            rawResult = drawGlassCurveMockup(context);
            break;
        case "glass-full":
            rawResult = drawGlassFullMockup(context);
            break;
        case "hard-shell":
            rawResult = drawHardShellMockup(context);
            break;
        case "s24-ultra":
            rawResult = drawS24UltraMockup(context);
            break;
        case "macbook-photo":
            rawResult = drawMacBookMockup(context);
            break;
        default:
            rawResult = {
                contentX: x / scale,
                contentY: y / scale,
                contentWidth: width / scale,
                contentHeight: height / scale,
            };
    }

    ctx.restore();

    return {
        contentX: rawResult.contentX * scale,
        contentY: rawResult.contentY * scale,
        contentWidth: rawResult.contentWidth * scale,
        contentHeight: rawResult.contentHeight * scale,
        contentRadius: rawResult.contentRadius !== undefined
            ? rawResult.contentRadius * scale
            : undefined,
    };
}

