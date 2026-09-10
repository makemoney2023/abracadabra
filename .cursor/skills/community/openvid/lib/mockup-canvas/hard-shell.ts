import type { MockupCanvasContext, MockupDrawResult } from "./types";
import { drawRoundedRectPath, drawMockupShadow } from "./shared";

export function drawHardShellMockup(context: MockupCanvasContext): MockupDrawResult {
    const { ctx, x, y, width, height, config, cornerRadius, shadowBlur } = context;

    const isDark = config.darkMode;
    const frameColor = isDark ? (config.frameColor || "#27272a") : "#ffffff";
    const headerScale = (config.headerScale || 100) / 100;

    const buttonWidth = 5 * headerScale; 
    const outerPadding = 6 * headerScale; 
    const bezelPadding = 4 * headerScale;
    const cameraTop = 10 * headerScale;
    const cameraSize = 14 * headerScale;
    const cameraLensSize = 5 * headerScale;
    const statusBarHeight = 32 * headerScale;
    const statusBarPaddingX = 16 * headerScale;
    const timeFontSize = 12 * headerScale;
    const networkFontSize = 10 * headerScale;
    const signalBarWidth = 3 * headerScale;
    const batteryWidth = 22 * headerScale;
    const batteryHeight = 11 * headerScale; 
    const contentPaddingTop = 44 * headerScale;
    const homeIndicatorWidth = 112 * headerScale;
    const homeIndicatorHeight = 6 * headerScale;
    const homeIndicatorBottom = 8 * headerScale;

    const screenBg = isDark ? "#000000" : "#f8fafc";
    const textColor = isDark ? "#ffffff" : "#000000";
    const frameBorderColor = isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.2)";
    const homeIndicatorBg = isDark ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.2)";
    
    const buttonBgColor = isDark ? "rgba(255, 255, 255, 0.15)" : "#ffffff";
    const buttonBorderColor = isDark ? "rgba(255, 255, 255, 0.2)" : "#e5e5e5";

    const outerRadius = cornerRadius * 1.7;

    drawMockupShadow(ctx, x, y, width, height, outerRadius, shadowBlur);

    ctx.save();
    const drawButton = (percentY: number, percentH: number, isLeft: boolean) => {
        const btnW = buttonWidth;
        const btnR = 2 * headerScale;
        const overlap = 1;
        const btnY = y + (height * percentY);
        const btnH = height * percentH;

        ctx.beginPath();
        if (isLeft) {
            const btnX = x - btnW;
            ctx.moveTo(btnX + btnW + overlap, btnY);
            ctx.lineTo(btnX + btnR, btnY);
            ctx.arcTo(btnX, btnY, btnX, btnY + btnR, btnR);
            ctx.lineTo(btnX, btnY + btnH - btnR);
            ctx.arcTo(btnX, btnY + btnH, btnX + btnR, btnY + btnH, btnR);
            ctx.lineTo(btnX + btnW + overlap, btnY + btnH);
        } else {
            const btnX = x + width;
            ctx.moveTo(btnX - overlap, btnY);
            ctx.lineTo(btnX + btnW - btnR, btnY);
            ctx.arcTo(btnX + btnW, btnY, btnX + btnW, btnY + btnR, btnR);
            ctx.lineTo(btnX + btnW, btnY + btnH - btnR);
            ctx.arcTo(btnX + btnW, btnY + btnH, btnX + btnW - btnR, btnY + btnH, btnR);
            ctx.lineTo(btnX - overlap, btnY + btnH);
        }

        ctx.fillStyle = buttonBgColor;
        ctx.fill();
        ctx.strokeStyle = buttonBorderColor;
        ctx.lineWidth = 1;
        ctx.stroke();
    };

    drawButton(0.18, 0.09, false);
    drawButton(0.31, 0.05, false);
    ctx.restore();

    ctx.save();
    drawRoundedRectPath(ctx, x, y, width, height, outerRadius);
    ctx.fillStyle = frameColor;
    ctx.fill();
    ctx.strokeStyle = frameBorderColor;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    const bezelX = x + outerPadding;
    const bezelY = y + outerPadding;
    const bezelWidth = width - (outerPadding * 2);
    const bezelHeight = height - (outerPadding * 2);
    const bezelRadius = cornerRadius * 1.2;

    ctx.save();
    drawRoundedRectPath(ctx, bezelX, bezelY, bezelWidth, bezelHeight, bezelRadius);
    ctx.fillStyle = "#000000";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    const screenX = bezelX + bezelPadding;
    const screenY = bezelY + bezelPadding;
    const screenWidth = bezelWidth - (bezelPadding * 2);
    const screenHeight = bezelHeight - (bezelPadding * 2);
    const screenRadius = cornerRadius * 0.8;

    ctx.save();
    drawRoundedRectPath(ctx, screenX, screenY, screenWidth, screenHeight, screenRadius);
    ctx.fillStyle = screenBg;
    ctx.fill();
    ctx.restore();

    const camCenterX = screenX + screenWidth / 2;
    const camCenterY = screenY + cameraTop + cameraSize / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(camCenterX, camCenterY, cameraSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = "#000000";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(camCenterX, camCenterY, cameraLensSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(30, 58, 138, 0.6)";
    ctx.fill();
    ctx.restore();

    const timeX = screenX + statusBarPaddingX;
    const timeY = screenY + statusBarHeight / 2;

    ctx.save();
    ctx.font = `500 ${timeFontSize}px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = textColor;
    ctx.textBaseline = "middle";
    ctx.fillText("11:43", timeX, timeY + 1);
    ctx.restore();

    const batX = screenX + screenWidth - statusBarPaddingX - batteryWidth;
    const batY = timeY - batteryHeight / 2 + 1;

    ctx.save();
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    drawRoundedRectPath(ctx, batX, batY, batteryWidth, batteryHeight, 3 * headerScale);
    ctx.stroke();

    const batPad = 1.5 * headerScale;
    const fillWidth = (batteryWidth - batPad * 2) * 0.8;
    const fillHeight = batteryHeight - batPad * 2;
    ctx.fillStyle = textColor;
    ctx.beginPath();
    drawRoundedRectPath(ctx, batX + batPad, batY + batPad, fillWidth, fillHeight, 1 * headerScale);
    ctx.fill();
    ctx.restore();

    const sigGap = 1 * headerScale;
    const totalSigWidth = (signalBarWidth * 4) + (sigGap * 3);
    const sigX = batX - 4 * headerScale - totalSigWidth;
    const sigMaxHeight = 12 * headerScale;
    const sigYBottom = batY + batteryHeight;

    ctx.save();
    ctx.fillStyle = textColor;
    const sigPercents = [0.5, 0.65, 0.8, 1.0];
    for (let i = 0; i < 4; i++) {
        const h = sigMaxHeight * sigPercents[i];
        const barX = sigX + i * (signalBarWidth + sigGap);
        const barY = sigYBottom - h;
        drawRoundedRectPath(ctx, barX, barY, signalBarWidth, h, 1 * headerScale);
        ctx.fill();
    }
    ctx.restore();

    const text5G = "5G";
    ctx.save();
    ctx.font = `bold ${networkFontSize}px "Inter", sans-serif`;
    ctx.fillStyle = textColor;
    ctx.textBaseline = "middle";
    const textMetrics = ctx.measureText(text5G);
    const text5GX = sigX - 4 * headerScale - textMetrics.width;
    ctx.fillText(text5G, text5GX, timeY + 1);
    ctx.restore();

    const homeIndicatorX = screenX + (screenWidth - homeIndicatorWidth) / 2;
    const homeIndicatorY = screenY + screenHeight - homeIndicatorBottom - homeIndicatorHeight;

    ctx.save();
    drawRoundedRectPath(ctx, homeIndicatorX, homeIndicatorY, homeIndicatorWidth, homeIndicatorHeight, homeIndicatorHeight / 2);
    ctx.fillStyle = homeIndicatorBg;
    ctx.fill();
    ctx.restore();

    return {
        contentX: screenX,
        contentY: screenY + contentPaddingTop,
        contentWidth: screenWidth,
        contentHeight: screenHeight - contentPaddingTop,
    };
}