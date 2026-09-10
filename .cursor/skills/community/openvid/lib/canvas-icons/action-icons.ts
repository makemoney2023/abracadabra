export function drawPlusIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = size * 0.1;
    ctx.lineCap = "round";
    const s = size;

    ctx.beginPath();
    ctx.moveTo(x + s * 0.25, y + s * 0.5);
    ctx.lineTo(x + s * 0.75, y + s * 0.5);
    ctx.moveTo(x + s * 0.5, y + s * 0.25);
    ctx.lineTo(x + s * 0.5, y + s * 0.75);
    ctx.stroke();
    ctx.restore();
}

// candado
export function drawLockIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.save();

    ctx.globalAlpha = 0.6;

    const s = size;
    const scale = s / 24;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;

    const body = new Path2D("M6 22q-.825 0-1.412-.587T4 20V10q0-.825.588-1.412T6 8h1V6q0-2.075 1.463-3.537T12 1t3.538 1.463T17 6v2h1q.825 0 1.413.588T20 10v10q0 .825-.587 1.413T18 22zM9 8h6V6q0-1.25-.875-2.125T12 3t-2.125.875T9 6z");
    ctx.fill(body);

    ctx.globalCompositeOperation = 'destination-out';
    const hole = new Path2D("M13.413 16.413Q14 15.825 14 15t-.587-1.412T12 13t-1.412.588T10 15t.588 1.413T12 17t1.413-.587");
    ctx.fill(hole);

    ctx.restore();
}

export function drawStarIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    const cx = x + size / 2;
    const cy = y + size / 2;
    const outerR = size / 2;
    const innerR = outerR * 0.4;
    const points = 5;
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (i * Math.PI) / points - Math.PI / 2;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
}

// refresh
export function drawRefreshIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    const s = size;
    const scale = s / 24;
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.stroke(new Path2D("M19.933 13.041a8 8 0 1 1-9.925-8.788c3.899-1 7.935 1.007 9.425 4.747"));

    ctx.beginPath();
    ctx.stroke(new Path2D("M20 4v5h-5"));

    ctx.restore();
}

/**
 * Dibuja un icono de descarga (download)
 */
export function drawDownloadIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.save();
    const s = size;
    const scale = s / 24;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;

    ctx.fill(new Path2D("M16.59 9H15V4c0-.55-.45-1-1-1h-4c-.55 0-1 .45-1 1v5H7.41c-.89 0-1.34 1.08-.71 1.71l4.59 4.59c.39.39 1.02.39 1.41 0l4.59-4.59c.63-.63.19-1.71-.7-1.71M5 19c0 .55.45 1 1 1h12c.55 0 1-.45 1-1s-.45-1-1-1H6c-.55 0-1 .45-1 1"));

    ctx.restore();
}

/**
 * Dibuja un icono de subida (upload)
 */
export function drawUploadIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.save();
    const s = size;
    const scale = s / 24;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;

    ctx.fill(new Path2D("M10 16h4c.55 0 1-.45 1-1v-5h1.59c.89 0 1.34-1.08.71-1.71L12.71 3.7a.996.996 0 0 0-1.41 0L6.71 8.29c-.63.63-.19 1.71.7 1.71H9v5c0 .55.45 1 1 1m-4 2h12c.55 0 1 .45 1 1s-.45 1-1 1H6c-.55 0-1-.45-1-1s.45-1 1-1"));

    ctx.restore();
}

/**
 * Dibuja un icono de copiar (content-copy)
 */
export function drawCopyIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.save();

    const s = size;
    const scale = s / 24;
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.9;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(16, 3);
    ctx.lineTo(4, 3);
    ctx.lineTo(4, 16);
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(8, 7, 12, 12, 2);
    ctx.stroke();

    ctx.restore();
}

export function drawThreeDotsIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    const cx = x + size / 2;
    const r = size * 0.08;
    const positions = [y + size * 0.2, y + size / 2, y + size * 0.8];
    ctx.save();
    ctx.fillStyle = color;
    positions.forEach(py => {
        ctx.beginPath();
        ctx.arc(cx, py, r, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
}

export function drawWinButton(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    type: "minimize" | "maximize" | "close",
    color: string,
    scale: number,
    topRightRadius = 0
) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    const cx = x + w / 2;
    const cy = y + h / 2;
    const iconW = 9 * scale;
    const iconH = 9 * scale;

    if (type === "minimize") {
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(cx - iconW / 2, cy, iconW, 1 * scale);
        ctx.fill();
    } else if (type === "maximize") {
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - iconW / 2, cy - iconH / 2, iconW, iconH);
    } else {
        ctx.lineWidth = 1.2 * scale;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx - iconW / 2, cy - iconH / 2);
        ctx.lineTo(cx + iconW / 2, cy + iconH / 2);
        ctx.moveTo(cx + iconW / 2, cy - iconH / 2);
        ctx.lineTo(cx - iconW / 2, cy + iconH / 2);
        ctx.stroke();
    }
    ctx.restore();
}

export function drawBackIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.save();
    ctx.globalAlpha = 0.8; // Arrows tend to be slightly more opaque than the refresh icon
    const scale = size / 24;
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8; // Slightly thinner line for elegance
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.stroke(new Path2D("M19 12H5M12 19l-7-7 7-7"));

    ctx.restore();
}

export function drawForwardIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, disabled: boolean = true) {
    ctx.save();
    ctx.globalAlpha = disabled ? 0.35 : 0.8; 
    const scale = size / 24;
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.stroke(new Path2D("M5 12h14m-7 7l7-7-7-7"));

    ctx.restore();
}
