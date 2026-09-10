export function drawWifiIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = size * 0.1;
    ctx.lineCap = "round";
    const s = size;
    const centerX = x + s * 0.5;
    const centerY = y + s * 0.7;
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, s * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    
    const arcs = [0.2, 0.35, 0.5];
    arcs.forEach(radius => {
        ctx.beginPath();
        ctx.arc(centerX, centerY, s * radius, Math.PI * 1.25, Math.PI * 1.75);
        ctx.stroke();
    });
    
    ctx.restore();
}

export function drawSignalBars(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.save();
    ctx.fillStyle = color;
    const s = size;
    const barWidth = s * 0.15;
    const gap = s * 0.08;
    const heights = [0.3, 0.5, 0.7, 1.0];
    
    const drawRoundedRectPath = (x: number, y: number, width: number, height: number, radius: number) => {
        const r = Math.min(radius, width / 2, height / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + width - r, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + r);
        ctx.lineTo(x + width, y + height - r);
        ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
        ctx.lineTo(x + r, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    };
    
    heights.forEach((h, i) => {
        const barHeight = s * h * 0.8;
        const barX = x + i * (barWidth + gap);
        const barY = y + s - barHeight - s * 0.1;
        drawRoundedRectPath(barX, barY, barWidth, barHeight, 1);
        ctx.fill();
    });
    
    ctx.restore();
}

/**
 * Dibuja una batería
 */
export function drawBattery(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string, fillPercent: number = 0.9) {
    ctx.save();
    
    const drawRoundedRectPath = (x: number, y: number, width: number, height: number, radius: number) => {
        const r = Math.min(radius, width / 2, height / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + width - r, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + r);
        ctx.lineTo(x + width, y + height - r);
        ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
        ctx.lineTo(x + r, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    };
    
    ctx.strokeStyle = color + "80";
    ctx.lineWidth = 1;
    drawRoundedRectPath(x, y, width, height, 2);
    ctx.stroke();
    
    ctx.fillStyle = color;
    const padding = 1.5;
    const fillWidth = (width - padding * 2) * fillPercent;
    drawRoundedRectPath(x + padding, y + padding, fillWidth, height - padding * 2, 1);
    ctx.fill();
    
    ctx.fillStyle = color + "50";
    const capWidth = 2;
    const capHeight = height * 0.4;
    ctx.fillRect(x + width, y + (height - capHeight) / 2, capWidth, capHeight);
    
    ctx.restore();
}
