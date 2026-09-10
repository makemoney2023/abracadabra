import { hexToRgba } from "@/lib/utils";
import { drawWifiIcon } from "@/lib/canvas-icons";
import type { MockupCanvasContext, MockupDrawResult } from "./types";
import { drawRoundedRectPath, drawMockupShadow } from "./shared";

export function drawGlassFullMockup(context: MockupCanvasContext): MockupDrawResult {
  const { ctx, x, y, width, height, config, cornerRadius, shadowBlur } = context;

  const isDark = config.darkMode;
  const frameColor = isDark ? config.frameColor : "#ffffff";
  const headerOpacity = config.headerOpacity ?? 10;
  const headerScale = (config.headerScale || 100) / 100;

  const framePadding = 12 * headerScale;
  const buttonWidth = 5 * headerScale; 
  
  const notchTop = 8 * headerScale; 
  const notchWidth = 104 * headerScale; 
  const notchHeight = 24 * headerScale; 
  const notchPaddingX = 8 * headerScale; 
  const dotSize = 8 * headerScale; 

  const statusBarHeight = 32 * headerScale; 
  const statusBarPaddingX = 28 * headerScale; 
  const timeFontSize = 10 * headerScale; 
  const signalBarWidth = 2 * headerScale; 
  const iconsGap = 6 * headerScale; 
  const wifiSize = 12 * headerScale; 
  const batteryWidth = 18 * headerScale; 
  const batteryHeight = 10 * headerScale; 

  const contentPaddingTop = 40 * headerScale; 

  const homeIndicatorWidth = 128 * headerScale; 
  const homeIndicatorHeight = 4 * headerScale; 
  const homeIndicatorBottom = 8 * headerScale; 

  const screenBg = isDark ? "#0a0a0a" : "#f9f9f9";
  const frameBorderColor = isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(255, 255, 255, 0.3)";
  const screenBorderColor = isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)";
  const notchBg = isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.05)";
  const statusBarText = isDark ? "rgba(255, 255, 255, 0.8)" : "rgba(0, 0, 0, 0.6)";
  const statusBarTextDim = isDark ? "rgba(255, 255, 255, 0.4)" : "rgba(0, 0, 0, 0.2)";
  const homeIndicatorBg = isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)";
  
  const buttonBg = isDark ? "rgba(255, 255, 255, 0.25)" : "#ffffff";
  const buttonBorderColor = isDark ? "rgba(255, 255, 255, 0.4)" : "#e5e5e5";
  const buttonShadowColor = isDark ? "rgba(0, 0, 0, 0.5)" : "rgba(0, 0, 0, 0.2)";

  const outerRadius = cornerRadius * 2.8;

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

    ctx.fillStyle = buttonBg;
    ctx.save();
    ctx.shadowColor = buttonShadowColor;
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = buttonBorderColor;
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  drawButton(0.15, 0.05, true); 
  drawButton(0.25, 0.12, true); 
  drawButton(0.28, 0.14, false); 
  ctx.restore();

  ctx.save();
  drawRoundedRectPath(ctx, x, y, width, height, outerRadius);
  ctx.fillStyle = hexToRgba(frameColor, headerOpacity);
  ctx.fill();
  ctx.strokeStyle = frameBorderColor;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  const screenX = x + framePadding;
  const screenY = y + framePadding;
  const screenWidth = width - framePadding * 2;
  const screenHeight = height - framePadding * 2;
  
  const innerRadius = cornerRadius * 2.3;

  ctx.save();
  drawRoundedRectPath(ctx, screenX, screenY, screenWidth, screenHeight, innerRadius);
  ctx.fillStyle = screenBg;
  ctx.fill();
  ctx.strokeStyle = screenBorderColor;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  const dynamicIslandX = screenX + (screenWidth - notchWidth) / 2;
  const dynamicIslandY = screenY + notchTop;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.05)";
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 1;
  drawRoundedRectPath(ctx, dynamicIslandX, dynamicIslandY, notchWidth, notchHeight, notchHeight / 2);
  ctx.fillStyle = notchBg;
  ctx.fill();
  ctx.restore();

  const dotCenterY = dynamicIslandY + notchHeight / 2;
  
  ctx.beginPath();
  ctx.arc(dynamicIslandX + notchPaddingX + dotSize / 2, dotCenterY, dotSize / 2, 0, Math.PI * 2);
  ctx.fillStyle = "#737373"; 
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#404040"; 
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(dynamicIslandX + notchWidth - notchPaddingX - dotSize / 2, dotCenterY, dotSize / 2, 0, Math.PI * 2);
  ctx.fillStyle = "#6366f1"; 
  ctx.save();
  ctx.shadowColor = "#6366f1";
  ctx.shadowBlur = 2; 
  ctx.fill();
  ctx.restore();

  const statusBarCenterY = screenY + statusBarHeight / 2;
  const rightEdgeX = screenX + screenWidth - statusBarPaddingX;

  const timeX = screenX + statusBarPaddingX;
  ctx.save();
  ctx.font = `bold ${timeFontSize}px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = statusBarText;
  ctx.textBaseline = "middle";
  ctx.fillText("9:41", timeX, statusBarCenterY + 1);
  ctx.restore();

  const batteryX = rightEdgeX - batteryWidth;
  const batteryY = statusBarCenterY - batteryHeight / 2;
  
  ctx.save();
  drawRoundedRectPath(ctx, batteryX, batteryY, batteryWidth, batteryHeight, 2);
  ctx.strokeStyle = statusBarTextDim;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = statusBarText;
  const batPadding = 1;
  const batInnerW = (batteryWidth - batPadding * 2) * 0.7;
  const batInnerH = batteryHeight - batPadding * 2;
  drawRoundedRectPath(ctx, batteryX + batPadding, batteryY + batPadding, batInnerW, batInnerH, 1);
  ctx.fill();

  ctx.fillStyle = statusBarTextDim;
  const nipW = 1.5;
  const nipH = batteryHeight * 0.4;
  const nipY = statusBarCenterY - nipH / 2;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(batteryX + batteryWidth + 0.5, nipY, nipW, nipH, [0, 2, 2, 0]);
  } else {
    ctx.fillRect(batteryX + batteryWidth + 0.5, nipY, nipW, nipH);
  }
  ctx.fill();
  ctx.restore();

  const wifiX = batteryX - iconsGap - wifiSize;
  const wifiY = statusBarCenterY - wifiSize / 2;
  drawWifiIcon(ctx, wifiX, wifiY, wifiSize, statusBarText);

  const signalGroupWidth = (signalBarWidth * 4) + 3; 
  const signalX = wifiX - iconsGap - signalGroupWidth;
  const signalMaxH = batteryHeight * 0.8;
  const signalBaseY = statusBarCenterY + signalMaxH / 2;

  ctx.save();
  const barScales = [0.4, 0.6, 0.8, 1.0];
  barScales.forEach((scale, i) => {
    const bH = signalMaxH * scale;
    const bX = signalX + i * (signalBarWidth + 1);
    const bY = signalBaseY - bH;
    
    ctx.fillStyle = i === 3 ? statusBarTextDim : statusBarText;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(bX, bY, signalBarWidth, bH, 0.5);
    } else {
      ctx.fillRect(bX, bY, signalBarWidth, bH);
    }
    ctx.fill();
  });
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