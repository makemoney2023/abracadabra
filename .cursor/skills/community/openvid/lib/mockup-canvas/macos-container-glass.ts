import type { MockupCanvasContext, MockupDrawResult } from "./types";
import { drawRoundedRectPath, drawMockupShadow } from "./shared";

export function drawMacosContainerGlassMockup(context: MockupCanvasContext): MockupDrawResult {
    const { ctx, x, y, width, height, config, cornerRadius, shadowBlur } = context;

    const glassPadding = 12;
    const glassCornerRadius = cornerRadius;
    const innerCornerRadius = Math.max(0, glassCornerRadius + 4);

    drawMockupShadow(ctx, x, y, width, height, glassCornerRadius, shadowBlur);

    ctx.save();
    drawRoundedRectPath(ctx, x, y, width, height, glassCornerRadius);
    const grad = ctx.createLinearGradient(x, y + height, x + width, y); // 45deg
    grad.addColorStop(0, "rgba(255,255,255,0.3)");
    grad.addColorStop(1, "rgba(255,255,255,0.4)");
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x + glassCornerRadius, y + 0.375);
    ctx.lineTo(x + width - glassCornerRadius, y + 0.375);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + 0.375, y + glassCornerRadius);
    ctx.lineTo(x + 0.375, y + height - glassCornerRadius);
    ctx.stroke();

    ctx.restore();

    const innerX = x + glassPadding;
    const innerY = y + glassPadding;
    const innerWidth  = width  - glassPadding * 2;
    const innerHeight = height - glassPadding * 2;

    ctx.save();
    drawRoundedRectPath(ctx, innerX, innerY, innerWidth, innerHeight, innerCornerRadius);
    ctx.clip();
    ctx.restore();

    const headerScale    = (config.headerScale || 100) / 100;
    const dotSize        = 10 * headerScale;
    const dotGap         = 8 * headerScale;
    const headerPaddingX = 4 * headerScale;
    const headerPaddingB = 8 * headerScale;
    const headerHeight   = headerPaddingX + dotSize + headerPaddingB;

    const dotCenterY = innerY + headerPaddingX + dotSize / 2;
    [0, 1, 2].forEach((i) => {
        const dotCenterX = innerX + headerPaddingX + i * (dotSize + dotGap) + dotSize / 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(dotCenterX, dotCenterY, dotSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fill();
        ctx.restore();
    });

    return {
        contentX:      innerX,
        contentY:      innerY + headerHeight,
        contentWidth:  innerWidth,
        contentHeight: innerHeight - headerHeight,
    };
}