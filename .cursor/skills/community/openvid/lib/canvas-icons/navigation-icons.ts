export function drawChevronLeft(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = size * 0.12;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const s = size;
    ctx.moveTo(x + s * 0.6, y + s * 0.25);
    ctx.lineTo(x + s * 0.35, y + s * 0.5);
    ctx.lineTo(x + s * 0.6, y + s * 0.75);
    ctx.stroke();
    ctx.restore();
}

export function drawChevronRight(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = size * 0.12;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const s = size;
    ctx.moveTo(x + s * 0.4, y + s * 0.25);
    ctx.lineTo(x + s * 0.65, y + s * 0.5);
    ctx.lineTo(x + s * 0.4, y + s * 0.75);
    ctx.stroke();
    ctx.restore();
}

export function drawMenuIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = size * 0.08;
    ctx.lineCap = "round";
    const s = size;
    
    const lineY1 = y + s * 0.25;
    const lineY2 = y + s * 0.5;
    const lineY3 = y + s * 0.75;
    const lineStartX = x + s * 0.2;
    const lineEndX = x + s * 0.8;
    
    ctx.beginPath();
    ctx.moveTo(lineStartX, lineY1);
    ctx.lineTo(lineEndX, lineY1);
    ctx.moveTo(lineStartX, lineY2);
    ctx.lineTo(lineEndX, lineY2);
    ctx.moveTo(lineStartX, lineY3);
    ctx.lineTo(lineEndX, lineY3);
    ctx.stroke();
    ctx.restore();
}
