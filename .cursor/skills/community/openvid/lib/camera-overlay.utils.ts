import { getCameraLayout } from "@/types/camera.types";
import type { CameraConfig } from "@/types/camera.types";
import { drawRoundedRect } from "@/lib/canvas.utils";

export async function drawCameraOverlayToCtx(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    camVideo: HTMLVideoElement | null,
    mainVideo: HTMLVideoElement | null,
    cameraConfig: CameraConfig | null,
) {
    if (!camVideo || !cameraConfig || !cameraConfig.enabled) return;
    if (!camVideo.videoWidth || !camVideo.videoHeight) return;

    if (mainVideo && camVideo.paused) {
        const targetTime = Math.min(mainVideo.currentTime, Math.max(0, camVideo.duration - 0.1));
        if (Math.abs(camVideo.currentTime - targetTime) > 0.05) {
            try {
                camVideo.currentTime = targetTime;
                await new Promise<void>((resolve) => {
                    const timeoutId = setTimeout(() => {
                        camVideo.removeEventListener("seeked", onSeeked);
                        resolve();
                    }, 2000);
                    const onSeeked = () => {
                        camVideo.removeEventListener("seeked", onSeeked);
                        const checkReady = setInterval(() => {
                            if (camVideo.readyState >= 2) {
                                clearInterval(checkReady);
                                clearTimeout(timeoutId);
                                resolve();
                            }
                        }, 10);
                    };
                    camVideo.addEventListener("seeked", onSeeked);
                });
            } catch (e) {
                console.warn("Error en seek de la cámara:", e);
            }
        }
    }

    const { size, left: drawX, top: drawY } = getCameraLayout(cameraConfig, canvasWidth, canvasHeight);
    if (size <= 0) return;

    const shortSide = Math.min(canvasWidth, canvasHeight);
    const sizePercent = cameraConfig.size * 100;
    const sizeMultiplier = 0.5 + (sizePercent - 20) / 40;

    const srcShort = Math.min(camVideo.videoWidth, camVideo.videoHeight);
    const sx = (camVideo.videoWidth - srcShort) / 2;
    const sy = (camVideo.videoHeight - srcShort) / 2;

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = shortSide * 0.02;
    ctx.shadowOffsetY = shortSide * 0.008;

    if (cameraConfig.shape === "circle") {
        const centerX = drawX + size / 2;
        const centerY = drawY + size / 2;
        const radius = size / 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.clip();
    } else {
        const radius = cameraConfig.shape === "squircle"
            ? Math.round(85 * sizeMultiplier)
            : Math.round(6 * sizeMultiplier);
        drawRoundedRect(ctx, drawX, drawY, size, size, radius);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        drawRoundedRect(ctx, drawX, drawY, size, size, radius);
        ctx.clip();
    }

    if (camVideo.readyState >= 2) {
        if (cameraConfig.mirror) {
            ctx.translate(drawX + size, drawY);
            ctx.scale(-1, 1);
            ctx.drawImage(camVideo, sx, sy, srcShort, srcShort, 0, 0, size, size);
        } else {
            ctx.drawImage(camVideo, sx, sy, srcShort, srcShort, drawX, drawY, size, size);
        }
    }
    ctx.restore();
}