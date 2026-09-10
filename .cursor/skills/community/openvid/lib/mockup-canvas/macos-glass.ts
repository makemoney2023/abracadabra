import { hexToRgba } from "@/lib/utils";
import { deriveSearchBg } from "@/lib/color.utils";
import {
  drawChevronLeft,
  drawChevronRight,
  drawMenuIcon,
  drawLockIcon,
  drawRefreshIcon,
  drawDownloadIcon,
  drawUploadIcon,
  drawCopyIcon,
  drawPlusIcon,
} from "@/lib/canvas-icons";
import type { MockupCanvasContext, MockupDrawResult } from "./types";
import { drawRoundedRectPath, drawMockupShadow } from "./shared";

export function drawMacosGlassMockup(context: MockupCanvasContext): MockupDrawResult {
  const { ctx, x, y, width, height, config, cornerRadius, shadowBlur } = context;
  const isDark = config.darkMode;
  const frameColor = config.frameColor;
  const url = config.url || "https://openvid.dev";

  const headerOpacity = config.headerOpacity ?? 100;
  const headerScale = (config.headerScale || 100) / 100;

  const glassPadding = 8;
  const glassCornerRadius = cornerRadius;

  const headerHeight = 36 * headerScale;
  const buttonSize = 10 * headerScale;
  const buttonGap = 6 * headerScale;
  const buttonLeftPadding = 12 * headerScale;
  const urlBarHeight = 18 * headerScale;
  const fontSize = 11 * headerScale;
  const iconSize = 14 * headerScale;

  const bgColor = isDark ? "#262626" : "#ffffff";
  const borderColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
  const textColor = isDark ? "#cccccc" : "#555555";
  const iconColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)";

  const innerX = x + glassPadding;
  const innerY = y + glassPadding;
  const innerWidth = width - glassPadding * 2;
  const innerHeight = height - glassPadding * 2;
  const innerCornerRadius = Math.max(0, glassCornerRadius + 4);

  drawMockupShadow(ctx, innerX, innerY, innerWidth, innerHeight, innerCornerRadius, shadowBlur);

  ctx.save();
  drawRoundedRectPath(ctx, x, y, width, height, glassCornerRadius);
  ctx.moveTo(innerX + innerCornerRadius, innerY);
  ctx.lineTo(innerX + innerWidth - innerCornerRadius, innerY);
  ctx.quadraticCurveTo(innerX + innerWidth, innerY, innerX + innerWidth, innerY + innerCornerRadius);
  ctx.lineTo(innerX + innerWidth, innerY + innerHeight - innerCornerRadius);
  ctx.quadraticCurveTo(innerX + innerWidth, innerY + innerHeight, innerX + innerWidth - innerCornerRadius, innerY + innerHeight);
  ctx.lineTo(innerX + innerCornerRadius, innerY + innerHeight);
  ctx.quadraticCurveTo(innerX, innerY + innerHeight, innerX, innerY + innerHeight - innerCornerRadius);
  ctx.lineTo(innerX, innerY + innerCornerRadius);
  ctx.quadraticCurveTo(innerX, innerY, innerX + innerCornerRadius, innerY);
  ctx.closePath();

  const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0.45)');
  ctx.fillStyle = gradient;
  ctx.fill('evenodd');

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 0.5;

  ctx.beginPath();
  ctx.moveTo(x + glassCornerRadius, y);
  ctx.lineTo(x + width - glassCornerRadius, y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x, y + glassCornerRadius);
  ctx.lineTo(x, y + height - glassCornerRadius);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(innerX, innerY + headerHeight);
  ctx.lineTo(innerX + innerWidth, innerY + headerHeight);
  ctx.lineTo(innerX + innerWidth, innerY + innerHeight - innerCornerRadius);
  ctx.quadraticCurveTo(innerX + innerWidth, innerY + innerHeight, innerX + innerWidth - innerCornerRadius, innerY + innerHeight);
  ctx.lineTo(innerX + innerCornerRadius, innerY + innerHeight);
  ctx.quadraticCurveTo(innerX, innerY + innerHeight, innerX, innerY + innerHeight - innerCornerRadius);
  ctx.closePath();
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(innerX + innerCornerRadius, innerY);
  ctx.lineTo(innerX + innerWidth - innerCornerRadius, innerY);
  ctx.quadraticCurveTo(innerX + innerWidth, innerY, innerX + innerWidth, innerY + innerCornerRadius);
  ctx.lineTo(innerX + innerWidth, innerY + headerHeight);
  ctx.lineTo(innerX, innerY + headerHeight);
  ctx.lineTo(innerX, innerY + innerCornerRadius);
  ctx.quadraticCurveTo(innerX, innerY, innerX + innerCornerRadius, innerY);
  ctx.closePath();
  ctx.fillStyle = hexToRgba(frameColor, headerOpacity);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(innerX, innerY + headerHeight);
  ctx.lineTo(innerX + innerWidth, innerY + headerHeight);
  ctx.stroke();
  ctx.restore();

  const buttonY = innerY + (headerHeight - buttonSize) / 2;
  const buttons = [
    { color: "#FF5F56", border: "#E0443E" },
    { color: "#FFBD2E", border: "#DEA123" },
    { color: "#27C93F", border: "#1AAB29" },
  ];
  buttons.forEach((btn, i) => {
    const btnX = innerX + buttonLeftPadding + i * (buttonSize + buttonGap);
    ctx.save();
    ctx.beginPath();
    ctx.arc(btnX + buttonSize / 2, buttonY + buttonSize / 2, buttonSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = btn.color;
    ctx.fill();
    ctx.strokeStyle = btn.border;
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.restore();
  });

  const navStartX = innerX + buttonLeftPadding + 3 * (buttonSize + buttonGap) + buttonGap * 2;
  const iconY = innerY + (headerHeight - iconSize) / 2;
  const navGap = 6 * headerScale;
  drawMenuIcon(ctx, navStartX, iconY, iconSize, iconColor);
  const chevronStartX = navStartX + iconSize + navGap;
  drawChevronLeft(ctx, chevronStartX, iconY, iconSize, iconColor);
  drawChevronRight(ctx, chevronStartX + iconSize + 6 * headerScale, iconY, iconSize, iconColor);

  const maxUrlBarWidth = 576 * headerScale;
  const urlBarWidth = Math.min(innerWidth * 0.5, maxUrlBarWidth);
  const urlBarX = innerX + (innerWidth - urlBarWidth) / 2;
  const urlBarY = innerY + (headerHeight - urlBarHeight) / 2;
  const urlBarPadding = 8 * headerScale;
  const urlBarBgBase = deriveSearchBg(frameColor);

  ctx.save();
  drawRoundedRectPath(ctx, urlBarX, urlBarY, urlBarWidth, urlBarHeight, 4 * headerScale);
  ctx.fillStyle = hexToRgba(urlBarBgBase, headerOpacity);
  ctx.fill();
  ctx.restore();

  const lockIconSize = buttonSize;
  const lockIconX = urlBarX + urlBarPadding;
  const lockIconY = urlBarY + (urlBarHeight - lockIconSize) / 2;
  drawLockIcon(ctx, lockIconX, lockIconY, lockIconSize, iconColor + "99");

  ctx.save();
  ctx.font = `${fontSize}px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const displayUrl = url.replace(/^https?:\/\//, "").substring(0, 40);
  ctx.fillText(displayUrl, urlBarX + urlBarWidth / 2, urlBarY + urlBarHeight / 2);
  ctx.restore();

  const refreshIconSize = buttonSize;
  const refreshIconX = urlBarX + urlBarWidth - urlBarPadding - refreshIconSize;
  const refreshIconY = urlBarY + (urlBarHeight - refreshIconSize) / 2;
  drawRefreshIcon(ctx, refreshIconX, refreshIconY, refreshIconSize, iconColor + "99");

  const iconsRightPadding = 12 * headerScale;
  const iconGap = 10 * headerScale;
  const copyIconX = innerX + innerWidth - iconsRightPadding - iconSize;
  const plusIconX = copyIconX - iconSize - iconGap;
  const uploadIconX = plusIconX - iconSize - iconGap;
  const downloadIconX = uploadIconX - iconSize - iconGap;

  drawCopyIcon(ctx, copyIconX, iconY, iconSize, iconColor);
  drawPlusIcon(ctx, plusIconX, iconY, iconSize, iconColor);
  drawUploadIcon(ctx, uploadIconX, iconY, iconSize, iconColor);
  drawDownloadIcon(ctx, downloadIconX, iconY, iconSize, iconColor);

  return {
    contentX: innerX,
    contentY: innerY + headerHeight,
    contentWidth: innerWidth,
    contentHeight: innerHeight - headerHeight,
  };
}