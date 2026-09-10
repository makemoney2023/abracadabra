import { hexToRgba } from "@/lib/utils";
import { drawWifiIcon, drawSignalBars, drawBattery } from "@/lib/canvas-icons";
import type { MockupCanvasContext, MockupDrawResult } from "./types";
import { drawRoundedRectPath, drawMockupShadow } from "./shared";

export function drawIPhoneSlimMockup(context: MockupCanvasContext): MockupDrawResult {
  const { ctx, x, y, width, height, config, cornerRadius, shadowBlur } = context;

  const isDark = config.darkMode;
  const frameColor = isDark ? config.frameColor : "#e5e5e5";
  const headerOpacity = config.headerOpacity ?? 100;
  const headerScale = (config.headerScale || 100) / 100;

  const framePadding = 4 * headerScale;
  const borderColor = isDark ? "#404040" : "#525252";
  const statusBarText = isDark ? "#ffffff" : "#000000";

  const outerRadius = cornerRadius * 1.8; 
  const statusBarHeight = 44 * headerScale;
  const dynamicIslandHeight = 24 * headerScale;
  const dynamicIslandTop = 10 * headerScale;
  const statusBarPaddingX = 24 * headerScale;
  const timeFontSize = 14 * headerScale;
  const iconStatusSize = 14 * headerScale;
  const batteryWidth = 24 * headerScale;
  const batteryHeight = 12 * headerScale;
  
  const buttonWidth = 5 * headerScale;
  const buttonRadius = 1.5 * headerScale;
  
  const homeIndicatorHeight = 4 * headerScale;
  const homeIndicatorBottom = 8 * headerScale;

  drawMockupShadow(ctx, x, y, width, height, outerRadius, shadowBlur);

  ctx.save();
  const drawButton = (percentY: number, percentH: number, isLeft: boolean) => {
    const btnW = buttonWidth;
    const btnR = buttonRadius;
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
    
    ctx.fillStyle = hexToRgba(frameColor, headerOpacity);
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  drawButton(0.15, 0.06, true);
  drawButton(0.24, 0.12, true);
  drawButton(0.28, 0.14, false);
  ctx.restore();

  ctx.save();
  drawRoundedRectPath(ctx, x, y, width, height, outerRadius);
  ctx.fillStyle = hexToRgba(frameColor, headerOpacity);
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  const screenX = x + framePadding;
  const screenY = y + framePadding;
  const screenWidth = width - framePadding * 2;
  const screenHeight = height - framePadding * 2;
  const innerRadius = Math.max(0, outerRadius - framePadding);

  ctx.save();
  drawRoundedRectPath(ctx, screenX, screenY, screenWidth, screenHeight, innerRadius);
  ctx.fillStyle = "#000000";
  ctx.fill();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  const dynamicIslandWidth = screenWidth * 0.32;
  const dynamicIslandX = screenX + (screenWidth - dynamicIslandWidth) / 2;
  const dynamicIslandY = screenY + dynamicIslandTop;

  ctx.save();
  drawRoundedRectPath(
    ctx,
    dynamicIslandX,
    dynamicIslandY,
    dynamicIslandWidth,
    dynamicIslandHeight,
    dynamicIslandHeight / 2
  );
  ctx.fillStyle = "#000000";
  ctx.fill();
  ctx.restore();

  const timeX = screenX + statusBarPaddingX;
  const timeY = screenY + (statusBarHeight / 2);

  ctx.save();
  ctx.font = `bold ${timeFontSize}px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = statusBarText;
  ctx.textBaseline = "middle";
  ctx.fillText("9:41", timeX, timeY);
  ctx.restore();

  const batteryX = screenX + screenWidth - statusBarPaddingX - batteryWidth;
  const batteryY = timeY - (batteryHeight / 2);
  drawBattery(ctx, batteryX, batteryY, batteryWidth, batteryHeight, statusBarText, 0.9);

  const wifiX = batteryX - iconStatusSize - (8 * headerScale);
  const wifiY = timeY - (iconStatusSize / 2);
  drawWifiIcon(ctx, wifiX, wifiY, iconStatusSize, statusBarText);

  const signalX = wifiX - iconStatusSize - (4 * headerScale);
  const signalY = timeY - (iconStatusSize / 2);
  drawSignalBars(ctx, signalX, signalY, iconStatusSize, statusBarText);

  const homeIndicatorWidth = screenWidth * 0.35;
  const homeIndicatorX = screenX + (screenWidth - homeIndicatorWidth) / 2;
  const homeIndicatorY = screenY + screenHeight - homeIndicatorBottom - homeIndicatorHeight;

  ctx.save();
  drawRoundedRectPath(
    ctx,
    homeIndicatorX,
    homeIndicatorY,
    homeIndicatorWidth,
    homeIndicatorHeight,
    homeIndicatorHeight / 2
  );
  ctx.fillStyle = `${statusBarText}15`;
  ctx.fill();
  ctx.restore();

  return {
    contentX: screenX,
    contentY: screenY + statusBarHeight,
    contentWidth: screenWidth,
    contentHeight: screenHeight - statusBarHeight - homeIndicatorBottom - homeIndicatorHeight,
  };
}