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

export function drawMacosGhostMockup(context: MockupCanvasContext): MockupDrawResult {
    const { ctx, x, y, width, height, config, cornerRadius, shadowBlur } = context;
    const isDark = config.darkMode;
    const frameColor = config.frameColor;
    const url = config.url || "https://openvid.dev";
    const headerOpacity = config.headerOpacity ?? 100;

    const headerScale = (config.headerScale || 100) / 100;

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

    drawMockupShadow(ctx, x, y, width, height, cornerRadius, shadowBlur);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y + headerHeight);
    ctx.lineTo(x + width, y + headerHeight);
    ctx.lineTo(x + width, y + height - cornerRadius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - cornerRadius, y + height);
    ctx.lineTo(x + cornerRadius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - cornerRadius);
    ctx.closePath();
    ctx.fillStyle = bgColor;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + cornerRadius, y);
    ctx.lineTo(x + width - cornerRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + cornerRadius);
    ctx.lineTo(x + width, y + headerHeight);
    ctx.lineTo(x, y + headerHeight);
    ctx.lineTo(x, y + cornerRadius);
    ctx.quadraticCurveTo(x, y, x + cornerRadius, y);
    ctx.closePath();
    ctx.fillStyle = hexToRgba(frameColor, headerOpacity);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + headerHeight);
    ctx.lineTo(x + width, y + headerHeight);
    ctx.stroke();
    ctx.restore();

    const buttonY = y + (headerHeight - buttonSize) / 2;
    [0, 1, 2].forEach((i) => {
        const btnX = x + buttonLeftPadding + i * (buttonSize + buttonGap);
        ctx.save();
        ctx.beginPath();
        ctx.arc(btnX + buttonSize / 2, buttonY + buttonSize / 2, buttonSize / 2, 0, Math.PI * 2);
        ctx.strokeStyle = isDark ? "rgba(180,180,180,0.4)" : "rgba(150,150,150,0.6)";
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.restore();
    });

    const navStartX = x + buttonLeftPadding + 3 * (buttonSize + buttonGap) + buttonGap * 2;
    const iconY = y + (headerHeight - iconSize) / 2;
    const navGap = 6 * headerScale;

    drawMenuIcon(ctx, navStartX, iconY, iconSize, iconColor);

    const chevronStartX = navStartX + iconSize + navGap;
    drawChevronLeft(ctx, chevronStartX, iconY, iconSize, iconColor);
    drawChevronRight(ctx, chevronStartX + iconSize + 6 * headerScale, iconY, iconSize, iconColor);

    const maxUrlBarWidth = 576 * headerScale;
    const urlBarWidth = Math.min(width * 0.5, maxUrlBarWidth);
    const urlBarX = x + (width - urlBarWidth) / 2;
    const urlBarY = y + (headerHeight - urlBarHeight) / 2;
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

    const copyIconX = x + width - iconsRightPadding - iconSize;
    const plusIconX = copyIconX - iconSize - iconGap;
    const uploadIconX = plusIconX - iconSize - iconGap;
    const downloadIconX = uploadIconX - iconSize - iconGap;

    drawCopyIcon(ctx, copyIconX, iconY, iconSize, iconColor);
    drawPlusIcon(ctx, plusIconX, iconY, iconSize, iconColor);
    drawUploadIcon(ctx, uploadIconX, iconY, iconSize, iconColor);
    drawDownloadIcon(ctx, downloadIconX, iconY, iconSize, iconColor);

    return {
        contentX: x,
        contentY: y + headerHeight,
        contentWidth: width,
        contentHeight: height - headerHeight,
    };
}
