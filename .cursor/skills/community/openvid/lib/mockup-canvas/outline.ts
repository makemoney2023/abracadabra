import type { MockupCanvasContext, MockupDrawResult } from "./types";
import { drawRoundedRectPath, drawMockupShadow } from "./shared";

export function drawOutlineMockup(context: MockupCanvasContext): MockupDrawResult {
  const { ctx, x, y, width, height, config, cornerRadius, shadowBlur } = context;

  const isDark = config.darkMode;
  const screenBg = isDark ? "#0a0a0a" : "#ffffff";
  const frameColor = config.frameColor || (isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.15)");

  const offset = 8; 
  const innerRadius = cornerRadius * 1.5; 
  const outerRadius = innerRadius + offset;

  ctx.save();
  drawRoundedRectPath(ctx, x, y, width, height, outerRadius);
  ctx.strokeStyle = frameColor;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  const screenX = x + offset;
  const screenY = y + offset;
  const screenWidth = width - offset * 2;
  const screenHeight = height - offset * 2;

  drawMockupShadow(ctx, screenX, screenY, screenWidth, screenHeight, innerRadius, shadowBlur);

  ctx.save();
  drawRoundedRectPath(ctx, screenX, screenY, screenWidth, screenHeight, innerRadius);
  ctx.fillStyle = screenBg;
  ctx.fill();
  ctx.restore();

  return {
    contentX: screenX,
    contentY: screenY,
    contentWidth: screenWidth,
    contentHeight: screenHeight,
  };
}