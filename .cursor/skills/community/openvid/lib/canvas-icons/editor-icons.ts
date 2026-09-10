export function drawMagnifyIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = size * 0.1;
    ctx.lineCap = "round";
    const s = size;
    
    ctx.beginPath();
    ctx.arc(x + s * 0.42, y + s * 0.42, s * 0.25, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(x + s * 0.6, y + s * 0.6);
    ctx.lineTo(x + s * 0.8, y + s * 0.8);
    ctx.stroke();
    ctx.restore();
}

export function drawMinusIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = size * 0.1;
    ctx.lineCap = "round";
    const s = size;
    
    ctx.beginPath();
    ctx.moveTo(x + s * 0.25, y + s * 0.5);
    ctx.lineTo(x + s * 0.75, y + s * 0.5);
    ctx.stroke();
    ctx.restore();
}

export function drawSquareIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = size * 0.08;
    const s = size;
    
    ctx.beginPath();
    ctx.rect(x + s * 0.25, y + s * 0.25, s * 0.5, s * 0.5);
    ctx.stroke();
    ctx.restore();
}

export function drawCloseIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = size * 0.1;
    ctx.lineCap = "round";
    const s = size;
    
    ctx.beginPath();
    ctx.moveTo(x + s * 0.25, y + s * 0.25);
    ctx.lineTo(x + s * 0.75, y + s * 0.75);
    ctx.moveTo(x + s * 0.75, y + s * 0.25);
    ctx.lineTo(x + s * 0.25, y + s * 0.75);
    ctx.stroke();
    ctx.restore();
}

export function drawVSCodeLogo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    ctx.save();
    
    const scale = size / 128;
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    const pathDark = new Path2D("M123.471 13.82L97.097 1.12A7.97 7.97 0 0 0 88 2.668L1.662 81.387a5.333 5.333 0 0 0 .006 7.887l7.052 6.411a5.33 5.33 0 0 0 6.811.303l103.971-78.875c3.488-2.646 8.498-.158 8.498 4.22v-.306a8 8 0 0 0-4.529-7.208Z");
    ctx.fillStyle = "#0065a9";
    ctx.fill(pathDark);

    const pathMedium = new Path2D("m123.471 114.181l-26.374 12.698A7.97 7.97 0 0 1 88 125.333L1.662 46.613a5.333 5.333 0 0 1 .006-7.887l7.052-6.411a5.33 5.33 0 0 1 6.811-.303l103.971 78.874c3.488 2.647 8.498.159 8.498-4.219v.306a8 8 0 0 1-4.529 7.208");
    ctx.fillStyle = "#007acc";
    ctx.fill(pathMedium);

    const pathLight = new Path2D("M97.098 126.882A7.98 7.98 0 0 1 88 125.333c2.952 2.952 8 .861 8-3.314V5.98c0-4.175-5.048-6.266-8-3.313a7.98 7.98 0 0 1 9.098-1.549L123.467 13.8A8 8 0 0 1 128 21.01v85.982a8 8 0 0 1-4.533 7.21z");
    ctx.fillStyle = "#1f9cf0";
    ctx.fill(pathLight);

    const pathOverlay = new Path2D("M90.69 127.126a7.97 7.97 0 0 0 6.349-.244l26.353-12.681a8 8 0 0 0 4.53-7.21V21.009a8 8 0 0 0-4.53-7.21L97.039 1.12a7.97 7.97 0 0 0-9.093 1.548l-50.45 46.026l-21.974-16.68a5.33 5.33 0 0 0-6.807.302l-7.048 6.411a5.336 5.336 0 0 0-.006 7.888L20.718 64L1.662 81.386a5.335 5.335 0 0 0 .006 7.888l7.048 6.411a5.33 5.33 0 0 0 6.807.303l21.975-16.681l50.45 46.026a8 8 0 0 0 2.742 1.793m5.252-92.184L57.662 64l38.28 29.057z");
    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    ctx.fill(pathOverlay);

    ctx.restore();
}
